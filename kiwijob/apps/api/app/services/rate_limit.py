from __future__ import annotations

from datetime import UTC, datetime, timedelta
import hashlib
import hmac

from fastapi import HTTPException, Request
from sqlalchemy import text
from sqlmodel import Session

from app.core.config import get_settings
from app.models import User
from app.services.membership import effective_membership_tier


def _hashed_key(value: str) -> str:
    secret = get_settings().jwt_secret_key.encode("utf-8")
    return hmac.new(secret, value.encode("utf-8"), hashlib.sha256).hexdigest()


def client_rate_limit_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    address = forwarded or (request.client.host if request.client else "unknown")
    return _hashed_key(f"client:{address[:128]}")


def user_rate_limit_key(user_id: int) -> str:
    return _hashed_key(f"user:{user_id}")


def value_rate_limit_key(namespace: str, value: str) -> str:
    return _hashed_key(f"{namespace}:{value.strip().lower()}")


def _consume_limit(
    session: Session,
    *,
    action: str,
    bucket_key: str,
    limit: int,
    cost: int,
    bucket_start: datetime,
    now: datetime,
    retry_after: int,
    status_code: int = 429,
    detail: str = "Too many requests. Try again later.",
) -> None:
    statement = text(
        """
        INSERT INTO requestratelimit (bucket_key, action, bucket_start, count, created_at)
        SELECT :bucket_key, :action, :bucket_start, :request_cost, :now
        WHERE :request_cost <= :request_limit
        ON CONFLICT (bucket_key, action, bucket_start)
        DO UPDATE SET count = requestratelimit.count + :request_cost
        WHERE requestratelimit.count <= :request_limit - :request_cost
        RETURNING count
        """
    )
    result = session.connection().execute(
        statement,
        {
            "bucket_key": bucket_key,
            "action": action,
            "bucket_start": bucket_start,
            "now": now,
            "request_limit": limit,
            "request_cost": cost,
        },
    ).scalar_one_or_none()
    if result is None:
        session.rollback()
        raise HTTPException(
            status_code=status_code,
            detail=detail,
            headers={"Retry-After": str(max(1, retry_after))},
        )


def enforce_rate_limit(
    session: Session,
    *,
    action: str,
    bucket_key: str,
    limit: int,
    window_seconds: int,
    cost: int = 1,
) -> None:
    if not get_settings().rate_limit_enabled or cost < 1:
        return

    now = datetime.now(UTC).replace(tzinfo=None)
    epoch = int(now.timestamp())
    bucket_start = datetime.fromtimestamp(epoch - (epoch % window_seconds), UTC).replace(tzinfo=None)
    _consume_limit(
        session,
        action=action,
        bucket_key=bucket_key,
        limit=limit,
        cost=cost,
        bucket_start=bucket_start,
        now=now,
        retry_after=window_seconds - (epoch % window_seconds),
    )
    session.commit()


def enforce_ai_generation_limits(
    session: Session,
    *,
    user: User,
    cost: int = 1,
    budget_cost_cents: int = 1,
) -> None:
    """Apply user and service-wide OpenAI call budgets.

    `cost` is the number of provider calls the operation can make. This matters for
    batched endpoints such as autofill, where one HTTP request may generate many answers.
    """
    settings = get_settings()
    if not settings.openai_api_key or not settings.rate_limit_enabled or cost < 1:
        return

    assert user.id is not None
    tier = effective_membership_tier(user)
    hourly_limit = getattr(settings, f"ai_{tier}_hourly_limit")
    daily_limit = getattr(settings, f"ai_{tier}_daily_limit")
    monthly_limit = getattr(settings, f"ai_{tier}_monthly_limit")
    user_key = user_rate_limit_key(user.id)
    now = datetime.now(UTC).replace(tzinfo=None)
    epoch = int(now.timestamp())
    month_start = datetime(now.year, now.month, 1)
    next_month = datetime(now.year + (now.month == 12), 1 if now.month == 12 else now.month + 1, 1)
    month_retry_after = int((next_month - now).total_seconds())

    window_checks = (
        (f"ai_{tier}_hour", hourly_limit, 60 * 60),
        (f"ai_{tier}_day", daily_limit, 24 * 60 * 60),
    )
    for action, limit, window_seconds in window_checks:
        bucket_start = datetime.fromtimestamp(epoch - (epoch % window_seconds), UTC).replace(tzinfo=None)
        _consume_limit(
            session,
            action=action,
            bucket_key=user_key,
            limit=limit,
            cost=cost,
            bucket_start=bucket_start,
            now=now,
            retry_after=window_seconds - (epoch % window_seconds),
            detail="AI usage limit reached. Try again after the indicated reset time.",
        )

    monthly_detail = (
        "Free AI quota reached. Upgrade your membership to continue using AI features."
        if tier == "free"
        else "Monthly membership AI quota reached. Try again next month."
    )
    _consume_limit(
        session,
        action=f"ai_{tier}_month",
        bucket_key=user_key,
        limit=monthly_limit,
        cost=cost,
        bucket_start=month_start,
        now=now,
        retry_after=month_retry_after,
        status_code=402 if tier == "free" else 429,
        detail=monthly_detail,
    )
    _consume_limit(
        session,
        action="ai_budget_cents_month",
        bucket_key=_hashed_key("global:ai_budget"),
        limit=settings.ai_monthly_budget_cents,
        cost=max(1, budget_cost_cents),
        bucket_start=month_start,
        now=now,
        retry_after=month_retry_after,
        status_code=503,
        detail="KiwiJob's monthly AI budget has been reached. AI features will reset next month.",
    )
    session.commit()


def cleanup_rate_limits(session: Session) -> None:
    cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=62)
    session.connection().execute(
        text("DELETE FROM requestratelimit WHERE bucket_start < :cutoff"),
        {"cutoff": cutoff},
    )
    session.commit()
