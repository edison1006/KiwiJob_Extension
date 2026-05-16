from __future__ import annotations

from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

import app.models  # noqa: F401  # register SQLModel tables

from app.core.config import get_settings

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        url = get_settings().database_url
        kwargs: dict = {"echo": False}
        if url.startswith("sqlite"):
            from pathlib import Path

            Path("data").mkdir(parents=True, exist_ok=True)
            kwargs["connect_args"] = {"check_same_thread": False}
            kwargs["pool_pre_ping"] = False
        else:
            kwargs["pool_pre_ping"] = True
        _engine = create_engine(url, **kwargs)
    return _engine


def _ensure_sqlite_user_columns() -> None:
    engine = get_engine()
    url = str(engine.url)
    if not url.startswith("sqlite"):
        return
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if not insp.has_table("user"):
        return
    cols = {c["name"] for c in insp.get_columns("user")}
    with engine.begin() as conn:
        if "applicant_profile" not in cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN applicant_profile JSON"))
        if "password_hash" not in cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN password_hash VARCHAR DEFAULT ''"))
        if "display_name" not in cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN display_name VARCHAR DEFAULT ''"))
        if "auth_provider" not in cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN auth_provider VARCHAR DEFAULT 'password'"))
        if "auth_provider_subject" not in cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN auth_provider_subject VARCHAR DEFAULT ''"))


def _ensure_sqlite_jobpost_visa_requirement_column() -> None:
    engine = get_engine()
    url = str(engine.url)
    if not url.startswith("sqlite"):
        return
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if not insp.has_table("jobpost"):
        return
    cols = {c["name"] for c in insp.get_columns("jobpost")}
    if "visa_requirement" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE jobpost ADD COLUMN visa_requirement VARCHAR"))


def init_db() -> None:
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _ensure_sqlite_user_columns()
    _ensure_sqlite_jobpost_visa_requirement_column()


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
