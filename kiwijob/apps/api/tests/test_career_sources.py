from __future__ import annotations

import asyncio
from datetime import datetime

import httpx
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.session import get_engine
from app.main import app
from app.models import CareerSource
from app.routers.jobs import _search_relevance, _search_result_keys
from app.schemas import JobSaveIn, JobSearchResultOut
from app.services.career_sources import CareerFetchResult, NormalizedCareerJob, apply_career_fetch, fetch_career_source
from conftest import auth_headers


def test_title_keyword_match_ranks_above_description_match() -> None:
    title_match = JobSearchResultOut(
        source_id="seek",
        source_name="SEEK NZ",
        search_url="https://seek.example/search",
        job=JobSaveIn(title="Data Analyst", url="https://seek.example/data", description="Build reporting."),
    )
    description_match = JobSearchResultOut(
        source_id="ats:smartrecruiters",
        source_name="Example careers",
        search_url="https://careers.example/jobs",
        job=JobSaveIn(title="Workforce Planner", url="https://careers.example/planner", description="Use data for planning."),
    )

    assert _search_relevance(title_match, "data") > _search_relevance(description_match, "data")


def test_same_job_on_company_site_and_ats_has_shared_dedupe_key() -> None:
    company_site = JobSearchResultOut(
        source_id="ats:generic",
        source_name="Example careers",
        search_url="https://careers.example.co.nz",
        job=JobSaveIn(title="Data Analyst", company="Example NZ", location="Auckland, NZ", url="https://careers.example.co.nz/job/123"),
    )
    ats_site = JobSearchResultOut(
        source_id="ats:smartrecruiters",
        source_name="Example careers",
        search_url="https://careers.smartrecruiters.com/example",
        job=JobSaveIn(title="Data Analyst", company="Example NZ", location="Auckland, NZ", url="https://jobs.smartrecruiters.com/example/abc"),
    )

    assert _search_result_keys(company_site).intersection(_search_result_keys(ats_site))


def test_greenhouse_adapter_normalizes_and_filters_nz_jobs() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "boards-api.greenhouse.io"
        assert request.url.params["content"] == "true"
        return httpx.Response(
            200,
            headers={"etag": '"jobs-v1"'},
            json={
                "jobs": [
                    {
                        "id": 101,
                        "title": "Data Analyst",
                        "location": {"name": "Auckland, New Zealand"},
                        "content": "<p>Build trusted reporting and analytics.</p>",
                        "absolute_url": "https://boards.greenhouse.io/acme/jobs/101",
                        "updated_at": "2026-08-09T01:02:03Z",
                    },
                    {
                        "id": 102,
                        "title": "US Analyst",
                        "location": {"name": "New York, United States"},
                        "content": "Not a New Zealand role",
                        "absolute_url": "https://boards.greenhouse.io/acme/jobs/102",
                    },
                ]
            },
        )

    source = CareerSource(
        company_name="Acme NZ",
        careers_url="https://boards.greenhouse.io/acme",
        source_type="greenhouse",
        tenant_key="acme",
        country_code="NZ",
    )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_career_source(source, client)

    result = asyncio.run(run())

    assert result.etag == '"jobs-v1"'
    assert len(result.jobs) == 1
    assert result.jobs[0].title == "Data Analyst"
    assert result.jobs[0].description == "Build trusted reporting and analytics."
    assert result.jobs[0].country_code == "NZ"


def test_lever_adapter_normalizes_complete_public_posting() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=[
                {
                    "id": "lever-101",
                    "text": "Software Engineer",
                    "categories": {"location": "Wellington", "allLocations": ["Wellington"], "commitment": "Full-time"},
                    "country": "NZ",
                    "descriptionPlain": "Build reliable software for New Zealand customers.",
                    "hostedUrl": "https://jobs.lever.co/acme/lever-101",
                    "applyUrl": "https://jobs.lever.co/acme/lever-101/apply",
                    "workplaceType": "hybrid",
                    "salaryRange": {"currency": "NZD", "interval": "year", "min": 100000, "max": 130000},
                    "createdAt": 1786244523000,
                }
            ],
        )

    source = CareerSource(
        company_name="Acme NZ",
        careers_url="https://jobs.lever.co/acme",
        source_type="lever",
        tenant_key="acme",
        country_code="NZ",
    )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_career_source(source, client)

    job = asyncio.run(run()).jobs[0]
    assert job.salary == "NZD 100,000–130,000 year"
    assert job.workplace_type == "Hybrid"
    assert job.description == "Build reliable software for New Zealand customers."


def test_smartrecruiters_adapter_fetches_detail_after_index() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "careers.smartrecruiters.com":
            return httpx.Response(
                200,
                text='<meta property="og:image" content="https://c.smartrecruiters.com/company/acme/150px">',
            )
        if request.url.path.endswith("/postings"):
            return httpx.Response(
                200,
                json={
                    "limit": 100,
                    "offset": 0,
                    "totalFound": 1,
                    "content": [{"id": "sr-101", "name": "Product Analyst"}],
                },
            )
        return httpx.Response(
            200,
            json={
                "id": "sr-101",
                "name": "Product Analyst",
                "company": {"name": "Acme NZ"},
                "location": {"city": "Auckland", "country": "NZ", "remote": False},
                "typeOfEmployment": {"label": "Permanent"},
                "releasedDate": "2026-08-09T01:02:03Z",
                "applyUrl": "https://jobs.smartrecruiters.com/acme/sr-101",
                "jobAd": {
                    "sections": {
                        "jobDescription": {"text": "Analyse product performance."},
                        "qualifications": {"text": "Strong SQL skills."},
                    }
                },
            },
        )

    source = CareerSource(
        company_name="Acme NZ",
        careers_url="https://careers.smartrecruiters.com/acme",
        source_type="smartrecruiters",
        tenant_key="acme",
        country_code="NZ",
    )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_career_source(source, client)

    job = asyncio.run(run()).jobs[0]
    assert job.title == "Product Analyst"
    assert job.location == "Auckland, NZ"
    assert job.description == "Analyse product performance.\n\nStrong SQL skills."
    assert job.employment_type == "Permanent"
    assert job.company_logo_url == "https://c.smartrecruiters.com/company/acme/150px"


