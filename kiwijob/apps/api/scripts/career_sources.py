from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys
from dataclasses import asdict

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select

from app.core.time import utc_now
from app.db.session import get_engine
from app.models import CareerSource
from app.services.career_sources import SUPPORTED_SOURCE_TYPES, sync_due_career_sources, validate_source


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage and synchronize public company career sources.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add = subparsers.add_parser("add", help="Add or update one ATS career source.")
    add.add_argument("--company", required=True)
    add.add_argument("--type", required=True, choices=sorted(SUPPORTED_SOURCE_TYPES))
    add.add_argument("--tenant", required=True)
    add.add_argument("--url", required=True)
    add.add_argument("--domain")
    add.add_argument("--country", default="NZ")
    add.add_argument("--interval", type=int, default=60)

    load = subparsers.add_parser("load", help="Bulk add or update sources from a JSON registry.")
    load.add_argument("--file", required=True)

    subparsers.add_parser("list", help="List configured career sources.")

    sync = subparsers.add_parser("sync", help="Synchronize sources whose next poll time is due.")
    sync.add_argument("--limit", type=int, default=100)
    sync.add_argument("--concurrency", type=int, default=10)
    sync.add_argument("--force", action="store_true", help="Make every enabled source due before synchronizing.")
    return parser


def _upsert_source(session: Session, item: dict) -> CareerSource:
    source_type, tenant_key = validate_source(str(item["type"]), str(item["tenant"]))
    country = str(item.get("country", "NZ")).strip().upper()
    if len(country) != 2:
        raise ValueError("country must be a two-letter ISO country code")
    interval = int(item.get("interval", 60))
    if interval < 5:
        raise ValueError("interval must be at least 5 minutes")
    company = str(item["company"]).strip()
    careers_url = str(item["url"]).strip()
    domain = str(item["domain"]).strip() if item.get("domain") else None
    if not company or not careers_url:
        raise ValueError("company and url are required")
    row = session.exec(
        select(CareerSource).where(CareerSource.source_type == source_type, CareerSource.tenant_key == tenant_key)
    ).first()
    now = utc_now()
    if row is None:
        row = CareerSource(
            company_name=company,
            source_type=source_type,
            tenant_key=tenant_key,
            careers_url=careers_url,
            company_domain=domain,
            country_code=country,
            polling_interval_minutes=interval,
            next_poll_at=now,
            created_at=now,
            updated_at=now,
        )
    else:
        row.company_name = company
        row.careers_url = careers_url
        row.company_domain = domain
        row.country_code = country
        row.polling_interval_minutes = interval
        row.enabled = True
        row.next_poll_at = now
        row.updated_at = now
    session.add(row)
    return row


def _add(args: argparse.Namespace) -> None:
    with Session(get_engine()) as session:
        row = _upsert_source(
            session,
            {
                "company": args.company,
                "type": args.type,
                "tenant": args.tenant,
                "url": args.url,
                "domain": args.domain,
                "country": args.country,
                "interval": args.interval,
            },
        )
        session.commit()
        session.refresh(row)
        print(json.dumps({"id": row.id, "company": row.company_name, "type": row.source_type, "tenant": row.tenant_key}))


def _load(args: argparse.Namespace) -> None:
    path = Path(args.file).expanduser().resolve()
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise SystemExit("Registry JSON must contain a top-level array")
    with Session(get_engine()) as session:
        rows = [_upsert_source(session, item) for item in payload if isinstance(item, dict)]
        if len(rows) != len(payload):
            raise SystemExit("Every registry entry must be an object")
        session.commit()
        print(json.dumps({"loaded": len(rows), "file": str(path)}))


def _list() -> None:
    with Session(get_engine()) as session:
        rows = session.exec(select(CareerSource).order_by(CareerSource.company_name)).all()
        print(
            json.dumps(
                [
                    {
                        "id": row.id,
                        "company": row.company_name,
                        "type": row.source_type,
                        "tenant": row.tenant_key,
                        "enabled": row.enabled,
                        "next_poll_at": row.next_poll_at.isoformat() if row.next_poll_at else None,
                        "last_success_at": row.last_success_at.isoformat() if row.last_success_at else None,
                        "failure_count": row.failure_count,
                        "last_error": row.last_error,
                    }
                    for row in rows
                ],
                indent=2,
            )
        )


async def _sync(args: argparse.Namespace) -> None:
    with Session(get_engine()) as session:
        if args.force:
            rows = session.exec(select(CareerSource).where(CareerSource.enabled.is_(True))).all()
            for row in rows:
                row.next_poll_at = None
                session.add(row)
            session.commit()
        summaries = await sync_due_career_sources(session, limit=args.limit, concurrency=args.concurrency)
        print(json.dumps([asdict(summary) for summary in summaries], indent=2))


def main() -> None:
    args = _parser().parse_args()
    if args.command == "add":
        _add(args)
    elif args.command == "load":
        _load(args)
    elif args.command == "list":
        _list()
    else:
        asyncio.run(_sync(args))


if __name__ == "__main__":
    main()
