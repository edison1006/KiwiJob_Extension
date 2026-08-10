from __future__ import annotations

import asyncio
import hashlib
import html
import ipaddress
import json
import re
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from typing import Any, Protocol
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from sqlalchemy import case, or_
from sqlmodel import Session, select

from app.core.time import utc_now
from app.models import CareerSource, ExternalJob
from app.schemas import JobSaveIn, JobSearchIn, JobSearchResultOut
from app.services.job_classifications import classification_terms


CAREER_SOURCE_USER_AGENT = "KiwiJobCareerSync/1.0 (+https://kiwijob.co.nz)"
SUPPORTED_SOURCE_TYPES = frozenset({"generic", "greenhouse", "lever", "smartrecruiters"})
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


class _OpenGraphImageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.image_url: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "meta" or self.image_url:
            return
        values = {key.lower(): value for key, value in attrs if value is not None}
        if values.get("property", "").lower() == "og:image":
            self.image_url = values.get("content", "").strip() or None


async def _smartrecruiters_company_logo(source: CareerSource, client: httpx.AsyncClient) -> str | None:
    try:
        response = await client.get(
            f"https://careers.smartrecruiters.com/{source.tenant_key}",
            headers={"Accept": "text/html", "User-Agent": CAREER_SOURCE_USER_AGENT},
        )
        response.raise_for_status()
    except httpx.HTTPError:
        return None
    parser = _OpenGraphImageParser()
    parser.feed(response.text[:2_000_000])
    logo_url = parser.image_url
    parsed = urlparse(logo_url or "")
    if parsed.scheme != "https" or not parsed.hostname or not (
        parsed.hostname == "smartrecruiters.com" or parsed.hostname.endswith(".smartrecruiters.com")
    ):
        return None
    return logo_url[:4096]


class _StructuredJobPageParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.links: set[str] = set()
        self.logo_url: str | None = None
        self.json_ld_blocks: list[str] = []
        self._json_ld_depth = 0
        self._json_ld_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value for key, value in attrs if value is not None}
        lowered = tag.lower()
        if lowered == "script" and values.get("type", "").lower() == "application/ld+json":
            self._json_ld_depth = 1
            self._json_ld_parts = []
            return
        if self._json_ld_depth:
            self._json_ld_depth += 1
        if lowered == "meta" and values.get("property", "").lower() == "og:image":
            self.logo_url = urljoin(self.base_url, values.get("content", "").strip()) or self.logo_url
        for key in ("href", "src"):
            value = values.get(key)
            if value:
                parsed = urlparse(urljoin(self.base_url, value.strip()))
                if parsed.scheme in {"http", "https"} and parsed.hostname:
                    self.links.add(parsed.geturl().split("#", 1)[0])

    def handle_endtag(self, tag: str) -> None:
        if not self._json_ld_depth:
            return
        self._json_ld_depth -= 1
        if tag.lower() == "script" or self._json_ld_depth == 0:
            block = "".join(self._json_ld_parts).strip()
            if block:
                self.json_ld_blocks.append(block)
            self._json_ld_depth = 0
            self._json_ld_parts = []

    def handle_data(self, data: str) -> None:
        if self._json_ld_depth:
            self._json_ld_parts.append(data)


def _public_http_url(value: str) -> str | None:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower().rstrip(".")
    if host == "localhost" or host.endswith(".localhost"):
        return None
    try:
        if not ipaddress.ip_address(host).is_global:
            return None
    except ValueError:
        pass
    return parsed.geturl()


async def _robots_policy(client: httpx.AsyncClient, url: str) -> RobotFileParser | None:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    try:
        response = await client.get(robots_url, headers={"User-Agent": CAREER_SOURCE_USER_AGENT})
        if response.status_code >= 400:
            return None
    except httpx.HTTPError:
        return None
    parser = RobotFileParser()
    parser.set_url(robots_url)
    parser.parse(response.text.splitlines())
    return parser


