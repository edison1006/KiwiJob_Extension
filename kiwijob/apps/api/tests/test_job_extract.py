from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.routers import jobs as jobs_router
from app.schemas import JobSaveIn, JobSearchResultOut
from app.services.job_extract import _job_from_json_ld, _parse_seek_results
from conftest import auth_headers


def test_json_ld_job_posting_extracts_real_job_fields() -> None:
    raw = """
    {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      "title": "Senior Data Analyst",
      "hiringOrganization": {"name": "Example Analytics", "url": "https://example.com"},
      "jobLocation": {"@type": "Place", "address": {"addressLocality": "Auckland", "addressRegion": "Auckland", "addressCountry": "NZ"}},
      "employmentType": ["FULL_TIME"],
      "baseSalary": {"currency": "NZD", "value": {"minValue": 110000, "maxValue": 130000, "unitText": "YEAR"}},
      "description": "<p>Build dashboards, SQL models, and stakeholder reporting.</p>",
      "datePosted": "2026-05-20",
      "validThrough": "2026-06-20",
      "identifier": {"value": "JOB-123"}
    }
    """

    payload = _job_from_json_ld([raw], "https://jobs.example.com/job/123")

    assert payload is not None
    assert payload["title"] == "Senior Data Analyst"
    assert payload["company"] == "Example Analytics"
    assert payload["location"] == "Auckland, Auckland, NZ"
    assert payload["employment_type"] == "Full Time"
    assert payload["salary"] == "NZD 110000-130000 YEAR"
    assert payload["external_job_id"] == "JOB-123"


def test_seek_search_page_extracts_specific_job_cards() -> None:
    html = """
    <article data-testid="job-card" data-job-id="92304747">
      <a href="/job/92304747?type=standard&amp;ref=search-standalone&amp;origin=cardTitle" data-automation="jobTitle">Data Analyst</a>
      <a data-automation="jobCompany">Watercare Services Limited</a>
      <span data-automation="jobCardLocation"><a>Newmarket</a></span>
      <span data-automation="jobCardLocation">, <a>Auckland</a></span>
      <a data-automation="jobClassification">Information & Communication Technology</a>
      <span data-automation="jobShortDescription">Build dashboards and reporting.</span>
    </article>
    """

    results = _parse_seek_results(html, "https://nz.seek.com/data-analyst-jobs", 5)

    assert len(results) == 1
    job = results[0].job
    assert job.title == "Data Analyst"
    assert job.company == "Watercare Services Limited"
    assert job.location == "Newmarket, Auckland"
    assert job.url == "https://nz.seek.com/job/92304747?type=standard&ref=search-standalone"


def test_extract_endpoint_returns_job_payload(monkeypatch) -> None:
    async def fake_extract(url: str) -> JobSaveIn:
        return JobSaveIn(
            title="Frontend Engineer",
            company="Acme Careers",
            location="Wellington",
            description="React and TypeScript role.",
            url=url,
            source_website="acme.example",
        )

    monkeypatch.setattr(jobs_router, "extract_job_from_url", fake_extract)

    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        res = client.post("/jobs/extract", headers=headers, json={"url": "https://acme.example/jobs/frontend"})

    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "Frontend Engineer"
    assert body["company"] == "Acme Careers"
    assert body["source_website"] == "acme.example"


def test_search_endpoint_returns_real_job_results(monkeypatch) -> None:
    async def fake_search(body):
        return [
            JobSearchResultOut(
                source_id="seek",
                source_name="SEEK NZ",
                search_url="https://nz.seek.com/data-analyst-jobs",
                job=JobSaveIn(
                    title="Data Analyst",
                    company="Watercare",
                    location="Auckland",
                    url="https://nz.seek.com/job/92304747",
                    source_website="seek.co.nz",
                ),
            )
        ]

    monkeypatch.setattr(jobs_router, "search_jobs", fake_search)

    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        res = client.post("/jobs/search", headers=headers, json={"keywords": "Data Analyst", "sources": ["seek"]})

    assert res.status_code == 200
    body = res.json()
    assert body[0]["job"]["title"] == "Data Analyst"
    assert body[0]["job"]["company"] == "Watercare"
