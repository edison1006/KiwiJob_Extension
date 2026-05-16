from fastapi.testclient import TestClient

from app.main import app
from conftest import auth_headers


def test_track_viewed_event_creates_application() -> None:
    url = "https://example.com/jobs/event-viewed"
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        res = client.post(
            "/events/track",
            headers=headers,
            json={
                "event_type": "job_viewed",
                "page_url": url,
                "job": {
                    "title": "Data Analyst",
                    "company": "Example Ltd",
                    "location": "Auckland",
                    "description": "SQL reporting and stakeholder analysis.",
                    "url": url,
                    "source_website": "example.com",
                    "status": "Viewed",
                },
            },
        )

    assert res.status_code == 200
    body = res.json()
    assert body["event"]["event_type"] == "job_viewed"
    assert body["application"]["status"] == "Viewed"
    assert body["application"]["job"]["title"] == "Data Analyst"


def test_track_application_event_upgrades_but_does_not_downgrade_status() -> None:
    url = "https://example.com/jobs/event-applied"
    job = {
        "title": "Product Analyst",
        "company": "Example Ltd",
        "location": "Wellington",
        "description": "Analytics, SQL, dashboards, and business partnering.",
        "url": url,
        "source_website": "example.com",
        "status": "Viewed",
    }
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        viewed = client.post("/events/track", headers=headers, json={"event_type": "job_viewed", "page_url": url, "job": job})
        assert viewed.status_code == 200

        applied = client.post(
            "/events/track",
            headers=headers,
            json={"event_type": "application_submitted", "page_url": url, "job": {**job, "status": "Applied"}},
        )
        assert applied.status_code == 200
        assert applied.json()["application"]["status"] == "Applied"

        viewed_again = client.post("/events/track", headers=headers, json={"event_type": "job_viewed", "page_url": url, "job": job})

    assert viewed_again.status_code == 200
    assert viewed_again.json()["application"]["status"] == "Applied"


def test_insights_counts_recent_application_funnel() -> None:
    url = "https://example.com/jobs/event-interview"
    job = {
        "title": "Data Engineer",
        "company": "Example Ltd",
        "location": "Auckland",
        "description": "Data pipelines and analytics.",
        "url": url,
        "source_website": "example.com",
        "status": "Applied",
    }
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        res = client.post(
            "/events/track",
            headers=headers,
            json={"event_type": "application_submitted", "page_url": url, "job": job},
        )
        assert res.status_code == 200
        res = client.post(
            "/events/track",
            headers=headers,
            json={"event_type": "interview_detected", "page_url": url, "job": {**job, "status": "Interview"}},
        )
        assert res.status_code == 200
        insights = client.get("/analytics/insights?days=30", headers=headers)

    assert insights.status_code == 200
    body = insights.json()
    assert body["applications"] == 1
    assert body["replies"] == 1
    assert body["interviews"] == 1
    assert body["response_rate"] == 100.0
    assert body["top_titles"][0] == {"title": "Data Engineer", "count": 1}
    assert "start_date" in body
    assert "end_date" in body