async def _robots_allows(client: httpx.AsyncClient, url: str) -> bool:
    parser = await _robots_policy(client, url)
    return parser is None or parser.can_fetch(CAREER_SOURCE_USER_AGENT, url)


def _json_ld_job_postings(value: Any) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    if isinstance(value, list):
        for item in value:
            jobs.extend(_json_ld_job_postings(item))
    elif isinstance(value, dict):
        item_type = value.get("@type")
        types = item_type if isinstance(item_type, list) else [item_type]
        if any(str(candidate).lower() == "jobposting" for candidate in types):
            jobs.append(value)
        for key in ("@graph", "itemListElement", "mainEntity"):
            if key in value:
                jobs.extend(_json_ld_job_postings(value[key]))
    return jobs


def _structured_salary(raw: Any) -> tuple[str | None, int | None, int | None, str | None]:
    if not isinstance(raw, dict):
        return None, None, None, None
    currency = _text(raw.get("currency"), limit=10)
    value = raw.get("value") if isinstance(raw.get("value"), dict) else raw
    minimum = _int_or_none(value.get("minValue"))
    maximum = _int_or_none(value.get("maxValue"))
    exact = _int_or_none(value.get("value"))
    minimum = minimum if minimum is not None else exact
    maximum = maximum if maximum is not None else exact
    unit = _text(value.get("unitText"), limit=50)
    return _salary_text(currency, minimum, maximum, unit, None), minimum, maximum, currency


def _structured_location(raw: Any) -> tuple[str | None, str | None]:
    locations = raw if isinstance(raw, list) else [raw]
    parts: list[str] = []
    country_code: str | None = None
    for location in locations:
        if not isinstance(location, dict):
            continue
        address = location.get("address") if isinstance(location.get("address"), dict) else location
        country = address.get("addressCountry")
        if isinstance(country, dict):
            country = country.get("name") or country.get("value")
        country_code = country_code or _country(country)
        rendered = _location([address.get("addressLocality"), address.get("addressRegion"), country])
        if rendered:
            parts.append(rendered)
    return "; ".join(dict.fromkeys(parts)) or None, country_code


def _normalize_structured_job(raw: dict[str, Any], page_url: str, source: CareerSource, logo_url: str | None) -> NormalizedCareerJob | None:
    title = _text(raw.get("title") or raw.get("name"), limit=500)
    job_url = _public_http_url(str(raw.get("url") or page_url))
    if not title or not job_url:
        return None
    organization = raw.get("hiringOrganization") if isinstance(raw.get("hiringOrganization"), dict) else {}
    identifier = raw.get("identifier")
    if isinstance(identifier, dict):
        identifier = identifier.get("value") or identifier.get("name")
    external_id = _text(identifier, limit=500) or hashlib.sha256(job_url.encode("utf-8")).hexdigest()
    location, country_code = _structured_location(raw.get("jobLocation"))
    salary, salary_min, salary_max, salary_currency = _structured_salary(raw.get("baseSalary") or raw.get("estimatedSalary"))
    employment = raw.get("employmentType")
    if isinstance(employment, list):
        employment = ", ".join(filter(None, (_text(item) for item in employment)))
    remote = "telecommute" in str(raw.get("jobLocationType") or "").lower()
    raw_logo = organization.get("logo")
    if isinstance(raw_logo, dict):
        raw_logo = raw_logo.get("url")
    company_logo = _public_http_url(str(raw_logo or logo_url or ""))
    return NormalizedCareerJob(
        external_job_id=external_id,
        title=title,
        company=_text(organization.get("name"), limit=500) or source.company_name,
        location=location or ("Remote" if remote else None),
        country_code=country_code or (source.country_code if remote else None),
        description=_text(raw.get("description")),
        salary=salary,
        salary_min=salary_min,
        salary_max=salary_max,
        salary_currency=salary_currency,
        employment_type=_text(employment, limit=500),
        workplace_type="Remote" if remote else _workplace_from_text(raw.get("jobLocationType"), location),
        url=job_url,
        apply_url=job_url,
        company_url=_public_http_url(str(organization.get("sameAs") or source.company_domain or "")),
        company_logo_url=company_logo,
        posted_date=_parse_datetime(raw.get("datePosted")),
        closing_date=_parse_datetime(raw.get("validThrough")),
    )


