from __future__ import annotations

import asyncio
import ipaddress
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Iterable
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx

from app.services.career_sources import CAREER_SOURCE_USER_AGENT


CAREER_PATH_TERMS = ("career", "careers", "job", "jobs", "vacanc", "join-us", "work-with-us", "work-for-us")


@dataclass(frozen=True, slots=True)
class CompanySeed:
    company_name: str
    website: str


@dataclass(frozen=True, slots=True)
class DiscoveredCareerSource:
    company_name: str
    company_domain: str
    source_type: str
    tenant_key: str
    careers_url: str

    def registry_item(self, *, country: str = "NZ", interval: int = 60) -> dict[str, str | int]:
        return {
            "company": self.company_name,
            "domain": self.company_domain,
            "type": self.source_type,
            "tenant": self.tenant_key,
            "url": self.careers_url,
            "country": country,
            "interval": interval,
        }


class _LinkParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.urls: set[str] = set()

    def handle_starttag(self, _tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if key.lower() not in {"href", "src", "action"} or not value:
                continue
            absolute = urljoin(self.base_url, value.strip())
            parsed = urlsplit(absolute)
            if parsed.scheme in {"http", "https"} and parsed.hostname:
                self.urls.add(urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, "")))


def _safe_public_web_url(value: str) -> str | None:
    raw = value.strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = f"https://{raw}"
    parsed = urlsplit(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower().rstrip(".")
    if host == "localhost" or host.endswith(".localhost"):
        return None
    try:
        address = ipaddress.ip_address(host)
        if not address.is_global:
            return None
    except ValueError:
        pass
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))


def identify_public_ats_url(url: str, *, company_name: str, company_domain: str) -> DiscoveredCareerSource | None:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    parts = [part for part in parsed.path.split("/") if part]
    if not parts:
        return None

    source_type: str | None = None
    tenant = ""
    careers_url = ""
    if host in {"boards.greenhouse.io", "job-boards.greenhouse.io"}:
        source_type, tenant = "greenhouse", parts[0]
        careers_url = f"https://boards.greenhouse.io/{tenant}"
    elif host == "jobs.lever.co":
        source_type, tenant = "lever", parts[0]
        careers_url = f"https://jobs.lever.co/{tenant}"
    elif host in {"careers.smartrecruiters.com", "jobs.smartrecruiters.com"}:
        source_type, tenant = "smartrecruiters", parts[0]
        careers_url = f"https://careers.smartrecruiters.com/{tenant}"
    if not source_type or not tenant:
        return None
    return DiscoveredCareerSource(
        company_name=company_name.strip(),
        company_domain=company_domain,
        source_type=source_type,
        tenant_key=tenant,
        careers_url=careers_url,
    )


def _links_from_html(html: str, base_url: str) -> set[str]:
    parser = _LinkParser(base_url)
    parser.feed(html[:3_000_000])
    return parser.urls


def _same_site_career_links(urls: Iterable[str], page_url: str) -> list[str]:
    page_host = (urlsplit(page_url).hostname or "").removeprefix("www.").lower()

    def organization_domain(host: str) -> str:
        parts = host.removeprefix("www.").split(".")
        nz_second_levels = {"ac", "co", "geek", "gen", "govt", "iwi", "maori", "net", "org", "school"}
        size = 3 if len(parts) >= 3 and parts[-1] == "nz" and parts[-2] in nz_second_levels else 2
        return ".".join(parts[-size:])

    page_domain = organization_domain(page_host)
    candidates: list[str] = []
    for url in urls:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").removeprefix("www.").lower()
        path = parsed.path.lower()
        if organization_domain(host) == page_domain and any(term in path for term in CAREER_PATH_TERMS):
            candidates.append(urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, "")))
    return sorted(set(candidates), key=lambda item: (len(urlsplit(item).path), item))


async def _robots_allows(client: httpx.AsyncClient, url: str) -> bool:
    parsed = urlsplit(url)
    robots_url = urlunsplit((parsed.scheme, parsed.netloc, "/robots.txt", "", ""))
    try:
        response = await client.get(robots_url, headers={"User-Agent": CAREER_SOURCE_USER_AGENT})
        if response.status_code >= 400:
            return True
    except httpx.HTTPError:
        return True
    parser = RobotFileParser()
    parser.set_url(robots_url)
    parser.parse(response.text.splitlines())
    return parser.can_fetch(CAREER_SOURCE_USER_AGENT, url)


