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


def _ensure_sqlite_email_event_columns() -> None:
    engine = get_engine()
    url = str(engine.url)
    if not url.startswith("sqlite"):
        return
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if not insp.has_table("emailevent"):
        return
    cols = {c["name"] for c in insp.get_columns("emailevent")}
    with engine.begin() as conn:
        if "application_id" not in cols:
            conn.execute(text("ALTER TABLE emailevent ADD COLUMN application_id INTEGER"))


def _migrate_sqlite_viewed_status() -> None:
    engine = get_engine()
    url = str(engine.url)
    if not url.startswith("sqlite"):
        return
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if not insp.has_table("application"):
        return
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS viewed_only_application_ids"))
        conn.execute(text("CREATE TEMP TABLE viewed_only_application_ids (id INTEGER PRIMARY KEY)"))
        if insp.has_table("applicationevent"):
            conn.execute(
                text(
                    """
                    INSERT OR IGNORE INTO viewed_only_application_ids (id)
                    SELECT id
                    FROM (
                        SELECT a.id
                        FROM application a
                        WHERE EXISTS (
                            SELECT 1
                            FROM applicationevent ev
                            WHERE ev.application_id = a.id
                              AND ev.event_type = 'job_viewed'
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM applicationevent ev2
                            WHERE ev2.application_id = a.id
                              AND ev2.event_type != 'job_viewed'
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM matchresult mr
                            WHERE mr.application_id = a.id
                        )
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE applicationevent
                    SET application_id = NULL, status_after = NULL
                    WHERE application_id IN (SELECT id FROM viewed_only_application_ids)
                    """
                )
            )
        if insp.has_table("emailevent"):
            conn.execute(
                text(
                    """
                    UPDATE emailevent
                    SET application_id = NULL
                    WHERE application_id IN (SELECT id FROM viewed_only_application_ids)
                    """
                )
            )
        conn.execute(
            text(
                """
                DELETE FROM application
                WHERE id IN (SELECT id FROM viewed_only_application_ids)
                """
            )
        )
        conn.execute(text("UPDATE application SET status = 'Saved' WHERE status = 'Viewed'"))
        if insp.has_table("applicationevent"):
            conn.execute(text("UPDATE applicationevent SET status_after = 'Saved' WHERE status_after = 'Viewed'"))
        if insp.has_table("emailevent"):
            conn.execute(text("UPDATE emailevent SET parsed_status = 'Saved' WHERE parsed_status = 'Viewed'"))
        conn.execute(text("DROP TABLE IF EXISTS viewed_only_application_ids"))


def init_db() -> None:
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _ensure_sqlite_user_columns()
    _ensure_sqlite_jobpost_visa_requirement_column()
    _ensure_sqlite_email_event_columns()
    _migrate_sqlite_viewed_status()


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
