from __future__ import annotations

from app.core.time import utc_now
from app.models import User

MEMBERSHIP_TIERS = frozenset({"free", "pro", "premium"})


def effective_membership_tier(user: User) -> str:
    tier = (user.membership_tier or "free").strip().lower()
    if tier not in MEMBERSHIP_TIERS:
        return "free"
    if tier != "free" and user.membership_expires_at is not None and user.membership_expires_at <= utc_now():
        return "free"
    return tier
