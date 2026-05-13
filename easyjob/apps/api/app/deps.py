from __future__ import annotations

from sqlmodel import Session, select

from app.core.config import get_settings
from app.models import User


def get_or_create_user(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if user:
        return user
    user = User(id=user_id, email=f"user{user_id}@easyjob.local")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def ensure_demo_user(session: Session) -> User:
    """Guarantees the default mock user row exists (for FK integrity)."""
    return get_or_create_user(session, get_settings().mock_user_id)


def get_mock_user_id(x_mock_user_id: str | None) -> int:
    if not x_mock_user_id:
        return get_settings().mock_user_id
    try:
        return int(x_mock_user_id)
    except ValueError:
        return get_settings().mock_user_id
