from __future__ import annotations

from collections.abc import Generator

from sqlalchemy.engine import make_url
from sqlmodel import Session, create_engine

import app.models  # noqa: F401  # register SQLModel tables

from app.core.config import get_settings

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        url = get_settings().database_url
        if not make_url(url).drivername.startswith("postgresql"):
            raise RuntimeError("DATABASE_URL must use a PostgreSQL driver.")
        kwargs: dict = {"echo": False}
        kwargs["pool_pre_ping"] = True
        _engine = create_engine(url, **kwargs)
    return _engine


def init_db() -> None:
    get_engine()


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
