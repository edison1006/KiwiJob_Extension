from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient


def auth_headers(client: TestClient, *, email: str | None = None) -> tuple[dict[str, str], int]:
    account_email = email or f"test-{uuid4().hex}@example.com"
    res = client.post(
        "/auth/register",
        json={
            "email": account_email,
            "password": "password123",
            "display_name": "Test Candidate",
        },
    )
    assert res.status_code == 201
    body = res.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["id"]
