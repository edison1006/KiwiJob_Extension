from __future__ import annotations

import html
import ipaddress
import json
import re
import socket
from datetime import datetime
from html.parser import HTMLParser
from typing import Any
from urllib.parse import quote_plus, urljoin, urlparse

import httpx

from app.schemas import JobSaveIn, JobSearchIn, JobSearchResultOut

MAX_HTML_BYTES = 2_000_000
USER_AGENT = "KiwiJobBot/1.0 (+https://kiwijob.local)"


class JobExtractError(ValueError):
    pass


class JobSearchError(ValueError):
    pass


SOURCE_NAMES = {
    "seek": "SEEK NZ",
    "trademe": "Trade Me Jobs",
    "indeed": "Indeed NZ",
    "linkedin": "LinkedIn Jobs",
    "jora": "Jora NZ",
    "govt": "jobs.govt.nz",
}


class _JobHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.json_ld: list[str] = []
        self.meta: dict[str, str] = {}
        self.h1: str = ""
        self.title: str = ""
        self._script_type: str | None = None
        self._script_chunks: list[str] = []
        self._capture_title = False
        self._capture_h1 = False
        self._title_chunks: list[str] = []
        self._h1_chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {k.lower(): v or "" for k, v in attrs}
        if tag == "script":
            self._script_type = attr.get("type", "").lower()
            self._script_chunks = []
        elif tag == "meta":
            key = attr.get("property") or attr.get("name")
            content = attr.get("content", "").strip()
            if key and content:
                self.meta[key.lower()] = html.unescape(content)
        elif tag == "title":
            self._capture_title = True
            self._title_chunks = []
        elif tag == "h1" and not self.h1:
            self._capture_h1 = True
            self._h1_chunks = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            if self._script_type == "application/ld+json":
                raw = "".join(self._script_chunks).strip()
                if raw:
                    self.json_ld.append(raw)
            self._script_type = None
            self._script_chunks = []
        elif tag == "title":
            self.title = _clean_text("".join(self._title_chunks))
            self._capture_title = False
        elif tag == "h1":
            self.h1 = _clean_text("".join(self._h1_chunks))
            self._capture_h1 = False

    def handle_data(self, data: str) -> None:
        if self._script_type is not None:
            self._script_chunks.append(data)
        if self._capture_title:
            self._title_chunks.append(data)
        if self._capture_h1:
            self._h1_chunks.append(data)


def _clean_text(value: str | None, *, limit: int | None = None) -> str | None:
    if not value:
        return None
    text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value))).strip()
    if not text:
        return None
    return text[:limit] if limit else text


def _scalar(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (int, float, bool)):
        return str(value)
    return None


def _type_matches(value: Any, expected: str) -> bool:
    if value == expected:
        return True
    return isinstance(value, list) and expected in value


def _flatten_json_ld(value: Any, out: list[dict[str, Any]]) -> None:
    if value is None:
        return
    if isinstance(value, list):
        for item in value:
            _flatten_json_ld(item, out)
        return
    if not isinstance(value, dict):
        return
    graph = value.get("@graph")
    if isinstance(graph, list):
        for item in graph:
            _flatten_json_ld(item, out)
        return
    out.append(value)


def _org_name(value: Any) -> str | None:
    if isinstance(value, list):
        return _org_name(value[0] if value else None)
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        return _scalar(value.get("name"))
    return None


def _urls_from_value(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, list):
        return [url for item in value for url in _urls_from_value(item)]
    if isinstance(value, dict):
        return [*_urls_from_value(value.get("url")), *_urls_from_value(value.get("@id"))]
    return []


def _url_from_value(value: Any) -> str | None:
    urls = _urls_from_value(value)
    return urls[0] if urls else None