def _structured_jobs_from_html(html_text: str, page_url: str, source: CareerSource) -> tuple[list[NormalizedCareerJob], _StructuredJobPageParser]:
    parser = _StructuredJobPageParser(page_url)
    parser.feed(html_text[:5_000_000])
    jobs: list[NormalizedCareerJob] = []
    for block in parser.json_ld_blocks:
        try:
            payload = json.loads(block)
        except (json.JSONDecodeError, TypeError):
            continue
        for raw in _json_ld_job_postings(payload):
            job = _normalize_structured_job(raw, page_url, source, parser.logo_url)
            if job:
                jobs.append(job)
    return jobs, parser


async def _sitemap_job_urls(client: httpx.AsyncClient, careers_url: str) -> list[str]:
    parsed = urlparse(careers_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    async def locations(url: str) -> list[str]:
        try:
            response = await client.get(
                url,
                headers={"Accept": "application/xml,text/xml", "User-Agent": CAREER_SOURCE_USER_AGENT},
            )
            response.raise_for_status()
        except httpx.HTTPError:
            return []
        return [html.unescape(item).strip() for item in re.findall(r"<loc>\s*(.*?)\s*</loc>", response.text, re.I | re.S)]

    first_level = await locations(f"{origin}/sitemap.xml")
    urls: list[str] = []
    child_sitemaps = [url for url in first_level if urlparse(url).hostname == parsed.hostname and urlparse(url).path.lower().endswith(".xml")][:10]
    urls.extend(url for url in first_level if url not in child_sitemaps)
    if child_sitemaps:
        for group in await asyncio.gather(*(locations(url) for url in child_sitemaps)):
            urls.extend(group)
    return list(
        dict.fromkeys(
            url for url in urls
            if urlparse(url).hostname == parsed.hostname
            and re.search(r"/(job|jobs|position|positions|vacanc)", urlparse(url).path, re.I)
        )
    )[:500]


class GenericCareerPageAdapter:
    async def fetch(self, source: CareerSource, client: httpx.AsyncClient) -> CareerFetchResult:
        careers_url = _public_http_url(source.careers_url)
        robots = await _robots_policy(client, careers_url) if careers_url else None
        if not careers_url or (robots is not None and not robots.can_fetch(CAREER_SOURCE_USER_AGENT, careers_url)):
            raise CareerSyncError("Generic career page is not a permitted public HTTP URL.")
        headers = _conditional_headers(source)
        headers["Accept"] = "text/html,application/xhtml+xml"
        response = await client.get(careers_url, headers=headers)
        if response.status_code == 304:
            return CareerFetchResult(jobs=[], not_modified=True)
        response.raise_for_status()
        jobs, parser = _structured_jobs_from_html(response.text, str(response.url), source)
        base_host = urlparse(str(response.url)).hostname
        page_detail_urls = [
            link for link in parser.links
            if urlparse(link).hostname == base_host and re.search(r"/(job|jobs|position|positions|vacanc)", urlparse(link).path, re.I)
        ]
        sitemap_detail_urls = await _sitemap_job_urls(client, str(response.url))
        detail_urls = list(dict.fromkeys([*page_detail_urls, *sitemap_detail_urls]))[:500]
        semaphore = asyncio.Semaphore(6)

        async def fetch_detail(url: str) -> list[NormalizedCareerJob]:
            if robots is not None and not robots.can_fetch(CAREER_SOURCE_USER_AGENT, url):
                return []
            async with semaphore:
                try:
                    detail_response = await client.get(
                        url,
                        headers={"Accept": "text/html,application/xhtml+xml", "User-Agent": CAREER_SOURCE_USER_AGENT},
                    )
                    detail_response.raise_for_status()
                except httpx.HTTPError:
                    return []
                detail_jobs, _ = _structured_jobs_from_html(detail_response.text, str(detail_response.url), source)
                return detail_jobs

        if detail_urls:
            for detail_jobs in await asyncio.gather(*(fetch_detail(url) for url in detail_urls)):
                jobs.extend(detail_jobs)
        unique = {job.external_job_id: job for job in jobs}
        return _response_result(response, list(unique.values()))


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

        company_logo_url = await _smartrecruiters_company_logo(source, client)
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
                    company_logo_url=company_logo_url,
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
        "generic": GenericCareerPageAdapter(),
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


def _apply_external_job_filters(statement, filters: JobSearchIn):
    keywords = [part for part in re.findall(r"[\w+#.-]+", filters.keywords, re.UNICODE) if part]
    for keyword in keywords:
        pattern = f"%{keyword}%"
        statement = statement.where(
            ExternalJob.title.ilike(pattern) | ExternalJob.company.ilike(pattern) | ExternalJob.description.ilike(pattern)
        )
    if filters.classification.strip():
        patterns = (filters.classification.strip(), *classification_terms(filters.classification))
        statement = statement.where(
            or_(
                *(
                    ExternalJob.title.ilike(f"%{pattern}%")
                    | ExternalJob.description.ilike(f"%{pattern}%")
                    for pattern in patterns
                )
            )
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
    return statement


def filter_priority_source_ids(session: Session, filters: JobSearchIn, *, limit: int = 500) -> set[int]:
    """Find already-discovered sources most likely to refresh the requested result set."""
    location = filters.location.strip()
    has_filters = bool(
        filters.keywords.strip()
        or filters.job_type.strip()
        or filters.min_salary.strip()
        or (location and location != "All New Zealand")
    )
    if not has_filters:
        return set()

    job_statement = _apply_external_job_filters(
        select(ExternalJob.career_source_id).where(ExternalJob.active.is_(True)),
        filters,
    )
    ids = set(session.exec(job_statement.distinct().limit(max(1, min(limit, 1000)))).all())

    keyword_terms = [part for part in re.findall(r"[\w+#.-]+", filters.keywords, re.UNICODE) if len(part) >= 2]
    if keyword_terms:
        company_matches = session.exec(
            select(CareerSource.id)
            .where(CareerSource.enabled.is_(True), or_(*(CareerSource.company_name.ilike(f"%{term}%") for term in keyword_terms)))
            .limit(max(1, min(limit, 1000)))
        ).all()
        ids.update(source_id for source_id in company_matches if source_id is not None)
    return ids


async def sync_due_career_sources(
    session: Session,
    *,
    limit: int = 100,
    concurrency: int = 10,
    filters: JobSearchIn | None = None,
) -> list[CareerSyncSummary]:
    now = utc_now()
    statement = (
        select(CareerSource)
        .where(CareerSource.enabled.is_(True), (CareerSource.next_poll_at.is_(None)) | (CareerSource.next_poll_at <= now))
    )
    priority_ids = filter_priority_source_ids(session, filters) if filters else set()
    if priority_ids:
        statement = statement.order_by(
            case((CareerSource.id.in_(priority_ids), 0), else_=1),
            CareerSource.next_poll_at.asc().nullsfirst(),
            CareerSource.id.asc(),
        )
    else:
        statement = statement.order_by(CareerSource.next_poll_at.asc().nullsfirst(), CareerSource.id.asc())
    sources = session.exec(statement.limit(max(1, min(limit, 1000))).with_for_update(skip_locked=True)).all()
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
    statement = _apply_external_job_filters(statement, filters)
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
