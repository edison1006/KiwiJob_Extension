from __future__ import annotations

import argparse
import asyncio
import csv
from dataclasses import asdict
import io
import json
from pathlib import Path
import sys
from zipfile import BadZipFile, ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select

from app.core.time import utc_now
from app.db.session import get_engine
from app.models import CareerSource
from app.services.career_discovery import CompanySeed, discover_company_registry
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

    discover = subparsers.add_parser("discover", help="Discover supported public ATS links from company websites.")
    discover.add_argument(
        "--file",
        required=True,
        help="JSON/CSV company seeds or an official Companies Office bulk-data ZIP.",
    )
    discover.add_argument("--concurrency", type=int, default=10)
    discover.add_argument("--max-pages", type=int, default=4)
    discover.add_argument("--offset", type=int, default=0, help="Skip this many valid company rows.")
    discover.add_argument("--limit", type=int, default=1000, help="Maximum company rows to process in this run.")
    discover.add_argument("--company-column", help="CSV column containing the company name.")
    discover.add_argument("--website-column", help="CSV column containing the public website/domain.")
    discover.add_argument("--dry-run", action="store_true", help="Print discoveries without updating the database.")

    subparsers.add_parser("list", help="List configured career sources.")

    sync = subparsers.add_parser("sync", help="Synchronize sources whose next poll time is due.")
    sync.add_argument("--limit", type=int, default=100)
    sync.add_argument("--concurrency", type=int, default=10)
    sync.add_argument("--force", action="store_true", help="Make every enabled source due before synchronizing.")
    return parser


def _field(item: dict, explicit: str | None, candidates: tuple[str, ...]) -> str:
    if explicit:
        return str(item.get(explicit) or "").strip()
    normalized = {str(key).lower().replace("_", "").replace(" ", ""): value for key, value in item.items()}
    return next((str(normalized.get(candidate) or "").strip() for candidate in candidates if normalized.get(candidate)), "")


def _selected_seeds(
    rows,
    *,
    offset: int,
    limit: int,
    company_column: str | None = None,
    website_column: str | None = None,
) -> tuple[list[CompanySeed], int]:
    seeds: list[CompanySeed] = []
    valid_index = 0
    for item in rows:
        if not isinstance(item, dict):
            raise SystemExit("Every company seed must be an object")
        company = _field(item, company_column, ("company", "companyname", "name", "entityname", "legalname", "tradingname"))
        website = _field(item, website_column, ("website", "websiteurl", "domain", "url", "businesswebsite"))
        if not company or not website:
            continue
        if valid_index >= offset:
            seeds.append(CompanySeed(company_name=company, website=website))
            if len(seeds) >= limit:
                break
        valid_index += 1
    return seeds, len(seeds)


def _zip_member(archive: ZipFile, expected_name: str) -> str:
    match = next((name for name in archive.namelist() if Path(name).name.lower() == expected_name.lower()), None)
    if match is None:
        raise SystemExit(f"Companies Office ZIP is missing {expected_name}")
    return match


def _companies_office_zip_seeds(path: Path, *, offset: int, limit: int) -> tuple[list[CompanySeed], int]:
    """Join official core and website files by NZBN without extracting the large archive."""
    try:
        archive = ZipFile(path)
    except BadZipFile as exc:
        raise SystemExit(f"Invalid ZIP file: {path}") from exc

    with archive:
        core_name = _zip_member(archive, "companies_core_data.csv")
        website_name = _zip_member(archive, "companies_website.csv")
        with archive.open(core_name) as raw_core:
            core_rows = csv.DictReader(io.TextIOWrapper(raw_core, encoding="utf-8-sig", newline=""))
            registered_nzbns = {
                str(row.get("NZBN") or "").strip()
                for row in core_rows
                if str(row.get("ENTITY_STATUS") or "").strip().casefold() == "registered"
            }

        selected: dict[str, list[CompanySeed]] = {}
        seen_websites: dict[str, set[str]] = {}
        valid_company_index = 0
        with archive.open(website_name) as raw_websites:
            website_rows = csv.DictReader(io.TextIOWrapper(raw_websites, encoding="utf-8-sig", newline=""))
            for row in website_rows:
                nzbn = str(row.get("NZBN") or "").strip()
                company = str(row.get("ENTITY_NAME") or "").strip()
                website = str(row.get("WEBSITE") or "").strip()
                if nzbn not in registered_nzbns or not company or not website:
                    continue
                if website.casefold() in {"no website", "none", "n/a", "not applicable", "unknown"}:
                    continue
                if nzbn not in selected and nzbn not in seen_websites:
                    if offset <= valid_company_index < offset + limit:
                        selected[nzbn] = []
                        seen_websites[nzbn] = set()
                    else:
                        seen_websites[nzbn] = set()
                    valid_company_index += 1
                if nzbn not in selected:
                    continue
                normalized_website = website.rstrip("/").casefold()
                if normalized_website in seen_websites[nzbn]:
                    continue
                seen_websites[nzbn].add(normalized_website)
                selected[nzbn].append(CompanySeed(company_name=company, website=website))

    seeds = [seed for company_seeds in selected.values() for seed in company_seeds]
    return seeds, len(selected)


def _load_company_seeds(
    path: Path,
    *,
    offset: int,
    limit: int,
    company_column: str | None = None,
    website_column: str | None = None,
) -> tuple[list[CompanySeed], int]:
    if path.suffix.lower() == ".zip":
        if company_column or website_column:
            raise SystemExit("--company-column and --website-column are not used with Companies Office ZIP files")
        return _companies_office_zip_seeds(path, offset=offset, limit=limit)
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return _selected_seeds(
                csv.DictReader(handle),
                offset=offset,
                limit=limit,
                company_column=company_column,
                website_column=website_column,
            )
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise SystemExit("Company seed JSON must contain a top-level array")
    return _selected_seeds(
        payload,
        offset=offset,
        limit=limit,
        company_column=company_column,
        website_column=website_column,
    )


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


async def _discover(args: argparse.Namespace) -> None:
    path = Path(args.file).expanduser().resolve()
    if args.offset < 0 or args.limit < 1 or args.limit > 10_000:
        raise SystemExit("offset must be non-negative and limit must be between 1 and 10000")
    seeds, companies_checked = _load_company_seeds(
        path,
        offset=args.offset,
        limit=args.limit,
        company_column=args.company_column,
        website_column=args.website_column,
    )
    if not seeds:
        raise SystemExit("No company rows with both a name and website were found in the selected batch")
    sources = await discover_company_registry(
        seeds,
        concurrency=args.concurrency,
        max_pages=args.max_pages,
    )
    registry = [source.registry_item(interval=360 if source.source_type == "generic" else 60) for source in sources]
    if not args.dry_run:
        with Session(get_engine()) as session:
            for item in registry:
                _upsert_source(session, item)
            session.commit()
    print(
        json.dumps(
            {
                "companies_checked": companies_checked,
                "websites_checked": len(seeds),
                "sources_discovered": len(registry),
                "saved": 0 if args.dry_run else len(registry),
                "sources": registry,
            },
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
    elif args.command == "discover":
        asyncio.run(_discover(args))
    else:
        asyncio.run(_sync(args))


if __name__ == "__main__":
    main()
