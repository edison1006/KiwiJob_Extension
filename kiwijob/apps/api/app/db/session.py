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


def _ensure_sqlite_user_applicant_profile_column() -> None:
    engine = get_engine()
    url = str(engine.url)
    if not url.startswith("sqlite"):
        return
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if not insp.has_table("user"):
        return
    cols = {c["name"] for c in insp.get_columns("user")}
    if "applicant_profile" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE user ADD COLUMN applicant_profile JSON"))


def init_db() -> None:
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _ensure_sqlite_user_applicant_profile_column()


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
