from fastapi.testclient import TestClient

from app.main import app


def test_track_viewed_event_creates_application() -> None:
    headers = {"X-Mock-User-Id": "71"}
    url = "https://example.com/jobs/event-viewed"
    with TestClient(app) as client:
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
    headers = {"X-Mock-User-Id": "72"}
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
