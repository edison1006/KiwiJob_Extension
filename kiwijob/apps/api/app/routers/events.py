from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.deps import get_current_user
from app.db.session import get_session
from app.models import Application, ApplicationEvent, JobPost, User
from app.routers.jobs import _app_to_list_out
from app.schemas import ApplicationEventTrackOut, ApplicationEventIn

router = APIRouter(prefix="/events", tags=["events"])

STATUS_RANK = {
    "Saved": 10,
    "Viewed": 20,
    "Applied": 30,
    "Assessment": 40,
    "Interview": 50,
    "Rejected": 60,
    "Offer": 70,
    "Withdrawn": 80,
}


def _should_update_status(current: str, incoming: str | None) -> bool:
    if not incoming:
        return False
    return STATUS_RANK.get(incoming, 0) >= STATUS_RANK.get(current, 0)


def _compact_payload(metadata: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in metadata.items():
        if isinstance(value, (str, int, float, bool)) or value is None:
            out[key] = value
        elif isinstance(value, list):
            out[key] = value[:50]
        elif isinstance(value, dict):
            out[key] = {str(k): v for k, v in list(value.items())[:50]}
        else:
            out[key] = str(value)
    return out


def _upsert_application_from_event(
    session: Session,
    user_id: int,
    body: ApplicationEventIn,
    status: str | None,
) -> Application | None:
    if body.job is None:
        return None

    now = datetime.utcnow()
    incoming_job = body.job
    job = session.exec(select(JobPost).where(JobPost.url == incoming_job.url)).first()
    if job:
        job.title = incoming_job.title
        job.company = incoming_job.company
        job.location = incoming_job.location
        job.description = incoming_job.description
        job.salary = incoming_job.salary
        job.visa_requirement = incoming_job.visa_requirement
        job.source_website = incoming_job.source_website
        job.posted_date = incoming_job.posted_date
        job.updated_at = now
    else:
        job = JobPost(
            title=incoming_job.title,
            company=incoming_job.company,
            location=incoming_job.location,
            description=incoming_job.description,
            salary=incoming_job.salary,
            visa_requirement=incoming_job.visa_requirement,
            url=incoming_job.url,
            source_website=incoming_job.source_website,
            posted_date=incoming_job.posted_date,
            created_at=now,
            updated_at=now,
        )
    session.add(job)
    session.commit()
    session.refresh(job)

    app_row = session.exec(
        select(Application).where(Application.user_id == user_id, Application.job_post_id == job.id)
    ).first()
    if app_row:
        if _should_update_status(app_row.status, status):
            app_row.status = status or app_row.status
        app_row.updated_at = now
    else:
        app_row = Application(
            user_id=user_id,
            job_post_id=job.id,
            status=status or incoming_job.normalized_status(),
            saved_at=now,
            updated_at=now,
        )
    session.add(app_row)
    session.commit()
    session.refresh(app_row)
    app_row.job_post = job
    return app_row


@router.post("/track", response_model=ApplicationEventTrackOut)
def track_event(
    body: ApplicationEventIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None

    status = body.normalized_status()
    app_row = _upsert_application_from_event(session, user.id, body, status)
    event = ApplicationEvent(
        user_id=user.id,
        application_id=app_row.id if app_row else None,
        event_type=body.event_type.strip().lower(),
        source=body.source.strip() or "extension",
        page_url=body.page_url,
        status_after=app_row.status if app_row else status,
        occurred_at=body.occurred_at or datetime.utcnow(),
        payload=_compact_payload(body.metadata),
    )
    session.add(event)
    session.commit()
    session.refresh(event)

    return ApplicationEventTrackOut(
        event=event,
        application=_app_to_list_out(app_row) if app_row else None,
    )