def _postal_address(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if not isinstance(value, dict):
        return None
    parts = [_scalar(value.get("addressLocality")), _scalar(value.get("addressRegion")), _scalar(value.get("addressCountry"))]
    filtered = [part for part in parts if part]
    return ", ".join(filtered) if filtered else None


def _job_location(value: Any) -> str | None:
    if isinstance(value, list):
        parts = [_job_location(item) for item in value]
        filtered = [part for part in parts if part]
        return " · ".join(filtered) if filtered else None
    if isinstance(value, str):
        return value.strip() or None
    if not isinstance(value, dict):
        return None
    address = _postal_address(value.get("address"))
    name = _scalar(value.get("name"))
    if address and name:
        return f"{name} ({address})"
    return address or name


def _employment_type(value: Any) -> str | None:
    if isinstance(value, list):
        parts = [_employment_type(item) for item in value]
        filtered = [part for part in parts if part]
        return ", ".join(dict.fromkeys(filtered)) if filtered else None
    raw = _scalar(value)
    if not raw:
        return None
    return re.sub(r"\b\w", lambda match: match.group(0).upper(), raw.replace("_", " ").lower())


def _salary(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list):
        return next((item for item in (_salary(v) for v in value) if item), None)
    if not isinstance(value, dict):
        return None
    currency = _scalar(value.get("currency")) or _scalar(value.get("salaryCurrency")) or ""
    unit = _scalar(value.get("unitText")) or _scalar(value.get("unitCode")) or ""
    raw = value.get("value")
    if isinstance(raw, (str, int, float)):
        return " ".join(part for part in (currency, str(raw), unit) if part)
    if isinstance(raw, dict):
        min_value = _scalar(raw.get("minValue"))
        max_value = _scalar(raw.get("maxValue"))
        single = _scalar(raw.get("value"))
        unit = unit or _scalar(raw.get("unitText")) or _scalar(raw.get("unitCode")) or ""
        if min_value and max_value:
            return " ".join(part for part in (currency, f"{min_value}-{max_value}", unit) if part)
        if single:
            return " ".join(part for part in (currency, single, unit) if part)
    return None


def _workplace_type(node: dict[str, Any], location: str | None) -> str | None:
    raw = " ".join(part for part in (_scalar(node.get("jobLocationType")), _scalar(node.get("applicantLocationRequirements")), location) if part)
    if re.search(r"telecommute|remote|work from home", raw, re.I):
        return "Remote"
    if re.search(r"hybrid", raw, re.I):
        return "Hybrid"
    return "On-site" if location else None


def _identifier(value: Any) -> str | None:
    if isinstance(value, dict):
        return _scalar(value.get("value")) or _scalar(value.get("name"))
    return _scalar(value)


def _source_from_url(url: str) -> str:
    host = urlparse(url).hostname or "unknown"
    return host.removeprefix("www.")


def _seek_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower().replace("&", "and"))
    return slug.strip("-")


def _joined_query(filters: JobSearchIn) -> str:
    parts = [filters.keywords.strip()]
    if filters.job_type == "remote":
        parts.append("remote")
    return " ".join(part for part in parts if part)


def _build_search_url(source: str, filters: JobSearchIn) -> str:
    query = _joined_query(filters)
    location = filters.location.strip()
    if source == "seek":
        keywords = _seek_slug(query)
        location_slug = "" if location in {"", "All New Zealand", "Remote"} else _seek_slug(location)
        path = f"{keywords}-jobs" if keywords else "jobs"
        loc_path = f"/in-{location_slug}" if location_slug else ""
        url = f"https://nz.seek.com/{path}{loc_path}"
        params: list[str] = []
        if filters.min_salary.strip():
            params.append(f"salaryrange={filters.min_salary.strip()}-")
        worktypes = {"fulltime": "242", "parttime": "243", "contract": "244", "casual": "245"}
        if filters.job_type in worktypes:
            params.append(f"worktype={worktypes[filters.job_type]}")
        return f"{url}?{'&'.join(params)}" if params else url
    if source == "trademe":
        params = {"search_string": query, "location": "" if location == "All New Zealand" else location}
        return _url_with_query("https://www.trademe.co.nz/a/jobs/search", params)
    if source == "indeed":
        return _url_with_query("https://nz.indeed.com/jobs", {"q": query, "l": "" if location == "All New Zealand" else location})
    if source == "linkedin":
        params = {"keywords": query, "location": "New Zealand" if location == "All New Zealand" else location}
        return _url_with_query("https://www.linkedin.com/jobs/search/", params)
    if source == "jora":
        return _url_with_query("https://nz.jora.com/jobs", {"q": query, "l": "" if location == "All New Zealand" else location})
    if source == "govt":
        return _url_with_query("https://jobs.govt.nz/jobs", {"q": query, "location": "" if location == "All New Zealand" else location})
    raise JobSearchError(f"Unsupported job source: {source}")


