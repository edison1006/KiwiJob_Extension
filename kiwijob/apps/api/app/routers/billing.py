from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlmodel import Session

from app.core.config import get_settings
from app.db.session import get_session
from app.deps import get_current_user
from app.models import User
from app.schemas import BillingCheckoutIn, BillingStatusOut, BillingUrlOut
from app.services.membership import effective_membership_tier
from app.services.rate_limit import enforce_rate_limit, monthly_ai_usage, user_rate_limit_key
from app.services.stripe_billing import (
    StripeBillingError,
    billing_configured,
    create_checkout_session,
    create_portal_session,
    process_webhook_event,
    reconcile_stripe_mode,
    verify_webhook_payload,
)


router = APIRouter(prefix="/billing", tags=["billing"])


def _billing_error(exc: StripeBillingError) -> HTTPException:
    return HTTPException(status_code=503, detail=str(exc))


@router.get("/status", response_model=BillingStatusOut)
def billing_status(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    reconcile_stripe_mode(user, session)
    settings = get_settings()
    tier = effective_membership_tier(user)
    return BillingStatusOut(
        tier=tier,
        status=user.membership_status,
        configured=billing_configured(settings),
        has_billing_account=bool(user.stripe_customer_id),
        has_subscription=bool(user.stripe_subscription_id),
        renews_at=user.membership_expires_at if tier != "free" else None,
        cancel_at_period_end=user.membership_cancel_at_period_end if tier != "free" else False,
        monthly_ai_used=monthly_ai_usage(session, user.id),
        monthly_ai_limit=getattr(settings, f"ai_{tier}_monthly_limit"),
    )


@router.post("/checkout", response_model=BillingUrlOut)
def billing_checkout(
    body: BillingCheckoutIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    reconcile_stripe_mode(user, session)
    enforce_rate_limit(
        session,
        action="billing_checkout",
        bucket_key=user_rate_limit_key(user.id),
        limit=10,
        window_seconds=60 * 60,
    )
    if user.stripe_subscription_id:
        raise HTTPException(status_code=409, detail="Manage plan changes in the billing portal")
    try:
        return BillingUrlOut(url=create_checkout_session(user, body.tier, session))
    except StripeBillingError as exc:
        raise _billing_error(exc) from exc


@router.post("/portal", response_model=BillingUrlOut)
def billing_portal(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    reconcile_stripe_mode(user, session)
    enforce_rate_limit(
        session,
        action="billing_portal",
        bucket_key=user_rate_limit_key(user.id),
        limit=20,
        window_seconds=60 * 60,
    )
    if not user.stripe_customer_id:
        raise HTTPException(status_code=404, detail="No billing account exists for this user")
    try:
        return BillingUrlOut(url=create_portal_session(user, session))
    except StripeBillingError as exc:
        raise _billing_error(exc) from exc


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(default="", alias="Stripe-Signature"),
    session: Session = Depends(get_session),
):
    payload = await request.body()
    event = verify_webhook_payload(payload, stripe_signature)
    processed = process_webhook_event(event, session)
    return {"received": True, "processed": processed}
