from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.deps import get_current_user
from app.db.session import get_session
from app.models import Application, ApplicationEvent, EmailEvent, JobPost, User
from app.routers.jobs import _app_to_list_out
from app.schemas import ApplicationEventTrackOut, ApplicationEventIn

router = APIRouter(prefix="/events", tags=["events"])

STATUS_RANK = {
    "Saved": 10,
    "Applied": 30,
    "Reply": 35,
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


def _clean_words(value: str | None) -> set[str]:
    if not value:
        return set()
    import re

    stop = {
        "and",
        "for",
        "the",
        "with",
        "your",
        "job",
        "role",
        "position",
        "application",
        "career",
        "careers",
        "new",
        "zealand",
    }
    return {w for w in re.findall(r"[a-z0-9]+", value.lower()) if len(w) > 2 and w not in stop}


def _email_haystack(metadata: dict[str, Any], page_url: str | None = None) -> str:
    parts = [
        metadata.get("subject"),
        metadata.get("sender"),
        metadata.get("from"),
        metadata.get("body_preview"),
        metadata.get("snippet"),
        metadata.get("text"),
        page_url,
    ]
    return " ".join(str(x) for x in parts if x).lower()


def _match_application_from_metadata(
    session: Session,
    user_id: int,
    metadata: dict[str, Any],
    page_url: str | None = None,
) -> Application | None:
    haystack = _email_haystack(metadata, page_url)
    if not haystack.strip():
        return None
    rows = session.exec(
        select(Application).where(Application.user_id == user_id)
    ).all()
    best: tuple[int, Application] | None = None
    for app_row in rows:
        job = app_row.job_post or session.get(JobPost, app_row.job_post_id)
        if job is None:
            continue
        score = 0
        company = (job.company or "").strip().lower()
        if company and company in haystack:
            score += 8
        title = (job.title or "").strip().lower()
        if title and title in haystack:
            score += 10
        score += len(_clean_words(job.title).intersection(_clean_words(haystack)))
        if job.url and job.url.lower() in haystack:
            score += 8
        if best is None or score > best[0]:
            best = (score, app_row)
    if best is None or best[0] < 2:
        return None
    best[1].job_post = best[1].job_post or session.get(JobPost, best[1].job_post_id)
    return best[1]


def _upsert_application_from_event(
    session: Session,
    user_id: int,
    body: ApplicationEventIn,
    status: str | None,
) -> Application | None:
    if body.event_type.strip().lower() == "job_viewed":
        return None

    if body.job is None:
        matched = _match_application_from_metadata(session, user_id, body.metadata, body.page_url)
        if matched and _should_update_status(matched.status, status):
            matched.status = status or matched.status
            matched.updated_at = datetime.utcnow()
            session.add(matched)
            session.commit()
            session.refresh(matched)
            matched.job_post = matched.job_post or session.get(JobPost, matched.job_post_id)
        return matched

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
    event_type = body.event_type.strip().lower()
    compact_payload = _compact_payload(body.metadata)
    event = ApplicationEvent(
        user_id=user.id,
        application_id=app_row.id if app_row else None,
        event_type=event_type,
        source=body.source.strip() or "extension",
        page_url=body.page_url,
        status_after=app_row.status if app_row else status,
        occurred_at=body.occurred_at or datetime.utcnow(),
        payload=compact_payload,
    )
    session.add(event)
    if event_type.startswith("email_") or (body.source.strip().lower() in {"email", "gmail", "outlook", "outlook_email"}):
        external_id = str(compact_payload.get("external_id") or compact_payload.get("message_id") or body.page_url or "")
        session.add(
            EmailEvent(
                user_id=user.id,
                application_id=app_row.id if app_row else None,
                external_id=external_id[:500],
                subject=str(compact_payload.get("subject") or "")[:1000],
                body_preview=str(compact_payload.get("body_preview") or compact_payload.get("snippet") or "")[:2000],
                parsed_status=app_row.status if app_row else status,
                received_at=body.occurred_at,
            )
        )
    session.commit()
    session.refresh(event)

    return ApplicationEventTrackOut(
        event=event,
        application=_app_to_list_out(app_row) if app_row else None,
    )