def _url_with_query(base: str, params: dict[str, str]) -> str:
    query = "&".join(f"{key}={quote_plus(value)}" for key, value in params.items() if value.strip())
    return f"{base}?{query}" if query else base


def _datetime_string(value: Any) -> str | None:
    raw = _scalar(value)
    if not raw:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        return f"{raw}T00:00:00"
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return None


def _validate_public_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise JobExtractError("Enter a valid http or https job posting URL.")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise JobExtractError("Could not resolve the job posting host.") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            raise JobExtractError("Job posting URL must be on a public website.")
    return url


async def _fetch_html(url: str) -> tuple[str, str]:
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=12,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise JobExtractError("Could not fetch the job posting. The site may block server-side requests.") from exc

    content_type = response.headers.get("content-type", "")
    if "html" not in content_type.lower():
        raise JobExtractError("The URL did not return an HTML job posting.")
    body = response.content[:MAX_HTML_BYTES]
    return body.decode(response.encoding or "utf-8", errors="replace"), str(response.url)


def _job_from_json_ld(raw_scripts: list[str], page_url: str) -> dict[str, Any] | None:
    nodes: list[dict[str, Any]] = []
    for raw in raw_scripts:
        try:
            _flatten_json_ld(json.loads(raw), nodes)
        except json.JSONDecodeError:
            continue
    for node in nodes:
        if not _type_matches(node.get("@type"), "JobPosting"):
            continue
        title = _clean_text(_scalar(node.get("title")), limit=500)
        company = _clean_text(_org_name(node.get("hiringOrganization")), limit=500)
        location = _clean_text(_job_location(node.get("jobLocation")), limit=1000)
        description = _clean_text(_scalar(node.get("description")), limit=50000)
        if not any([title, company, location, description]):
            continue
        employment_type = _employment_type(node.get("employmentType"))
        salary = _salary(node.get("baseSalary")) or _salary(node.get("estimatedSalary"))
        apply_url = _url_from_value(node.get("url")) or _url_from_value(node.get("sameAs")) or page_url
        payload: dict[str, Any] = {
            "title": title or "Untitled job posting",
            "company": company,
            "location": location,
            "description": description,
            "salary": salary,
            "employment_type": employment_type,
            "workplace_type": _workplace_type(node, location),
            "url": page_url,
            "apply_url": apply_url,
            "company_url": _url_from_value(node.get("hiringOrganization")),
            "external_job_id": _identifier(node.get("identifier")),
            "source_website": _source_from_url(page_url),
            "posted_date": _datetime_string(node.get("datePosted")),
            "closing_date": _datetime_string(node.get("validThrough")),
            "status": "Saved",
        }
        return {key: value for key, value in payload.items() if value is not None}
    return None


def _job_from_html(parser: _JobHtmlParser, page_url: str) -> dict[str, Any]:
    title = parser.h1 or parser.meta.get("og:title") or parser.meta.get("twitter:title") or parser.title
    site = parser.meta.get("og:site_name")
    description = parser.meta.get("description") or parser.meta.get("og:description") or parser.meta.get("twitter:description")
    title = _clean_text(title, limit=500) or "Untitled job posting"
    if " | " in title:
        title = title.split(" | ", 1)[0].strip()
    return {
        "title": title,
        "company": _clean_text(site, limit=500),
        "description": _clean_text(description, limit=50000),
        "url": page_url,
        "apply_url": page_url,
        "source_website": _source_from_url(page_url),
        "status": "Saved",
    }


def _strip_tags(value: str) -> str:
    return _clean_text(value) or ""


def _attr(block: str, name: str) -> str | None:
    match = re.search(rf'{re.escape(name)}="([^"]+)"', block)
    return html.unescape(match.group(1)) if match else None


def _first_text(block: str, pattern: str) -> str | None:
    match = re.search(pattern, block, re.I | re.S)
    return _strip_tags(match.group(1)) if match else None


