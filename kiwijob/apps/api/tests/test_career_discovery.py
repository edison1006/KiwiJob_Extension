from __future__ import annotations

import asyncio

import httpx

from app.services.career_discovery import CompanySeed, discover_company_sources, identify_public_ats_url


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
