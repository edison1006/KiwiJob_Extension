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