def _parse_seek_results(raw_html: str, search_url: str, limit: int) -> list[JobSearchResultOut]:
    blocks = re.split(r'(?=data-testid="job-card")', raw_html)
    results: list[JobSearchResultOut] = []
    seen: set[str] = set()
    for block in blocks:
        if 'data-automation="jobTitle"' not in block:
            continue
        card = block[:12000]
        job_id = _attr(card, "data-job-id")
        title = _first_text(card, r'data-automation="jobTitle"[^>]*>(.*?)</a>')
        href = _attr(card, "href")
        title_href = re.search(r'<a\s+href="([^"]+)"[^>]*data-automation="jobTitle"', card, re.I | re.S)
        if title_href:
            href = html.unescape(title_href.group(1))
        if not title or not href:
            continue
        url = urljoin(search_url, href).split("&origin=")[0]
        unique_key = job_id or url
        if unique_key in seen:
            continue
        seen.add(unique_key)
        company = _first_text(card, r'data-automation="jobCompany"[^>]*>(.*?)</a>')
        locations = re.findall(r'data-automation="jobCardLocation"[^>]*>(.*?)</span>', card, re.I | re.S)
        location_parts = [_strip_tags(item).strip(" ,") for item in locations]
        location = _clean_text(", ".join(part for part in location_parts if part), limit=1000)
        classification = _first_text(card, r'data-automation="jobClassification"[^>]*>(.*?)</a>')
        salary = _first_text(card, r'data-automation="jobSalary"[^>]*>(.*?)</span>')
        teaser = _first_text(card, r'data-automation="jobShortDescription"[^>]*>(.*?)</span>')
        listed = _first_text(card, r'aria-label="Listed[^"]*"[^>]*>(.*?)</div>')
        job = JobSaveIn(
            title=title,
            company=company,
            location=location,
            description=teaser or classification or listed,
            salary=salary,
            employment_type=classification,
            url=url,
            apply_url=url,
            external_job_id=job_id,
            source_website="seek.co.nz",
            status="Saved",
        )
        results.append(JobSearchResultOut(source_id="seek", source_name=SOURCE_NAMES["seek"], search_url=search_url, job=job))
        if len(results) >= limit:
            break
    return results


def _parse_generic_json_ld_results(raw_html: str, search_url: str, source_id: str, limit: int) -> list[JobSearchResultOut]:
    parser = _JobHtmlParser()
    parser.feed(raw_html)
    nodes: list[dict[str, Any]] = []
    for raw in parser.json_ld:
        try:
            _flatten_json_ld(json.loads(raw), nodes)
        except json.JSONDecodeError:
            continue
    results: list[JobSearchResultOut] = []
    seen: set[str] = set()
    for node in nodes:
        if not _type_matches(node.get("@type"), "JobPosting"):
            continue
        page_url = urljoin(search_url, _url_from_value(node.get("url")) or search_url)
        if page_url in seen:
            continue
        seen.add(page_url)
        payload = _job_from_json_ld([json.dumps(node)], page_url)
        if not payload:
            continue
        results.append(
            JobSearchResultOut(
                source_id=source_id,
                source_name=SOURCE_NAMES.get(source_id, source_id),
                search_url=search_url,
                job=JobSaveIn(**payload),
            )
        )
        if len(results) >= limit:
            break
    return results


async def extract_job_from_url(url: str) -> JobSaveIn:
    page_url = _validate_public_url(url.strip())
    raw_html, final_url = await _fetch_html(page_url)
    parser = _JobHtmlParser()
    parser.feed(raw_html)
    payload = _job_from_json_ld(parser.json_ld, final_url) or _job_from_html(parser, final_url)
    return JobSaveIn(**payload)


async def search_jobs(filters: JobSearchIn, *, per_source_limit: int = 8) -> list[JobSearchResultOut]:
    results: list[JobSearchResultOut] = []
    for source in filters.sources:
        source_id = source.strip().lower()
        if source_id not in SOURCE_NAMES:
            continue
        search_url = _build_search_url(source_id, filters)
        try:
            raw_html, final_url = await _fetch_html(search_url)
        except JobExtractError:
            continue
        if source_id == "seek":
            parsed = _parse_seek_results(raw_html, final_url, per_source_limit)
        else:
            parsed = _parse_generic_json_ld_results(raw_html, final_url, source_id, per_source_limit)
        results.extend(parsed)
    return results
