from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.session import get_engine
from app.main import app
from app.models import EmailEvent
from app.services.gmail_sync import classify_status
from conftest import auth_headers


def _job(title: str, company: str, url: str, status: str = "Applied") -> dict[str, str]:
    return {
        "title": title,
        "company": company,
        "location": "Auckland",
        "description": "A role used for integration tests.",
        "url": url,
        "source_website": "example.com",
        "status": status,
    }


def test_gmail_status_classifier_uses_specific_feedback_phrases() -> None:
    assert classify_status("Interview invitation", "jobs@example.com", "Please schedule an interview")[0] == "Interview"
    assert classify_status("Your application", "jobs@example.com", "We will not be progressing with your application")[0] == "Rejected"
    assert classify_status("Weekly job recommendations", "jobs@example.com", "New jobs selected for you")[0] is None


def test_duplicate_check_only_returns_previously_applied_jobs() -> None:
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
        saved = client.post("/jobs/save", headers=headers, json=_job("Data Engineer", "Example Ltd", "https://example.com/saved", "Saved"))
        assert saved.status_code == 200
        no_duplicate = client.post(
            "/jobs/duplicate-check",
            headers=headers,
            json={"title": "Data Engineer", "company": "Example Ltd"},
        )
        assert no_duplicate.status_code == 200
        assert no_duplicate.json()["duplicate"] is False

        applied = client.post("/jobs/save", headers=headers, json=_job("Data Engineer", "Example Ltd", "https://example.com/applied"))
        assert applied.status_code == 200
        duplicate = client.post(
            "/jobs/duplicate-check",
            headers=headers,
            json={"title": "  DATA engineer ", "company": "example ltd"},
        )

    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate"] is True
    assert duplicate.json()["applications"][0]["id"] == applied.json()["id"]


def test_confirm_gmail_preview_updates_only_selected_email_event() -> None:
    with TestClient(app) as client:
        headers, user_id = auth_headers(client)
        first = client.post("/jobs/save", headers=headers, json=_job("Platform Engineer", "Acme", "https://example.com/platform"))
        second = client.post("/jobs/save", headers=headers, json=_job("Product Analyst", "Beta", "https://example.com/product"))
        assert first.status_code == second.status_code == 200
        with Session(get_engine()) as session:
            selected = EmailEvent(
                user_id=user_id,
                application_id=first.json()["id"],
                provider="gmail",
                external_id="gmail-selected",
                subject="Interview invitation for Platform Engineer at Acme",
                sender="jobs@acme.example",
                parsed_status="Interview",
                confidence=0.95,
                sync_state="pending",
            )
            unselected = EmailEvent(
                user_id=user_id,
                application_id=second.json()["id"],
                provider="gmail",
                external_id="gmail-unselected",
                subject="Assessment for Product Analyst at Beta",
                sender="jobs@beta.example",
                parsed_status="Assessment",
                confidence=0.91,
                sync_state="pending",
            )
            session.add(selected)
            session.add(unselected)
            session.commit()
            session.refresh(selected)
            selected_id = selected.id

        confirmed = client.post(
            "/integrations/gmail/sync-confirm",
            headers=headers,
            json={"email_event_ids": [selected_id]},
        )
        first_detail = client.get(f"/jobs/{first.json()['id']}", headers=headers)
        second_detail = client.get(f"/jobs/{second.json()['id']}", headers=headers)

    assert confirmed.status_code == 200
    assert confirmed.json()["updated_count"] == 1
    assert first_detail.json()["status"] == "Interview"
    assert first_detail.json()["timeline"][0]["source"] == "gmail"
    assert second_detail.json()["status"] == "Applied"
