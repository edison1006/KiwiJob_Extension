from __future__ import annotations

from datetime import UTC, datetime
import hashlib
import hmac
import json
import time

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import Settings
from app.db.session import get_engine
from app.main import app
from app.models import User
from app.services.stripe_billing import ensure_stripe_customer, process_webhook_event, verify_webhook_payload
from conftest import auth_headers


def test_billing_status_reports_free_allowance() -> None:
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        response = client.get("/billing/status", headers=headers)
    assert response.status_code == 200
    assert response.json() == {
        "tier": "free",
        "status": "inactive",
        "configured": False,
        "has_billing_account": False,
        "has_subscription": False,
        "renews_at": None,
        "cancel_at_period_end": False,
        "monthly_ai_used": 0,
        "monthly_ai_limit": 20,
    }


def test_checkout_returns_provider_url(monkeypatch) -> None:
    monkeypatch.setattr("app.routers.billing.create_checkout_session", lambda user, tier, session: f"https://checkout.stripe.test/{tier}")
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        response = client.post("/billing/checkout", headers=headers, json={"tier": "premium"})
    assert response.status_code == 200
    assert response.json() == {"url": "https://checkout.stripe.test/premium"}


def test_checkout_rejects_unknown_tier() -> None:
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        response = client.post("/billing/checkout", headers=headers, json={"tier": "enterprise"})
    assert response.status_code == 422


def test_checkout_requires_portal_when_an_unpaid_subscription_exists(monkeypatch) -> None:
    settings = Settings(
        _env_file=None,
        stripe_secret_key="sk_live_example",
        stripe_webhook_secret="whsec_example",
        stripe_pro_price_id="price_pro",
        stripe_premium_price_id="price_premium",
    )
    monkeypatch.setattr("app.services.stripe_billing.get_settings", lambda: settings)
    monkeypatch.setattr("app.routers.billing.get_settings", lambda: settings)
    with TestClient(app) as client:
        headers, user_id = auth_headers(client)
        with Session(get_engine()) as session:
            user = session.get(User, user_id)
            assert user is not None
            user.membership_tier = "free"
            user.membership_status = "unpaid"
            user.stripe_livemode = True
            user.stripe_customer_id = "cus_live"
            user.stripe_subscription_id = "sub_unpaid"
            session.add(user)
            session.commit()

        status_response = client.get("/billing/status", headers=headers)
        checkout_response = client.post("/billing/checkout", headers=headers, json={"tier": "pro"})

    assert status_response.status_code == 200
    assert status_response.json()["status"] == "unpaid"
    assert status_response.json()["has_billing_account"] is True
    assert status_response.json()["has_subscription"] is True
    assert checkout_response.status_code == 409


def test_portal_requires_existing_billing_account() -> None:
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        response = client.post("/billing/portal", headers=headers)
    assert response.status_code == 404


def test_subscription_webhook_grants_and_revokes_membership() -> None:
    with Session(get_engine()) as session:
        user = User(email="billing@example.com", stripe_customer_id="cus_123")
        session.add(user)
        session.commit()
        session.refresh(user)
        assert user.id is not None

        active_event = {
            "id": "evt_active",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "object": "subscription",
                    "id": "sub_123",
                    "customer": "cus_123",
                    "status": "active",
                    "cancel_at_period_end": True,
                    "metadata": {"kiwijob_user_id": str(user.id), "kiwijob_tier": "premium"},
                    "current_period_end": 1_800_000_000,
                }
            },
        }
        assert process_webhook_event(active_event, session) is True
        assert process_webhook_event(active_event, session) is False
        session.refresh(user)
        assert user.membership_tier == "premium"
        assert user.membership_status == "active"
        assert user.membership_cancel_at_period_end is True
        assert user.membership_expires_at == datetime.fromtimestamp(1_800_000_000, UTC).replace(tzinfo=None)

        deleted_event = {
            "id": "evt_deleted",
            "type": "customer.subscription.deleted",
            "data": {"object": {"object": "subscription", "id": "sub_123", "customer": "cus_123", "status": "canceled"}},
        }
        assert process_webhook_event(deleted_event, session) is True
        session.refresh(user)
        assert user.membership_tier == "free"
        assert user.membership_expires_at is None
        assert user.stripe_subscription_id is None