def test_generic_adapter_reads_public_schema_org_job_posting() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            text="""
                <meta property="og:image" content="https://careers.example.co.nz/logo.png">
                <script type="application/ld+json">
                  {
                    "@context": "https://schema.org",
                    "@type": "JobPosting",
                    "identifier": {"value": "job-123"},
                    "title": "Data Engineer",
                    "description": "<p>Build trusted data products.</p>",
                    "datePosted": "2026-08-09",
                    "validThrough": "2026-09-01",
                    "employmentType": "FULL_TIME",
                    "hiringOrganization": {"name": "Example NZ", "sameAs": "https://example.co.nz"},
                    "jobLocation": {"address": {"addressLocality": "Auckland", "addressCountry": "NZ"}},
                    "baseSalary": {"currency": "NZD", "value": {"minValue": 110000, "maxValue": 130000, "unitText": "YEAR"}},
                    "url": "https://careers.example.co.nz/jobs/job-123"
                  }
                </script>
            """,
        )

    source = CareerSource(
        company_name="Example NZ",
        company_domain="https://example.co.nz",
        careers_url="https://careers.example.co.nz/jobs",
        source_type="generic",
        tenant_key="careers.example.co.nz",
        country_code="NZ",
    )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_career_source(source, client)

    job = asyncio.run(run()).jobs[0]
    assert job.external_job_id == "job-123"
    assert job.title == "Data Engineer"
    assert job.location == "Auckland, NZ"
    assert job.salary == "NZD 110,000–130,000 YEAR"
    assert job.company_logo_url == "https://careers.example.co.nz/logo.png"


def test_generic_adapter_discovers_job_pages_from_sitemap_index() -> None:
    def job_page(job_id: str, title: str) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/html"},
            text=f'''<script type="application/ld+json">{{"@type":"JobPosting","identifier":{{"value":"{job_id}"}},"title":"{title}","hiringOrganization":{{"name":"Example NZ"}},"jobLocation":{{"address":{{"addressLocality":"Wellington","addressCountry":"NZ"}}}},"url":"https://careers.example.co.nz/job/{job_id}"}}</script>''',
        )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /")
        if request.url.path == "/sitemap.xml":
            return httpx.Response(200, text="<sitemapindex><sitemap><loc>https://careers.example.co.nz/jobs-sitemap.xml</loc></sitemap></sitemapindex>")
        if request.url.path == "/jobs-sitemap.xml":
            return httpx.Response(200, text="<urlset><url><loc>https://careers.example.co.nz/job/one</loc></url><url><loc>https://careers.example.co.nz/job/two</loc></url></urlset>")
        if request.url.path == "/job/one":
            return job_page("one", "Data Analyst")
        if request.url.path == "/job/two":
            return job_page("two", "Software Engineer")
        return httpx.Response(200, headers={"content-type": "text/html"}, text="<h1>Careers</h1>")

    source = CareerSource(
        company_name="Example NZ",
        careers_url="https://careers.example.co.nz/",
        source_type="generic",
        tenant_key="careers.example.co.nz",
        country_code="NZ",
    )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_career_source(source, client)

    jobs = asyncio.run(run()).jobs
    assert [job.title for job in jobs] == ["Data Analyst", "Software Engineer"]


def test_aggregated_job_is_searchable_through_jobs_endpoint() -> None:
    with Session(get_engine()) as session:
        source = CareerSource(
            company_name="Acme NZ",
            company_domain="https://acme.co.nz",
            careers_url="https://jobs.lever.co/acme",
            source_type="lever",
            tenant_key="acme",
            country_code="NZ",
        )
        session.add(source)
        session.commit()
        session.refresh(source)
        apply_career_fetch(
            session,
            source,
            CareerFetchResult(
                jobs=[
                    NormalizedCareerJob(
                        external_job_id="lever-1",
                        title="Senior Data Analyst",
                        company="Acme NZ",
                        location="Auckland, New Zealand",
                        country_code="NZ",
                        description="Own Power BI reporting and SQL analytics.",
                        employment_type="Full-time",
                        workplace_type="Hybrid",
                        url="https://jobs.lever.co/acme/lever-1",
                        apply_url="https://jobs.lever.co/acme/lever-1/apply",
                        posted_date=datetime(2026, 8, 9, 1, 2, 3),
                    )
                ]
            ),
        )

    async def no_live_results(_body):
        return []

    from app.routers import jobs as jobs_router

    original = jobs_router.search_jobs
    jobs_router.search_jobs = no_live_results
    try:
        with TestClient(app) as client:
            headers, _ = auth_headers(client)
            response = client.post(
                "/jobs/search",
                headers=headers,
                json={"keywords": "Data Analyst", "location": "Auckland", "sources": []},
            )
    finally:
        jobs_router.search_jobs = original

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["source_id"] == "ats:lever"
    assert body[0]["job"]["title"] == "Senior Data Analyst"
    assert body[0]["job"]["description"] == "Own Power BI reporting and SQL analytics."
