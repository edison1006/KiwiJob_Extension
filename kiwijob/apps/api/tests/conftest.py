from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://kiwijob:kiwijob@localhost:5432/kiwijob_test")

API_ROOT = Path(__file__).resolve().parents[1]
TABLES = (
    "cvoptimization",
    "notification",
    "emailevent",
    "applicationevent",
    "applicationnote",
    "matchresult",
    "resume",
    "application",
    "jobpost",
    "user",
)


def _ensure_test_database() -> None:
    url = make_url(os.environ["DATABASE_URL"])
    if not url.drivername.startswith("postgresql"):
        raise RuntimeError("API tests require a PostgreSQL DATABASE_URL.")

    database = url.database
    admin_url = url.set(database="postgres")
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :database"), {"database": database}).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{database}"'))
    admin_engine.dispose()


def pytest_sessionstart(session: pytest.Session) -> None:
    _ensure_test_database()
    config = Config(str(API_ROOT / "alembic.ini"))
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
def clean_database():
    from app.db.session import get_engine

    quoted_tables = ", ".join(f'"{table}"' for table in TABLES)
    with get_engine().begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {quoted_tables} RESTART IDENTITY CASCADE"))
    yield


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
