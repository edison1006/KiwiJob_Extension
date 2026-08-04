from __future__ import annotations

from datetime import UTC, datetime, timedelta
import hashlib
import hmac

from fastapi import HTTPException, Request
from sqlalchemy import text
from sqlmodel import Session

from app.core.config import get_settings


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


def enforce_rate_limit(
    session: Session,
    *,
    action: str,
    bucket_key: str,
    limit: int,
    window_seconds: int,
) -> None:
    if not get_settings().rate_limit_enabled:
        return

    now = datetime.now(UTC).replace(tzinfo=None)
    epoch = int(now.timestamp())
    bucket_start = datetime.fromtimestamp(epoch - (epoch % window_seconds), UTC).replace(tzinfo=None)
    statement = text(
        """
        INSERT INTO requestratelimit (bucket_key, action, bucket_start, count, created_at)
        VALUES (:bucket_key, :action, :bucket_start, 1, :now)
        ON CONFLICT (bucket_key, action, bucket_start)
        DO UPDATE SET count = requestratelimit.count + 1
        WHERE requestratelimit.count < :request_limit
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
        },
    ).scalar_one_or_none()
    if result is None:
        session.rollback()
        retry_after = max(1, window_seconds - (epoch % window_seconds))
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    session.commit()


def cleanup_rate_limits(session: Session) -> None:
    cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=7)
    session.connection().execute(
        text("DELETE FROM requestratelimit WHERE bucket_start < :cutoff"),
        {"cutoff": cutoff},
    )
    session.commit()
