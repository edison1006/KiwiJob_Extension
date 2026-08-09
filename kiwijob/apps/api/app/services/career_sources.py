from __future__ import annotations

import asyncio
import hashlib
import html
import json
import re
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx
from sqlmodel import Session, select

from app.core.time import utc_now
from app.models import CareerSource, ExternalJob
from app.schemas import JobSaveIn, JobSearchIn, JobSearchResultOut


CAREER_SOURCE_USER_AGENT = "KiwiJobCareerSync/1.0 (+https://kiwijob.co.nz)"
SUPPORTED_SOURCE_TYPES = frozenset({"greenhouse", "lever", "smartrecruiters"})
TENANT_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$")
NZ_LOCATION_PATTERN = re.compile(
    r"\b(new zealand|aotearoa|auckland|wellington|christchurch|canterbury|hamilton|waikato|"
    r"tauranga|bay of plenty|dunedin|otago|queenstown|nelson|tasman|napier|hawke'?s bay|"
    r"palmerston north|manawat[uū]|new plymouth|taranaki|rotorua|whang[aā]rei|northland|"
    r"invercargill|southland|gisborne|marlborough|west coast)\b",
    re.I,
)


class CareerSyncError(ValueError):
    pass


@dataclass(slots=True)
class NormalizedCareerJob:
    external_job_id: str
    title: str
    company: str
    url: str
    location: str | None = None
    country_code: str | None = None
    description: str | None = None
    salary: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    salary_currency: str | None = None
    employment_type: str | None = None
    workplace_type: str | None = None
    apply_url: str | None = None
    company_url: str | None = None
    company_logo_url: str | None = None
    posted_date: datetime | None = None
    closing_date: datetime | None = None


@dataclass(slots=True)
class CareerFetchResult:
    jobs: list[NormalizedCareerJob]
    etag: str | None = None
    last_modified: str | None = None
    not_modified: bool = False


@dataclass(slots=True)
class CareerSyncSummary:
    source_id: int
    company_name: str
    fetched: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    deactivated: int = 0
    not_modified: bool = False
    error: str | None = None


class CareerAdapter(Protocol):
    async def fetch(self, source: CareerSource, client: httpx.AsyncClient) -> CareerFetchResult: ...


def validate_source(source_type: str, tenant_key: str) -> tuple[str, str]:
    normalized_type = source_type.strip().lower()
    normalized_tenant = tenant_key.strip()
    if normalized_type not in SUPPORTED_SOURCE_TYPES:
        raise CareerSyncError(f"Unsupported career source type: {source_type}")
    if not TENANT_KEY_PATTERN.fullmatch(normalized_tenant):
        raise CareerSyncError("Career source tenant key contains unsupported characters.")
    return normalized_type, normalized_tenant


def _conditional_headers(source: CareerSource) -> dict[str, str]:
    headers = {"Accept": "application/json", "User-Agent": CAREER_SOURCE_USER_AGENT}
    if source.etag:
        headers["If-None-Match"] = source.etag
    if source.last_modified:
        headers["If-Modified-Since"] = source.last_modified
    return headers


def _text(value: Any, *, limit: int | None = None) -> str | None:
    if value is None:
        return None
    raw = str(value)
    cleaned = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", raw))).strip()
    if not cleaned:
        return None
    return cleaned[:limit] if limit else cleaned


def _dict_text(value: Any, key: str = "label") -> str | None:
    return _text(value.get(key)) if isinstance(value, dict) else None


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, (int, float)):
        try:
            timestamp = value / 1000 if value > 10_000_000_000 else value
            return datetime.fromtimestamp(timestamp, UTC).replace(tzinfo=None)
        except (OverflowError, OSError, ValueError):
            return None
    raw = _text(value)
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None) if parsed.tzinfo is None else parsed.astimezone(UTC).replace(tzinfo=None)
    except ValueError:
        return None


def _country(value: Any) -> str | None:
    raw = _text(value)
    if not raw:
        return None
    normalized = raw.upper()
    if normalized in {"NZ", "NEW ZEALAND"}:
        return "NZ"
    return normalized[:2] if len(normalized) == 2 else None


