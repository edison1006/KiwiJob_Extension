from __future__ import annotations

from datetime import UTC, datetime
import hashlib
import hmac
import json
import time
from typing import Any, Iterable

import httpx
from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.config import Settings, get_settings
from app.models import StripeWebhookEvent, User


ACTIVE_SUBSCRIPTION_STATUSES = frozenset({"active", "trialing", "past_due"})


class StripeBillingError(RuntimeError):
    pass


def billing_configured(settings: Settings | None = None) -> bool:
    config = settings or get_settings()
    return all(
        (
            config.stripe_secret_key,
            config.stripe_webhook_secret,
            config.stripe_pro_price_id,
            config.stripe_premium_price_id,
        )
    )


def price_id_for_tier(tier: str, settings: Settings | None = None) -> str:
    config = settings or get_settings()
    price_id = config.stripe_pro_price_id if tier == "pro" else config.stripe_premium_price_id if tier == "premium" else None
    if not price_id:
        raise StripeBillingError("Billing is not configured for this plan")
    return price_id


def tier_for_price_id(price_id: str | None, settings: Settings | None = None) -> str | None:
    config = settings or get_settings()
    if price_id and price_id == config.stripe_pro_price_id:
        return "pro"
    if price_id and price_id == config.stripe_premium_price_id:
        return "premium"
    return None


def _stripe_post(path: str, data: dict[str, str] | Iterable[tuple[str, str]]) -> dict[str, Any]:
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise StripeBillingError("Billing is not configured")
    try:
        response = httpx.post(
            f"https://api.stripe.com/v1/{path.lstrip('/')}",
            auth=(settings.stripe_secret_key, ""),
            data=data,
            timeout=20,
        )
    except httpx.HTTPError as exc:
        raise StripeBillingError("The billing provider is temporarily unavailable") from exc
    if response.is_error:
        try:
            detail = response.json().get("error", {}).get("message")
        except (ValueError, AttributeError):
            detail = None
        raise StripeBillingError(str(detail or "The billing provider rejected the request"))
    return response.json()


def _configured_livemode() -> bool:
    return get_settings().stripe_secret_key.startswith("sk_live_")


def reconcile_stripe_mode(user: User, session: Session) -> bool:
    """Discard billing references that belong to the other Stripe mode."""
    if not user.stripe_customer_id or user.stripe_livemode == _configured_livemode():
        return False
    user.stripe_customer_id = None
    user.stripe_subscription_id = None
    user.stripe_livemode = None
    user.membership_tier = "free"
    user.membership_status = "inactive"
    user.membership_expires_at = None
    user.membership_cancel_at_period_end = False
    session.add(user)
    session.commit()
    return True


def ensure_stripe_customer(user: User, session: Session) -> str:
    livemode = _configured_livemode()
    reconcile_stripe_mode(user, session)
    if user.stripe_customer_id and user.stripe_livemode == livemode:
        return user.stripe_customer_id
    assert user.id is not None
    customer = _stripe_post(
        "customers",
        {
            "email": user.email,
            "name": user.display_name or user.email,
            "metadata[kiwijob_user_id]": str(user.id),
        },
    )
    customer_id = str(customer.get("id") or "")
    if not customer_id:
        raise StripeBillingError("The billing provider did not create a customer")
    user.stripe_customer_id = customer_id
    user.stripe_livemode = livemode
    session.add(user)
    session.commit()
    return customer_id


def create_checkout_session(user: User, tier: str, session: Session) -> str:
    settings = get_settings()
    if not billing_configured(settings):
        raise StripeBillingError("Billing is not configured")
    assert user.id is not None
    customer_id = ensure_stripe_customer(user, session)
    result = _stripe_post(
        "checkout/sessions",
        {
            "mode": "subscription",
            "customer": customer_id,
            "client_reference_id": str(user.id),
            "line_items[0][price]": price_id_for_tier(tier, settings),
            "line_items[0][quantity]": "1",
            "success_url": f"{settings.web_app_url.rstrip('/')}/premium?checkout=success",
            "cancel_url": f"{settings.web_app_url.rstrip('/')}/premium?checkout=cancelled",
            "allow_promotion_codes": "true",
            "metadata[kiwijob_user_id]": str(user.id),
            "metadata[kiwijob_tier]": tier,
            "subscription_data[metadata][kiwijob_user_id]": str(user.id),
            "subscription_data[metadata][kiwijob_tier]": tier,
        },
    )
    url = str(result.get("url") or "")
    if not url:
        raise StripeBillingError("The billing provider did not return a checkout URL")
    return url


