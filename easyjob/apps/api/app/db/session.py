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


def init_db() -> None:
    SQLModel.metadata.create_all(get_engine())


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
