from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.session import get_engine
from app.main import app
from app.models import EmailEvent, User
from app.services.gmail_addon import CURRENT_MESSAGE_SCOPE, USER_EMAIL_SCOPE
from app.services.gmail_sync import classify_status, match_application
from app.services.oauth import OAuthIdentity
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
    assert classify_status(
        "Application Outcome - Data Engineer",
        "sean@rewiredconsulting.co.nz",
        "We have reviewed your application and unfortunately it has not been successful on this occasion.",
    )[0] == "Rejected"
    assert classify_status("Weekly job recommendations", "jobs@example.com", "New jobs selected for you")[0] is None


def test_gmail_match_normalizes_company_domain_and_legal_suffix() -> None:
    with TestClient(app) as client:
        headers, user_id = auth_headers(client)
        saved = client.post(
            "/jobs/save",
            headers=headers,
            json=_job("Data Engineer", "Rewired Consulting Limited", "https://example.com/rewired-data-engineer"),
        )
        assert saved.status_code == 200
        with Session(get_engine()) as session:
            application, confidence = match_application(
                session,
                user_id,
                "Application Outcome - Data Engineer sean@rewiredconsulting.co.nz",
            )

    assert application is not None
    assert application.id == saved.json()["id"]
    assert confidence == 0.98


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


def test_gmail_addon_auto_syncs_reliable_match_only(monkeypatch) -> None:
    with TestClient(app) as client:
        account_email = "candidate@example.com"
        headers, user_id = auth_headers(client, email=account_email)
        first = client.post("/jobs/save", headers=headers, json=_job("Platform Engineer", "Acme", "https://example.com/platform"))
        second = client.post("/jobs/save", headers=headers, json=_job("Product Analyst", "Beta", "https://example.com/product"))
        assert first.status_code == second.status_code == 200

        monkeypatch.setattr("app.routers.integrations.verify_google_request", lambda authorization: None)
        monkeypatch.setattr(
            "app.services.gmail_addon.id_token.verify_oauth2_token",
            lambda token, request, audience: {"email": account_email, "email_verified": True},
        )
        message = {
            "id": "gmail-open-message",
            "threadId": "thread-1",
            "internalDate": "1786176000000",
            "snippet": "Please schedule an interview for the Platform Engineer role at Acme.",
            "payload": {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "Subject", "value": "Interview invitation — Platform Engineer at Acme"},
                    {"name": "From", "value": "Acme Recruiting <jobs@acme.example>"},
                ],
                "body": {"data": ""},
            },
        }
        monkeypatch.setattr("app.routers.integrations.fetch_current_message", lambda context: message)
        event = {
            "authorizationEventObject": {
                "userOAuthToken": "temporary-user-token",
                "userIdToken": "signed-user-token",
                "authorizedScopes": [CURRENT_MESSAGE_SCOPE, USER_EMAIL_SCOPE],
            },
            "gmail": {"messageId": "gmail-open-message", "accessToken": "temporary-message-token"},
            "commonEventObject": {"hostApp": "GMAIL"},
        }

        prompt = client.post("/integrations/gmail-addon", headers={"Authorization": "Bearer system-token"}, json=event)
        assert prompt.status_code == 200
        assert "Analyze this email" in str(prompt.json())

        event["commonEventObject"]["parameters"] = {"action": "analyze"}
        confirmed = client.post("/integrations/gmail-addon", headers={"Authorization": "Bearer system-token"}, json=event)
        first_detail = client.get(f"/jobs/{first.json()['id']}", headers=headers)
        second_detail = client.get(f"/jobs/{second.json()['id']}", headers=headers)

        with Session(get_engine()) as session:
            stored = session.exec(
                select(EmailEvent).where(
                    EmailEvent.user_id == user_id,
                    EmailEvent.provider == "gmail_addon",
                    EmailEvent.external_id == "gmail-open-message",
                )
            ).one()

    assert confirmed.status_code == 200
    assert confirmed.json()["renderActions"]["action"]["notification"]["text"] == "KiwiJob tracker updated automatically"
    assert stored.sync_state == "applied"
    assert first_detail.json()["status"] == "Interview"
    assert first_detail.json()["timeline"][0]["source"] == "gmail_addon"
    assert second_detail.json()["status"] == "Applied"


