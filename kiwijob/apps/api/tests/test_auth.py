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
