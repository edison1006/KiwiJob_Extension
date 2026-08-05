import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlmodel import Session

from app.db.session import get_engine
from app.core.config import get_settings
from app.models import User
from app.services.rate_limit import enforce_ai_generation_limits, enforce_rate_limit


def test_weighted_rate_limit_rejects_calls_above_budget() -> None:
    with Session(get_engine()) as session:
        enforce_rate_limit(
            session,
            action="weighted_test",
            bucket_key="test-user",
            limit=10,
            window_seconds=60 * 60,
            cost=9,
        )
        with pytest.raises(HTTPException) as raised:
            enforce_rate_limit(
                session,
                action="weighted_test",
                bucket_key="test-user",
                limit=10,
                window_seconds=60 * 60,
                cost=2,
            )

    assert raised.value.status_code == 429
    assert int(raised.value.headers["Retry-After"]) > 0


def test_single_operation_larger_than_budget_is_rejected() -> None:
    with Session(get_engine()) as session:
        with pytest.raises(HTTPException) as raised:
            enforce_rate_limit(
                session,
                action="oversized_test",
                bucket_key="test-user",
                limit=10,
                window_seconds=60 * 60,
                cost=11,
            )

    assert raised.value.status_code == 429


def _enable_test_ai_limits(monkeypatch: pytest.MonkeyPatch, **limits: int) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    for name, value in limits.items():
        monkeypatch.setenv(name.upper(), str(value))
    get_settings.cache_clear()


def test_free_user_must_upgrade_after_monthly_quota(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_test_ai_limits(
        monkeypatch,
        ai_free_hourly_limit=2,
        ai_free_daily_limit=2,
        ai_free_monthly_limit=2,
    )
    try:
        with Session(get_engine()) as session:
            user = User(email="free-limit@example.com")
            session.add(user)
            session.commit()
            session.refresh(user)

            enforce_ai_generation_limits(session, user=user)
            enforce_ai_generation_limits(session, user=user)
            session.execute(text("DELETE FROM requestratelimit WHERE action IN ('ai_free_hour', 'ai_free_day')"))
            session.commit()
            with pytest.raises(HTTPException) as raised:
                enforce_ai_generation_limits(session, user=user)

        assert raised.value.status_code == 402
        assert "Upgrade" in str(raised.value.detail)
    finally:
        get_settings.cache_clear()


def test_paid_members_receive_their_own_quota(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_test_ai_limits(
        monkeypatch,
        ai_pro_hourly_limit=3,
        ai_pro_daily_limit=3,
        ai_pro_monthly_limit=3,
    )
    try:
        with Session(get_engine()) as session:
            user = User(email="pro-limit@example.com", membership_tier="pro")
            session.add(user)
            session.commit()
            session.refresh(user)

            for _ in range(3):
                enforce_ai_generation_limits(session, user=user)
            session.execute(text("DELETE FROM requestratelimit WHERE action IN ('ai_pro_hour', 'ai_pro_day')"))
            session.commit()
            with pytest.raises(HTTPException) as raised:
                enforce_ai_generation_limits(session, user=user)

        assert raised.value.status_code == 429
        assert "membership" in str(raised.value.detail)
    finally:
        get_settings.cache_clear()


def test_global_monthly_cost_reservation_stays_below_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_test_ai_limits(monkeypatch, ai_monthly_budget_cents=3)
    try:
        with Session(get_engine()) as session:
            user = User(email="budget-limit@example.com", membership_tier="premium")
            session.add(user)
            session.commit()
            session.refresh(user)

            enforce_ai_generation_limits(session, user=user, budget_cost_cents=2)
            with pytest.raises(HTTPException) as raised:
                enforce_ai_generation_limits(session, user=user, budget_cost_cents=2)

        assert raised.value.status_code == 503
        assert "monthly AI budget" in str(raised.value.detail)
    finally:
        get_settings.cache_clear()