def create_portal_session(user: User, session: Session) -> str:
    settings = get_settings()
    if not billing_configured(settings):
        raise StripeBillingError("Billing is not configured")
    customer_id = ensure_stripe_customer(user, session)
    result = _stripe_post(
        "billing_portal/sessions",
        {
            "customer": customer_id,
            "return_url": f"{settings.web_app_url.rstrip('/')}/premium",
        },
    )
    url = str(result.get("url") or "")
    if not url:
        raise StripeBillingError("The billing provider did not return a portal URL")
    return url


def verify_webhook_payload(payload: bytes, signature_header: str, *, tolerance_seconds: int = 300) -> dict[str, Any]:
    secret = get_settings().stripe_webhook_secret
    if not secret:
        raise HTTPException(status_code=503, detail="Billing webhook is not configured")
    values: dict[str, list[str]] = {}
    for part in signature_header.split(","):
        key, separator, value = part.partition("=")
        if separator:
            values.setdefault(key.strip(), []).append(value.strip())
    try:
        timestamp = int(values.get("t", [""])[0])
    except ValueError:
        timestamp = 0
    if not timestamp or abs(int(time.time()) - timestamp) > tolerance_seconds:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook timestamp")
    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, candidate) for candidate in values.get("v1", [])):
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature")
    try:
        event = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook payload") from exc
    if not isinstance(event, dict) or not event.get("id") or not event.get("type"):
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook event")
    return event


def _timestamp(value: Any) -> datetime | None:
    try:
        return datetime.fromtimestamp(int(value), UTC).replace(tzinfo=None) if value else None
    except (TypeError, ValueError, OSError):
        return None


def _subscription_period_end(subscription: dict[str, Any]) -> datetime | None:
    direct = _timestamp(subscription.get("current_period_end"))
    if direct:
        return direct
    items = subscription.get("items", {}).get("data", [])
    if isinstance(items, list) and items:
        return _timestamp(items[0].get("current_period_end"))
    return None


def _subscription_tier(subscription: dict[str, Any]) -> str | None:
    items = subscription.get("items", {}).get("data", [])
    if isinstance(items, list) and items:
        price = items[0].get("price") or {}
        priced_tier = tier_for_price_id(price.get("id"))
        if priced_tier:
            return priced_tier
    metadata = subscription.get("metadata") or {}
    declared = metadata.get("kiwijob_tier")
    return declared if declared in {"pro", "premium"} else None


def _find_event_user(session: Session, obj: dict[str, Any]) -> User | None:
    metadata = obj.get("metadata") or {}
    raw_user_id = metadata.get("kiwijob_user_id") or obj.get("client_reference_id")
    try:
        if raw_user_id:
            user = session.get(User, int(raw_user_id))
            if user:
                return user
    except (TypeError, ValueError):
        pass
    subscription_id = obj.get("subscription") if obj.get("object") != "subscription" else obj.get("id")
    if subscription_id:
        user = session.exec(select(User).where(User.stripe_subscription_id == str(subscription_id))).first()
        if user:
            return user
    customer_id = obj.get("customer")
    if customer_id:
        return session.exec(select(User).where(User.stripe_customer_id == str(customer_id))).first()
    return None


def process_webhook_event(event: dict[str, Any], session: Session) -> bool:
    event_id = str(event["id"])
    if session.exec(select(StripeWebhookEvent).where(StripeWebhookEvent.event_id == event_id)).first():
        return False
    event_type = str(event["type"])
    event_livemode = bool(event.get("livemode", False))
    obj = event.get("data", {}).get("object", {})
    if not isinstance(obj, dict):
        raise HTTPException(status_code=400, detail="Invalid Stripe event object")
    user = _find_event_user(session, obj)

    if user and event_type == "checkout.session.completed":
        user.stripe_customer_id = str(obj.get("customer") or user.stripe_customer_id or "") or None
        user.stripe_subscription_id = str(obj.get("subscription") or user.stripe_subscription_id or "") or None
        user.stripe_livemode = event_livemode
        session.add(user)

    if user and event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
        status = str(obj.get("status") or "inactive")
        tier = _subscription_tier(obj)
        user.stripe_customer_id = str(obj.get("customer") or user.stripe_customer_id or "") or None
        user.stripe_subscription_id = str(obj.get("id") or user.stripe_subscription_id or "") or None
        user.stripe_livemode = event_livemode
        user.membership_status = status
        user.membership_cancel_at_period_end = bool(obj.get("cancel_at_period_end"))
        if event_type == "customer.subscription.deleted" or status not in ACTIVE_SUBSCRIPTION_STATUSES or tier is None:
            user.membership_tier = "free"
            user.membership_expires_at = None
            if event_type == "customer.subscription.deleted":
                user.stripe_subscription_id = None
        else:
            user.membership_tier = tier
            user.membership_expires_at = _subscription_period_end(obj)
        session.add(user)

    session.add(StripeWebhookEvent(event_id=event_id, event_type=event_type))
    session.commit()
    return True