def _location(parts: list[Any]) -> str | None:
    values = [_text(part) for part in parts]
    return ", ".join(dict.fromkeys(value for value in values if value)) or None


def _hash_payload(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, default=str, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _job_hash(job: NormalizedCareerJob) -> str:
    return _hash_payload(asdict(job))


def _response_result(response: httpx.Response, jobs: list[NormalizedCareerJob]) -> CareerFetchResult:
    return CareerFetchResult(
        jobs=jobs,
        etag=response.headers.get("etag"),
        last_modified=response.headers.get("last-modified"),
    )


class GreenhouseAdapter:
    async def fetch(self, source: CareerSource, client: httpx.AsyncClient) -> CareerFetchResult:
        response = await client.get(
            f"https://boards-api.greenhouse.io/v1/boards/{source.tenant_key}/jobs",
            params={"content": "true"},
            headers=_conditional_headers(source),
        )
        if response.status_code == 304:
            return CareerFetchResult(jobs=[], not_modified=True)
        response.raise_for_status()
        payload = response.json()
        jobs: list[NormalizedCareerJob] = []
        for raw in payload.get("jobs", []):
            location = _dict_text(raw.get("location"), "name")
            jobs.append(
                NormalizedCareerJob(
                    external_job_id=str(raw.get("id", "")).strip(),
                    title=_text(raw.get("title"), limit=500) or "Untitled job",
                    company=source.company_name,
                    location=location,
                    country_code="NZ" if location and NZ_LOCATION_PATTERN.search(location) else None,
                    description=_text(raw.get("content")),
                    employment_type=_greenhouse_metadata(raw.get("metadata"), "employment"),
                    workplace_type=_workplace_from_text(location, _greenhouse_metadata(raw.get("metadata"), "workplace")),
                    url=_text(raw.get("absolute_url"), limit=4096) or source.careers_url,
                    apply_url=_text(raw.get("absolute_url"), limit=4096),
                    company_url=source.company_domain,
                    posted_date=_parse_datetime(raw.get("updated_at")),
                )
            )
        return _response_result(response, [job for job in jobs if job.external_job_id])


def _greenhouse_metadata(metadata: Any, needle: str) -> str | None:
    if not isinstance(metadata, list):
        return None
    for item in metadata:
        if not isinstance(item, dict) or needle not in str(item.get("name", "")).lower():
            continue
        value = item.get("value")
        if isinstance(value, list):
            return ", ".join(filter(None, (_text(part) for part in value))) or None
        return _text(value)
    return None


class LeverAdapter:
    async def fetch(self, source: CareerSource, client: httpx.AsyncClient) -> CareerFetchResult:
        response = await client.get(
            f"https://api.lever.co/v0/postings/{source.tenant_key}",
            params={"mode": "json"},
            headers=_conditional_headers(source),
        )
        if response.status_code == 304:
            return CareerFetchResult(jobs=[], not_modified=True)
        response.raise_for_status()
        jobs: list[NormalizedCareerJob] = []
        for raw in response.json():
            categories = raw.get("categories") if isinstance(raw.get("categories"), dict) else {}
            location = _location([categories.get("location"), *categories.get("allLocations", [])])
            salary_range = raw.get("salaryRange") if isinstance(raw.get("salaryRange"), dict) else {}
            salary_min = _int_or_none(salary_range.get("min"))
            salary_max = _int_or_none(salary_range.get("max"))
            currency = _text(salary_range.get("currency"), limit=10)
            interval = _text(salary_range.get("interval"), limit=50)
            jobs.append(
                NormalizedCareerJob(
                    external_job_id=str(raw.get("id", "")).strip(),
                    title=_text(raw.get("text"), limit=500) or "Untitled job",
                    company=source.company_name,
                    location=location,
                    country_code=_country(raw.get("country")),
                    description=_text(raw.get("descriptionPlain") or raw.get("description")),
                    salary=_salary_text(currency, salary_min, salary_max, interval, raw.get("salaryDescriptionPlain")),
                    salary_min=salary_min,
                    salary_max=salary_max,
                    salary_currency=currency,
                    employment_type=_text(categories.get("commitment"), limit=500),
                    workplace_type=_workplace_from_text(raw.get("workplaceType"), location),
                    url=_text(raw.get("hostedUrl"), limit=4096) or source.careers_url,
                    apply_url=_text(raw.get("applyUrl"), limit=4096),
                    company_url=source.company_domain,
                    posted_date=_parse_datetime(raw.get("createdAt")),
                )
            )
        return _response_result(response, [job for job in jobs if job.external_job_id])


class SmartRecruitersAdapter:
    async def fetch(self, source: CareerSource, client: httpx.AsyncClient) -> CareerFetchResult:
        headers = _conditional_headers(source)
        summaries: list[dict[str, Any]] = []
        offset = 0
        first_response: httpx.Response | None = None
        while True:
            response = await client.get(
                f"https://api.smartrecruiters.com/v1/companies/{source.tenant_key}/postings",
                params={"limit": 100, "offset": offset, "destination": "PUBLIC"},
                headers=headers if offset == 0 else {"Accept": "application/json", "User-Agent": CAREER_SOURCE_USER_AGENT},
            )
            if offset == 0 and response.status_code == 304:
                return CareerFetchResult(jobs=[], not_modified=True)
            response.raise_for_status()
            first_response = first_response or response
            payload = response.json()
            page = payload.get("content", [])
            summaries.extend(item for item in page if isinstance(item, dict))
            offset += len(page)
            if not page or offset >= int(payload.get("totalFound", offset)):
                break

        semaphore = asyncio.Semaphore(4)

        async def detail(summary: dict[str, Any]) -> NormalizedCareerJob:
            async with semaphore:
                posting_id = str(summary.get("id") or summary.get("uuid") or "")
                response = await client.get(
                    f"https://api.smartrecruiters.com/v1/companies/{source.tenant_key}/postings/{posting_id}",
                    headers={"Accept": "application/json", "User-Agent": CAREER_SOURCE_USER_AGENT},
                )
                response.raise_for_status()
                raw = response.json()
                location_data = raw.get("location") if isinstance(raw.get("location"), dict) else {}
                location = _location([location_data.get("city"), location_data.get("region"), location_data.get("country")])
                sections = raw.get("jobAd", {}).get("sections", {}) if isinstance(raw.get("jobAd"), dict) else {}
                description = "\n\n".join(
                    filter(None, (_text(section.get("text")) for section in sections.values() if isinstance(section, dict)))
                ) or None
                company = raw.get("company") if isinstance(raw.get("company"), dict) else {}
                employment = raw.get("typeOfEmployment") if isinstance(raw.get("typeOfEmployment"), dict) else {}
                remote = location_data.get("remote") is True
                return NormalizedCareerJob(
                    external_job_id=posting_id,
                    title=_text(raw.get("name"), limit=500) or "Untitled job",
                    company=_text(company.get("name"), limit=500) or source.company_name,
                    location=location,
                    country_code=_country(location_data.get("country")),
                    description=description,
                    employment_type=_text(employment.get("label"), limit=500),
                    workplace_type="Remote" if remote else _workplace_from_text(location_data.get("locationType"), location),
                    url=_text(raw.get("applyUrl"), limit=4096) or source.careers_url,
                    apply_url=_text(raw.get("applyUrl"), limit=4096),
                    company_url=source.company_domain,
                    posted_date=_parse_datetime(raw.get("releasedDate")),
                )

        jobs = await asyncio.gather(*(detail(summary) for summary in summaries))
        assert first_response is not None
        return _response_result(first_response, jobs)


def _int_or_none(value: Any) -> int | None:
    try:
        return int(float(value)) if value is not None else None
    except (TypeError, ValueError):
        return None


def _salary_text(currency: str | None, minimum: int | None, maximum: int | None, interval: str | None, fallback: Any) -> str | None:
    if minimum is not None or maximum is not None:
        amount = f"{minimum:,}–{maximum:,}" if minimum is not None and maximum is not None else f"{minimum or maximum:,}"
        return " ".join(filter(None, (currency, amount, interval)))
    return _text(fallback, limit=1000)


def _workplace_from_text(*parts: Any) -> str | None:
    value = " ".join(str(part) for part in parts if part).lower()
    if "hybrid" in value:
        return "Hybrid"
    if "remote" in value or "telecommute" in value:
        return "Remote"
    return "On-site" if value else None


def _source_website(source: CareerSource) -> str:
    value = source.company_domain or source.careers_url
    return (urlparse(value).hostname or value).removeprefix("www.")[:200]


def _adapter(source_type: str) -> CareerAdapter:
    adapters: dict[str, CareerAdapter] = {
        "greenhouse": GreenhouseAdapter(),
        "lever": LeverAdapter(),
        "smartrecruiters": SmartRecruitersAdapter(),
    }
    try:
        return adapters[source_type]
    except KeyError as exc:
        raise CareerSyncError(f"Unsupported career source type: {source_type}") from exc


def _is_target_country(job: NormalizedCareerJob, target: str) -> bool:
    target = target.upper()
    if job.country_code:
        return job.country_code.upper() == target
    if target == "NZ":
        return bool(job.location and NZ_LOCATION_PATTERN.search(job.location))
    return True


async def fetch_career_source(source: CareerSource, client: httpx.AsyncClient) -> CareerFetchResult:
    source_type, tenant_key = validate_source(source.source_type, source.tenant_key)
    source.source_type = source_type
    source.tenant_key = tenant_key
    result = await _adapter(source_type).fetch(source, client)
    result.jobs = [job for job in result.jobs if _is_target_country(job, source.country_code)]
    return result


def apply_career_fetch(session: Session, source: CareerSource, result: CareerFetchResult, *, now: datetime | None = None) -> CareerSyncSummary:
    current_time = now or utc_now()
    assert source.id is not None
    summary = CareerSyncSummary(source_id=source.id, company_name=source.company_name, fetched=len(result.jobs), not_modified=result.not_modified)
    source.last_checked_at = current_time
    source.last_success_at = current_time
    source.next_poll_at = current_time + timedelta(minutes=max(5, source.polling_interval_minutes))
    source.failure_count = 0
    source.last_error = None
    source.updated_at = current_time
    if result.etag:
        source.etag = result.etag
    if result.last_modified:
        source.last_modified = result.last_modified
    if result.not_modified:
        session.add(source)
        session.commit()
        return summary

    source.content_hash = _hash_payload([asdict(job) for job in result.jobs])
    existing = {
        row.external_job_id: row
        for row in session.exec(select(ExternalJob).where(ExternalJob.career_source_id == source.id)).all()
    }
    seen: set[str] = set()
    for job in result.jobs:
        seen.add(job.external_job_id)
        digest = _job_hash(job)
        row = existing.get(job.external_job_id)
        if row is None:
            row = ExternalJob(
                career_source_id=source.id,
                content_hash=digest,
                first_seen_at=current_time,
                created_at=current_time,
                **asdict(job),
            )
            summary.created += 1
        elif row.content_hash != digest or not row.active:
            for field, value in asdict(job).items():
                setattr(row, field, value)
            row.content_hash = digest
            row.updated_at = current_time
            summary.updated += 1
        else:
            summary.unchanged += 1
        row.active = True
        row.missing_count = 0
        row.last_seen_at = current_time
        session.add(row)

    for external_id, row in existing.items():
        if external_id in seen or not row.active:
            continue
        row.missing_count += 1
        if row.missing_count >= 2:
            row.active = False
            summary.deactivated += 1
        row.updated_at = current_time
        session.add(row)

    session.add(source)
    session.commit()
    return summary


def mark_career_fetch_failed(session: Session, source: CareerSource, exc: Exception, *, now: datetime | None = None) -> CareerSyncSummary:
    current_time = now or utc_now()
    assert source.id is not None
    source.last_checked_at = current_time
    source.failure_count += 1
    delay = min(24 * 60, max(5, source.polling_interval_minutes) * (2 ** min(source.failure_count, 6)))
    source.next_poll_at = current_time + timedelta(minutes=delay)
    source.last_error = str(exc)[:2000]
    source.updated_at = current_time
    session.add(source)
    session.commit()
    return CareerSyncSummary(source_id=source.id, company_name=source.company_name, error=source.last_error)


async def sync_due_career_sources(session: Session, *, limit: int = 100, concurrency: int = 10) -> list[CareerSyncSummary]:
    now = utc_now()
    sources = session.exec(
        select(CareerSource)
        .where(CareerSource.enabled.is_(True), (CareerSource.next_poll_at.is_(None)) | (CareerSource.next_poll_at <= now))
        .order_by(CareerSource.next_poll_at.asc().nullsfirst(), CareerSource.id.asc())
        .limit(max(1, min(limit, 1000)))
        .with_for_update(skip_locked=True)
    ).all()
    # Commit a short lease before network I/O so overlapping Cron invocations do not poll the same tenants.
    for source in sources:
        source.next_poll_at = now + timedelta(minutes=15)
        session.add(source)
    session.commit()
    for source in sources:
        session.refresh(source)
    semaphore = asyncio.Semaphore(max(1, min(concurrency, 50)))

    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        async def fetch(source: CareerSource) -> tuple[CareerSource, CareerFetchResult | Exception]:
            async with semaphore:
                try:
                    return source, await fetch_career_source(source, client)
                except Exception as exc:  # the per-source result records the actionable failure
                    return source, exc

        fetched = await asyncio.gather(*(fetch(source) for source in sources))

    summaries: list[CareerSyncSummary] = []
    for source, result in fetched:
        if isinstance(result, Exception):
            summaries.append(mark_career_fetch_failed(session, source, result))
        else:
            summaries.append(apply_career_fetch(session, source, result))
    return summaries


def search_aggregated_jobs(session: Session, filters: JobSearchIn, *, limit: int = 40) -> list[JobSearchResultOut]:
    statement = (
        select(ExternalJob, CareerSource)
        .join(CareerSource, CareerSource.id == ExternalJob.career_source_id)
        .where(ExternalJob.active.is_(True), CareerSource.enabled.is_(True))
    )
    keywords = [part for part in re.findall(r"[\w+#.-]+", filters.keywords, re.UNICODE) if part]
    for keyword in keywords:
        pattern = f"%{keyword}%"
        statement = statement.where(
            ExternalJob.title.ilike(pattern) | ExternalJob.company.ilike(pattern) | ExternalJob.description.ilike(pattern)
        )
    location = filters.location.strip()
    if location and location not in {"All New Zealand", "Remote"}:
        statement = statement.where(ExternalJob.location.ilike(f"%{location}%"))
    else:
        statement = statement.where(ExternalJob.country_code == "NZ")
    if location == "Remote" or filters.job_type == "remote":
        statement = statement.where(ExternalJob.workplace_type.ilike("%remote%"))
    elif filters.job_type:
        job_type_patterns = {
            "fulltime": "%full%",
            "parttime": "%part%",
            "contract": "%contract%",
            "casual": "%casual%",
        }
        pattern = job_type_patterns.get(filters.job_type)
        if pattern:
            statement = statement.where(ExternalJob.employment_type.ilike(pattern))
    if filters.min_salary.strip().isdigit():
        statement = statement.where(ExternalJob.salary_max >= int(filters.min_salary))
    rows = session.exec(statement.order_by(ExternalJob.posted_date.desc().nullslast(), ExternalJob.last_seen_at.desc()).limit(limit)).all()
    return [
        JobSearchResultOut(
            source_id=f"ats:{source.source_type}",
            source_name=f"{source.company_name} careers",
            search_url=source.careers_url,
            company_logo_url=job.company_logo_url,
            job=JobSaveIn(
                title=job.title,
                company=job.company,
                location=job.location,
                description=job.description,
                salary=job.salary,
                employment_type=job.employment_type,
                workplace_type=job.workplace_type,
                url=job.url,
                apply_url=job.apply_url,
                company_url=job.company_url,
                external_job_id=job.external_job_id,
                source_website=_source_website(source),
                posted_date=job.posted_date,
                closing_date=job.closing_date,
            ),
        )
        for job, source in rows
    ]
