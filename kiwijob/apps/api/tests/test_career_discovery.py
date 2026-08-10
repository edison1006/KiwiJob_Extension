from __future__ import annotations

import asyncio
import csv
import io
from pathlib import Path
from zipfile import ZipFile

import httpx

from app.services.career_discovery import CompanySeed, discover_company_sources, identify_public_ats_url
from scripts.career_sources import _load_company_seeds


def _csv_text(fieldnames: list[str], rows: list[dict[str, str]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def test_companies_office_zip_joins_registered_companies_to_all_public_websites(tmp_path: Path) -> None:
    archive_path = tmp_path / "Companies Office Bulk Data.zip"
    core = _csv_text(
        ["NZBN", "ENTITY_NAME", "ENTITY_STATUS"],
        [
            {"NZBN": "1", "ENTITY_NAME": "Active One Limited", "ENTITY_STATUS": "Registered"},
            {"NZBN": "2", "ENTITY_NAME": "Removed Limited", "ENTITY_STATUS": "Removed"},
            {"NZBN": "3", "ENTITY_NAME": "Active Two Limited", "ENTITY_STATUS": "Registered"},
        ],
    )
    websites = _csv_text(
        ["NZBN", "ENTITY_NAME", "START_DATE", "WEBSITE"],
        [
            {"NZBN": "1", "ENTITY_NAME": "Active One Limited", "START_DATE": "01/01/2025", "WEBSITE": "one.example.nz"},
            {"NZBN": "1", "ENTITY_NAME": "Active One Limited", "START_DATE": "02/01/2025", "WEBSITE": "careers.one.example.nz"},
            {"NZBN": "1", "ENTITY_NAME": "Active One Limited", "START_DATE": "03/01/2025", "WEBSITE": "one.example.nz/"},
            {"NZBN": "2", "ENTITY_NAME": "Removed Limited", "START_DATE": "01/01/2025", "WEBSITE": "removed.example.nz"},
            {"NZBN": "3", "ENTITY_NAME": "Active Two Limited", "START_DATE": "01/01/2025", "WEBSITE": "No website"},
            {"NZBN": "3", "ENTITY_NAME": "Active Two Limited", "START_DATE": "02/01/2025", "WEBSITE": "two.example.nz"},
        ],
    )
    with ZipFile(archive_path, "w") as archive:
        archive.writestr("nested/companies_core_data.csv", core)
        archive.writestr("nested/companies_website.csv", websites)

    seeds, companies = _load_company_seeds(archive_path, offset=0, limit=1)
    assert companies == 1
    assert [(seed.company_name, seed.website) for seed in seeds] == [
        ("Active One Limited", "one.example.nz"),
        ("Active One Limited", "careers.one.example.nz"),
    ]

    second_batch, companies = _load_company_seeds(archive_path, offset=1, limit=1)
    assert companies == 1
    assert [(seed.company_name, seed.website) for seed in second_batch] == [("Active Two Limited", "two.example.nz")]


def test_identify_supported_public_ats_urls() -> None:
    cases = {
        "https://boards.greenhouse.io/acme/jobs/123": ("greenhouse", "acme"),
        "https://jobs.lever.co/example/abc": ("lever", "example"),
        "https://jobs.smartrecruiters.com/AirNewZealand/123-role": ("smartrecruiters", "AirNewZealand"),
    }
    for url, expected in cases.items():
        source = identify_public_ats_url(url, company_name="Example NZ", company_domain="https://example.co.nz")
        assert source is not None
        assert (source.source_type, source.tenant_key) == expected


def test_discover_company_sources_follows_public_career_link() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        if request.url.path == "/":
            return httpx.Response(
                200,
                headers={"content-type": "text/html"},
                text='<a href="https://careers.example.co.nz/careers">Careers</a>',
            )
        if request.url.path == "/careers":
            return httpx.Response(
                200,
                headers={"content-type": "text/html"},
                text='<a href="https://jobs.lever.co/example-nz">View open roles</a>',
            )
        return httpx.Response(404)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True) as client:
            return await discover_company_sources(
                CompanySeed(company_name="Example NZ", website="https://example.co.nz"),
                client,
            )

    sources = asyncio.run(run())
    assert len(sources) == 1
    assert sources[0].source_type == "lever"
    assert sources[0].tenant_key == "example-nz"
    assert sources[0].company_domain == "https://example.co.nz/"


def test_discovery_respects_robots_exclusion() -> None:
    requests: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /")
        return httpx.Response(200, headers={"content-type": "text/html"}, text="")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await discover_company_sources(
                CompanySeed(company_name="Private Crawl NZ", website="https://private.example.co.nz"),
                client,
            )

    assert asyncio.run(run()) == []
    assert requests == ["/robots.txt"]


def test_discovery_registers_generic_structured_career_site() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        if request.url.host == "careers.example.co.nz":
            return httpx.Response(
                200,
                headers={"content-type": "text/html"},
                text='<script type="application/ld+json">{"@type":"JobPosting","title":"Engineer"}</script>',
            )
        return httpx.Response(404)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True) as client:
            return await discover_company_sources(
                CompanySeed(company_name="Example NZ", website="https://www.example.co.nz"),
                client,
            )

    sources = asyncio.run(run())
    assert len(sources) == 1
    assert sources[0].source_type == "generic"
    assert sources[0].careers_url == "https://careers.example.co.nz/"
