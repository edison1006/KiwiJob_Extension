from __future__ import annotations

import argparse
from datetime import timedelta

from sqlmodel import Session, select

from app.core.time import utc_now
from app.db.session import get_engine
from app.models import User
from app.services.membership import MEMBERSHIP_TIERS


def main() -> None:
    parser = argparse.ArgumentParser(description="Grant or revoke a KiwiJob membership entitlement.")
    parser.add_argument("--email", required=True, help="KiwiJob account email")
    parser.add_argument("--tier", required=True, choices=sorted(MEMBERSHIP_TIERS))
    parser.add_argument("--days", type=int, default=31, help="Paid membership duration; ignored for free")
    args = parser.parse_args()

    email = args.email.strip().lower()
    if args.tier != "free" and args.days < 1:
        parser.error("--days must be at least 1 for a paid membership")

    with Session(get_engine()) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            raise SystemExit(f"No KiwiJob account found for {email}")
        expires_at = None if args.tier == "free" else utc_now() + timedelta(days=args.days)
        user.membership_tier = args.tier
        user.membership_expires_at = expires_at
        session.add(user)
        session.commit()

    expiry = "not applicable" if expires_at is None else expires_at.isoformat()
    print(f"Updated {email}: tier={args.tier}, expires_at={expiry}")


if __name__ == "__main__":
    main()
