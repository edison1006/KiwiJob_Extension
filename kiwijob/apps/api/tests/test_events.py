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


def test_email_reply_event_matches_existing_application_and_updates_status() -> None:
    url = "https://example.com/jobs/event-email-reply"
    job = {
        "title": "Frontend Developer",
        "company": "Acme Careers",
        "location": "Auckland",
        "description": "React, TypeScript, and product engineering.",
        "url": url,
        "source_website": "example.com",
        "status": "Applied",
    }
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        created = client.post(
            "/events/track",
            headers=headers,
            json={"event_type": "application_submitted", "page_url": url, "job": job},
        )
        assert created.status_code == 200
        app_id = created.json()["application"]["id"]

        reply = client.post(
            "/events/track",
            headers=headers,
            json={
                "event_type": "email_reply",
                "source": "gmail",
                "page_url": "https://mail.google.com/mail/u/0/#inbox/example",
                "metadata": {
                    "external_id": "gmail-message-1",
                    "subject": "Frontend Developer application at Acme Careers",
                    "sender": "recruiter@acme.example",
                    "body_preview": "Thanks for your application. Our hiring team will review the next step.",
                },
            },
        )
        assert reply.status_code == 200

        details = client.get(f"/jobs/{app_id}", headers=headers)
        insights = client.get("/analytics/insights?days=30", headers=headers)

    assert reply.json()["application"]["id"] == app_id
    assert reply.json()["application"]["status"] == "Reply"
    assert details.status_code == 200
    assert details.json()["status"] == "Reply"
    assert insights.status_code == 200
    assert insights.json()["replies"] == 1
    assert insights.json()["response_rate"] == 100.0
