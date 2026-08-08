from fastapi.testclient import TestClient
from uuid import uuid4

from app.main import app
from conftest import auth_headers


def test_register_login_me_and_logout() -> None:
    email = f"auth-flow-{uuid4().hex}@example.com"
    with TestClient(app) as client:
        headers, user_id = auth_headers(client, email=email)

        me = client.get("/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["id"] == user_id

        login = client.post("/auth/login", json={"email": email, "password": "password123"})
        assert login.status_code == 200
        token = login.json()["access_token"]
        assert token

        logout = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert logout.status_code == 200


def test_auth_required_for_user_data() -> None:
    with TestClient(app) as client:
        res = client.get("/jobs")
    assert res.status_code == 401


def test_linkedin_social_login_is_not_available() -> None:
    with TestClient(app) as client:
        response = client.get("/auth/social/linkedin/start")
    assert response.status_code == 404
    assert response.json()["detail"] == "Unsupported social sign-in provider"


def test_login_rate_limit_returns_retry_after() -> None:
    with TestClient(app) as client:
        responses = [
            client.post("/auth/login", json={"email": "missing@example.com", "password": "password123"})
            for _ in range(11)
        ]
    assert all(response.status_code == 401 for response in responses[:10])
    assert responses[10].status_code == 429
    assert int(responses[10].headers["retry-after"]) > 0


def test_identify_account_drives_two_step_auth() -> None:
    email = "two-step@example.com"
    with TestClient(app) as client:
        unknown = client.post("/auth/identify", json={"email": email})
        assert unknown.status_code == 200
        assert unknown.json() == {"account_exists": False, "password_login_available": False, "auth_provider": None}

        registered = client.post(
            "/auth/register",
            json={"email": email, "password": "password123", "display_name": "Two Step"},
        )
        assert registered.status_code == 201

        known = client.post("/auth/identify", json={"email": email})
        assert known.status_code == 200
        assert known.json() == {"account_exists": True, "password_login_available": True, "auth_provider": None}


def test_change_password_updates_login_credentials() -> None:
    email = f"password-{uuid4().hex}@example.com"
    with TestClient(app) as client:
        headers, _ = auth_headers(client, email=email)

        changed = client.post(
            "/auth/password",
            headers=headers,
            json={"current_password": "password123", "new_password": "new-password-123"},
        )
        assert changed.status_code == 200

        old_login = client.post("/auth/login", json={"email": email, "password": "password123"})
        new_login = client.post("/auth/login", json={"email": email, "password": "new-password-123"})
        assert old_login.status_code == 401
        assert new_login.status_code == 200


def test_oauth_login_creates_user_and_merges_by_email(monkeypatch) -> None:
    from app.routers import auth as auth_router
    from app.services.oauth import OAuthIdentity

    email = f"oauth-{uuid4().hex}@example.com"
    monkeypatch.setattr(
        auth_router,
        "verify_oauth_identity",
        lambda provider, token: OAuthIdentity(provider=provider, subject="provider-subject", email=email, display_name="OAuth Candidate"),
    )

    with TestClient(app) as client:
        first = client.post("/auth/oauth", json={"provider": "google", "id_token": "x" * 40})
        second = client.post("/auth/oauth", json={"provider": "google", "id_token": "x" * 40})
        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["user"]["email"] == email
        assert second.json()["user"]["id"] == first.json()["user"]["id"]
        identified = client.post("/auth/identify", json={"email": email})
        assert identified.status_code == 200
        assert identified.json() == {
            "account_exists": True,
            "password_login_available": False,
            "auth_provider": "google",
        }
        status = client.get("/integrations/gmail/status", headers={"Authorization": f"Bearer {second.json()['access_token']}"})
        assert status.status_code == 200
        assert status.json()["connected"] is True
        assert status.json()["email_address"] == email


def test_google_login_reuses_account_with_linked_gmail(monkeypatch) -> None:
    from sqlmodel import Session

    from app.db.session import get_engine
    from app.models import User
    from app.routers import auth as auth_router
    from app.services.oauth import OAuthIdentity

    account_email = f"account-{uuid4().hex}@example.com"
    gmail_email = f"linked-{uuid4().hex}@gmail.com"
    gmail_subject = f"google-{uuid4().hex}"

    with TestClient(app) as client:
        _, user_id = auth_headers(client, email=account_email)
        with Session(get_engine()) as session:
            user = session.get(User, user_id)
            assert user is not None
            user.gmail_email = gmail_email
            user.gmail_subject = gmail_subject
            session.add(user)
            session.commit()

        monkeypatch.setattr(
            auth_router,
            "verify_oauth_identity",
            lambda provider, token: OAuthIdentity(
                provider=provider,
                subject=gmail_subject,
                email=gmail_email,
                display_name="Linked Google Candidate",
            ),
        )

        identified = client.post("/auth/identify", json={"email": gmail_email})
        assert identified.status_code == 200
        assert identified.json() == {
            "account_exists": True,
            "password_login_available": False,
            "auth_provider": "google",
        }

        oauth = client.post("/auth/oauth", json={"provider": "google", "id_token": "x" * 40})
        assert oauth.status_code == 200
        assert oauth.json()["user"]["id"] == user_id
        assert oauth.json()["user"]["email"] == gmail_email

        old_email = client.post("/auth/identify", json={"email": account_email})
        assert old_email.status_code == 200
        assert old_email.json()["account_exists"] is False


def test_user_data_is_isolated_by_authenticated_user_id() -> None:
    with TestClient(app) as client:
        headers_a, _ = auth_headers(client)
        headers_b, _ = auth_headers(client)

        payload = {
            "title": "Shared URL Analyst",
            "company": "Example Ltd",
            "location": "Auckland",
            "description": "SQL and reporting.",
            "url": "https://example.com/jobs/shared-user-isolation",
            "source_website": "example.com",
            "status": "Saved",
        }
        save_a = client.post("/jobs/save", headers=headers_a, json=payload)
        save_b = client.post("/jobs/save", headers=headers_b, json={**payload, "status": "Applied"})
        assert save_a.status_code == 200
        assert save_b.status_code == 200

        jobs_a = client.get("/jobs", headers=headers_a)
        jobs_b = client.get("/jobs", headers=headers_b)
        assert jobs_a.status_code == 200
        assert jobs_b.status_code == 200

    rows_a = [row for row in jobs_a.json() if row["job"]["url"] == payload["url"]]
    rows_b = [row for row in jobs_b.json() if row["job"]["url"] == payload["url"]]
    assert len(rows_a) == 1
    assert len(rows_b) == 1
    assert rows_a[0]["status"] == "Saved"
    assert rows_b[0]["status"] == "Applied"