def test_customer_is_recreated_when_switching_from_sandbox_to_live(monkeypatch) -> None:
    settings = Settings(_env_file=None, stripe_secret_key="sk_live_example")
    monkeypatch.setattr("app.services.stripe_billing.get_settings", lambda: settings)
    monkeypatch.setattr(
        "app.services.stripe_billing._stripe_post",
        lambda path, data: {"id": "cus_live"},
    )
    with Session(get_engine()) as session:
        user = User(
            email="mode-switch@example.com",
            membership_tier="pro",
            membership_status="active",
            stripe_livemode=False,
            stripe_customer_id="cus_test",
            stripe_subscription_id="sub_test",
        )
        session.add(user)
        session.commit()
        assert ensure_stripe_customer(user, session) == "cus_live"
        session.refresh(user)
        assert user.stripe_livemode is True
        assert user.stripe_customer_id == "cus_live"
        assert user.stripe_subscription_id is None
        assert user.membership_tier == "free"
        assert user.membership_status == "inactive"


def test_billing_status_automatically_discards_sandbox_membership_in_live_mode(monkeypatch) -> None:
    settings = Settings(
        _env_file=None,
        stripe_secret_key="sk_live_example",
        stripe_webhook_secret="whsec_example",
        stripe_pro_price_id="price_pro",
        stripe_premium_price_id="price_premium",
    )
    monkeypatch.setattr("app.services.stripe_billing.get_settings", lambda: settings)
    monkeypatch.setattr("app.routers.billing.get_settings", lambda: settings)
    with TestClient(app) as client:
        headers, user_id = auth_headers(client)
        with Session(get_engine()) as session:
            user = session.get(User, user_id)
            assert user is not None
            user.membership_tier = "pro"
            user.membership_status = "active"
            user.stripe_livemode = False
            user.stripe_customer_id = "cus_test"
            user.stripe_subscription_id = "sub_test"
            session.add(user)
            session.commit()

        response = client.get("/billing/status", headers=headers)

        assert response.status_code == 200
        assert response.json()["tier"] == "free"
        assert response.json()["status"] == "inactive"
        assert response.json()["configured"] is True
        with Session(get_engine()) as session:
            user = session.get(User, user_id)
            assert user is not None
            assert user.stripe_customer_id is None
            assert user.stripe_subscription_id is None
            assert user.stripe_livemode is None


def test_subscription_price_wins_after_portal_plan_change(monkeypatch) -> None:
    settings = Settings(
        _env_file=None,
        stripe_pro_price_id="price_pro",
        stripe_premium_price_id="price_premium",
    )
    monkeypatch.setattr("app.services.stripe_billing.get_settings", lambda: settings)
    with Session(get_engine()) as session:
        user = User(email="plan-change@example.com", stripe_customer_id="cus_change")
        session.add(user)
        session.commit()
        session.refresh(user)
        event = {
            "id": "evt_plan_change",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "object": "subscription",
                    "id": "sub_change",
                    "customer": "cus_change",
                    "status": "active",
                    "metadata": {"kiwijob_user_id": str(user.id), "kiwijob_tier": "pro"},
                    "items": {"data": [{"price": {"id": "price_premium"}, "current_period_end": 1_800_000_000}]},
                }
            },
        }
        process_webhook_event(event, session)
        session.refresh(user)
        assert user.membership_tier == "premium"


def test_webhook_signature_is_verified(monkeypatch) -> None:
    settings = Settings(_env_file=None, stripe_webhook_secret="whsec_test")
    monkeypatch.setattr("app.services.stripe_billing.get_settings", lambda: settings)
    payload = json.dumps({"id": "evt_signed", "type": "customer.subscription.updated"}, separators=(",", ":")).encode()
    timestamp = int(time.time())
    digest = hmac.new(b"whsec_test", f"{timestamp}.".encode() + payload, hashlib.sha256).hexdigest()
    event = verify_webhook_payload(payload, f"t={timestamp},v1={digest}")
    assert event["id"] == "evt_signed"