async def discover_company_sources(
    seed: CompanySeed,
    client: httpx.AsyncClient,
    *,
    max_pages: int = 4,
) -> list[DiscoveredCareerSource]:
    website = _safe_public_web_url(seed.website)
    if not website or not seed.company_name.strip() or not await _robots_allows(client, website):
        return []
    parsed_website = urlsplit(website)
    root_host = (parsed_website.hostname or "").removeprefix("www.")
    origin = urlunsplit((parsed_website.scheme, parsed_website.netloc, "", "", ""))
    queue = [
        website,
        urljoin(f"{origin}/", "careers"),
        urljoin(f"{origin}/", "jobs"),
        f"{parsed_website.scheme}://careers.{root_host}/",
    ]
    visited: set[str] = set()
    discovered: dict[tuple[str, str], DiscoveredCareerSource] = {}
    generic_pages: set[str] = set()
    while queue and len(visited) < max(1, min(max_pages, 8)):
        page_url = queue.pop(0)
        if page_url in visited or not await _robots_allows(client, page_url):
            continue
        visited.add(page_url)
        try:
            response = await client.get(
                page_url,
                headers={"Accept": "text/html,application/xhtml+xml", "User-Agent": CAREER_SOURCE_USER_AGENT},
            )
            response.raise_for_status()
            if "html" not in response.headers.get("content-type", "text/html").lower():
                continue
        except httpx.HTTPError:
            continue
        redirected_source = identify_public_ats_url(
            str(response.url),
            company_name=seed.company_name,
            company_domain=website,
        )
        if redirected_source:
            discovered[(redirected_source.source_type, redirected_source.tenant_key.lower())] = redirected_source
        links = _links_from_html(response.text, str(response.url))
        for link in links:
            source = identify_public_ats_url(link, company_name=seed.company_name, company_domain=website)
            if source:
                discovered[(source.source_type, source.tenant_key.lower())] = source
        for candidate in _same_site_career_links(links, str(response.url)):
            generic_pages.add(candidate)
            if candidate not in visited and candidate not in queue:
                queue.append(candidate)
        response_host = (urlsplit(str(response.url)).hostname or "").lower()
        response_path = urlsplit(str(response.url)).path.lower()
        has_job_content = "jobposting" in response.text.lower() or any(
            re_term in urlsplit(link).path.lower()
            for link in links
            for re_term in ("/job/", "/jobs/", "/position/", "/vacanc")
        )
        if has_job_content and (response_host.startswith("careers.") or any(term in response_path for term in CAREER_PATH_TERMS)):
            generic_pages.add(str(response.url).split("#", 1)[0])
    if not discovered and generic_pages:
        careers_url = sorted(generic_pages, key=lambda item: (not (urlsplit(item).hostname or "").startswith("careers."), len(item)))[0]
        host = (urlsplit(careers_url).hostname or root_host).removeprefix("www.")
        source = DiscoveredCareerSource(
            company_name=seed.company_name.strip(),
            company_domain=website,
            source_type="generic",
            tenant_key=host[:199],
            careers_url=careers_url,
        )
        discovered[(source.source_type, source.tenant_key.lower())] = source
    return sorted(discovered.values(), key=lambda item: (item.source_type, item.tenant_key.lower()))


async def discover_company_registry(
    seeds: list[CompanySeed],
    *,
    concurrency: int = 10,
    max_pages: int = 4,
) -> list[DiscoveredCareerSource]:
    semaphore = asyncio.Semaphore(max(1, min(concurrency, 30)))
    limits = httpx.Limits(max_connections=max(2, min(concurrency, 30)), max_keepalive_connections=10)
    async with httpx.AsyncClient(follow_redirects=True, timeout=15, limits=limits) as client:
        async def discover(seed: CompanySeed) -> list[DiscoveredCareerSource]:
            async with semaphore:
                return await discover_company_sources(seed, client, max_pages=max_pages)

        groups = await asyncio.gather(*(discover(seed) for seed in seeds))
    unique: dict[tuple[str, str], DiscoveredCareerSource] = {}
    for group in groups:
        for source in group:
            unique[(source.source_type, source.tenant_key.lower())] = source
    return sorted(unique.values(), key=lambda item: (item.company_name.lower(), item.source_type, item.tenant_key.lower()))