def test_gmail_addon_auto_creates_reliable_missing_application_once(monkeypatch) -> None:
    account_email = "candidate@example.com"
    with TestClient(app) as client:
        headers, user_id = auth_headers(client, email=account_email)
        monkeypatch.setattr("app.routers.integrations.verify_google_request", lambda authorization: None)
        monkeypatch.setattr(
            "app.services.gmail_addon.id_token.verify_oauth2_token",
            lambda token, request, audience: {"email": account_email, "email_verified": True},
        )
        message = {
            "id": "rewired-rejection-message",
            "threadId": "rewired-thread",
            "internalDate": "1786176000000",
            "snippet": "We have reviewed your application and unfortunately it has not been successful on this occasion.",
            "payload": {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "Subject", "value": "Application Outcome - Data Engineer"},
                    {"name": "From", "value": "Sean Patterson <sean@rewiredconsulting.co.nz>"},
                ],
                "body": {"data": ""},
            },
        }
        monkeypatch.setattr("app.routers.integrations.fetch_current_message", lambda context: message)
        event = {
            "authorizationEventObject": {
                "userOAuthToken": "temporary-user-token",
                "userIdToken": "signed-user-token",
                "authorizedScopes": [CURRENT_MESSAGE_SCOPE, USER_EMAIL_SCOPE],
            },
            "gmail": {"messageId": "rewired-rejection-message", "accessToken": "temporary-message-token"},
            "commonEventObject": {"hostApp": "GMAIL", "parameters": {"action": "analyze"}},
        }

        first = client.post("/integrations/gmail-addon", headers={"Authorization": "Bearer system-token"}, json=event)
        second = client.post("/integrations/gmail-addon", headers={"Authorization": "Bearer system-token"}, json=event)
        jobs = client.get("/jobs", headers=headers)
        with Session(get_engine()) as session:
            stored_events = session.exec(
                select(EmailEvent).where(EmailEvent.user_id == user_id, EmailEvent.external_id == "rewired-rejection-message")
            ).all()

    assert first.status_code == second.status_code == 200
    assert first.json()["renderActions"]["action"]["notification"]["text"] == "Added to KiwiJob tracker"
    assert len(jobs.json()) == 1
    assert jobs.json()[0]["job"]["title"] == "Data Engineer"
    assert jobs.json()[0]["job"]["company"] == "Rewired Consulting"
    assert jobs.json()[0]["status"] == "Rejected"
    assert len(stored_events) == 1


def test_verified_gmail_can_link_to_existing_account_and_resolve_addon(monkeypatch) -> None:
    gmail_email = "candidate@gmail.com"
    gmail_subject = "google-user-123"
    with TestClient(app) as client:
        headers, user_id = auth_headers(client, email="existing@example.com")
        monkeypatch.setattr(
            "app.routers.integrations.verify_oauth_identity",
            lambda provider, token: OAuthIdentity(
                provider="google",
                subject=gmail_subject,
                email=gmail_email,
                display_name="Existing Candidate",
            ),
        )
        linked = client.post("/integrations/gmail/link", headers=headers, json={"id_token": "x" * 40})
        assert linked.status_code == 200
        assert linked.json()["connected"] is True
        assert linked.json()["email_address"] == gmail_email

        monkeypatch.setattr("app.routers.integrations.verify_google_request", lambda authorization: None)
        monkeypatch.setattr(
            "app.services.gmail_addon.id_token.verify_oauth2_token",
            lambda token, request, audience: {"email": gmail_email, "email_verified": True},
        )
        event = {
            "authorizationEventObject": {
                "userOAuthToken": "temporary-user-token",
                "userIdToken": "signed-user-token",
                "authorizedScopes": [CURRENT_MESSAGE_SCOPE, USER_EMAIL_SCOPE],
            },
            "gmail": {"messageId": "linked-message", "accessToken": "temporary-message-token"},
            "commonEventObject": {"hostApp": "GMAIL", "parameters": {"action": "analyze"}},
        }
        monkeypatch.setattr(
            "app.routers.integrations.fetch_current_message",
            lambda context: {
                "id": "linked-message",
                "threadId": "thread-linked",
                "snippet": "Your application was unsuccessful.",
                "payload": {"headers": [{"name": "Subject", "value": "Application outcome"}]},
            },
        )
        preview = client.post("/integrations/gmail-addon", headers={"Authorization": "Bearer system-token"}, json=event)
        assert preview.status_code == 200
        assert "Sign in to KiwiJob" not in str(preview.json())

        unlinked = client.delete("/integrations/gmail/link", headers=headers)
        assert unlinked.status_code == 204
        with Session(get_engine()) as session:
            stored_user = session.get(User, user_id)
            assert stored_user is not None
            assert stored_user.gmail_email is None
            assert stored_user.gmail_subject is None


def test_gmail_link_rejects_identity_owned_by_another_account(monkeypatch) -> None:
    gmail_email = "owned@gmail.com"
    with TestClient(app) as client:
        first_headers, _ = auth_headers(client, email=gmail_email)
        second_headers, _ = auth_headers(client, email="second@example.com")
        monkeypatch.setattr(
            "app.routers.integrations.verify_oauth_identity",
            lambda provider, token: OAuthIdentity(provider="google", subject="owned-subject", email=gmail_email),
        )
        conflict = client.post("/integrations/gmail/link", headers=second_headers, json={"id_token": "x" * 40})
        assert conflict.status_code == 409
        assert "another KiwiJob account" in conflict.json()["detail"]
