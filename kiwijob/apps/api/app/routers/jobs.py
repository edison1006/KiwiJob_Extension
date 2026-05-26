from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.deps import get_current_user
from app.db.session import get_session
from app.models import Application, ApplicationEvent, ApplicationNote, JobPost, User
from app.schemas import (
    ApplicationDetailOut,
    ApplicationListOut,
    ApplicationNoteIn,
    ApplicationNoteOut,
    ApplicationTimelineEventOut,
    ApplicationUpdateIn,
    JobExtractIn,
    JobPostOut,
    JobSearchIn,
    JobSearchResultOut,
    JobSaveIn,
)
from app.services.job_extract import JobExtractError, extract_job_from_url, search_jobs

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _job_to_out(j: JobPost) -> JobPostOut:
    return JobPostOut.model_validate(j)


def _app_to_list_out(a: Application) -> ApplicationListOut:
    assert a.job_post is not None
    return ApplicationListOut(
        id=a.id,
        status=a.status,
        saved_at=a.saved_at,
        updated_at=a.updated_at,
        match_score=a.match_score,
        job=_job_to_out(a.job_post),
    )


def _note_to_out(note: ApplicationNote) -> ApplicationNoteOut:
    return ApplicationNoteOut(
        id=note.id,
        application_id=note.application_id,
        content=note.content,
        created_at=note.created_at,
        updated_at=note.updated_at,
        is_edited=(note.updated_at - note.created_at).total_seconds() > 1,
    )


def _event_to_timeline_out(event: ApplicationEvent) -> ApplicationTimelineEventOut:
    return ApplicationTimelineEventOut.model_validate(event)


def _get_user_application(session: Session, job_id: int, user_id: int) -> Application:
    app_row = session.get(Application, job_id)
    if not app_row or app_row.user_id != user_id:
        raise HTTPException(status_code=404, detail="Application not found")
    return app_row


def _apply_job_fields(job: JobPost, body: JobSaveIn | ApplicationUpdateIn, now: datetime) -> None:
    fields = (
        "title",
        "company",
        "location",
        "description",
        "salary",
        "employment_type",
        "workplace_type",
        "visa_requirement",
        "url",
        "apply_url",
        "company_url",
        "external_job_id",
        "source_website",
        "posted_date",
        "closing_date",
    )
    provided = set(fields) if isinstance(body, JobSaveIn) else body.model_fields_set
    for field in fields:
        if field in provided:
            setattr(job, field, getattr(body, field, None))
    job.updated_at = now


@router.post("/extract", response_model=JobSaveIn)
async def extract_job(body: JobExtractIn, user: User = Depends(get_current_user)):
    assert user.id is not None
    try:
        return await extract_job_from_url(body.url)
    except JobExtractError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/search", response_model=list[JobSearchResultOut])
async def search_job_boards(body: JobSearchIn, user: User = Depends(get_current_user)):
    assert user.id is not None
    return await search_jobs(body)


@router.post("/save", response_model=ApplicationListOut)
def save_job(
    body: JobSaveIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    status = body.normalized_status()
    now = datetime.utcnow()

    existing_job = session.exec(select(JobPost).where(JobPost.url == body.url)).first()
    if existing_job:
        _apply_job_fields(existing_job, body, now)
        session.add(existing_job)
        session.commit()
        session.refresh(existing_job)
        job = existing_job
    else:
        job = JobPost(
            title=body.title,
            company=body.company,
            location=body.location,
            description=body.description,
            salary=body.salary,
            employment_type=body.employment_type,
            workplace_type=body.workplace_type,
            visa_requirement=body.visa_requirement,
            url=body.url,
            apply_url=body.apply_url,
            company_url=body.company_url,
            external_job_id=body.external_job_id,
            source_website=body.source_website,
            posted_date=body.posted_date,
            closing_date=body.closing_date,
            created_at=now,
            updated_at=now,
        )
        session.add(job)
        session.commit()
        session.refresh(job)

    app_row = session.exec(
        select(Application).where(Application.user_id == user.id, Application.job_post_id == job.id)
    ).first()
    if app_row:
        app_row.status = status
        app_row.updated_at = now
        session.add(app_row)
        session.commit()
        session.refresh(app_row)
    else:
        app_row = Application(
            user_id=user.id,
            job_post_id=job.id,
            status=status,
            saved_at=now,
            updated_at=now,
        )
        session.add(app_row)
        session.commit()
        session.refresh(app_row)

    app_row.job_post = job
    return _app_to_list_out(app_row)


@router.get("", response_model=list[ApplicationListOut])
def list_jobs(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    rows = session.exec(
        select(Application)
        .where(Application.user_id == user.id)
        .options(selectinload(Application.job_post))
        .order_by(Application.updated_at.desc())
    ).all()
    return [_app_to_list_out(r) for r in rows]


@router.get("/{job_id}", response_model=ApplicationDetailOut)
def get_job(
    job_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    app_row = session.exec(
        select(Application)
        .where(Application.id == job_id, Application.user_id == user.id)
        .options(
            selectinload(Application.job_post),
            selectinload(Application.match_results),
            selectinload(Application.notes),
            selectinload(Application.events),
        )
    ).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    assert app_row.job_post is not None
    latest = None
    if app_row.match_results:
        latest_sorted = sorted(app_row.match_results, key=lambda m: m.created_at, reverse=True)
        latest = latest_sorted[0].payload if latest_sorted else None
    base = _app_to_list_out(app_row)
    notes = sorted(app_row.notes or [], key=lambda n: n.created_at, reverse=True)
    timeline = sorted(app_row.events or [], key=lambda e: e.occurred_at, reverse=True)
    return ApplicationDetailOut(
        **base.model_dump(),
        latest_match=latest,
        notes=[_note_to_out(n) for n in notes],
        timeline=[_event_to_timeline_out(e) for e in timeline],
    )


@router.put("/{job_id}", response_model=ApplicationListOut)
def update_job(
    job_id: int,
    body: ApplicationUpdateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    app_row = session.get(Application, job_id)
    if not app_row or app_row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    ns = body.normalized_status()
    if ns:
        app_row.status = ns
    app_row.updated_at = datetime.utcnow()
    job_changed = any(
        field in body.model_fields_set
        for field in (
            "title",
            "company",
            "location",
            "description",
            "salary",
            "employment_type",
            "workplace_type",
            "visa_requirement",
            "url",
            "apply_url",
            "company_url",
            "external_job_id",
            "source_website",
            "posted_date",
            "closing_date",
        )
    )
    if job_changed:
        job = app_row.job_post or session.get(JobPost, app_row.job_post_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job post not found")
        _apply_job_fields(job, body, app_row.updated_at)
        session.add(job)
    session.add(app_row)
    if ns:
        session.add(
            ApplicationEvent(
                user_id=user.id,
                application_id=app_row.id,
                event_type="status_updated",
                source="web",
                status_after=ns,
                occurred_at=app_row.updated_at,
                payload={"status": ns},
            )
        )
    session.commit()
    session.refresh(app_row)
    session.refresh(app_row, attribute_names=["job_post"])
    if app_row.job_post is None:
        app_row.job_post = session.get(JobPost, app_row.job_post_id)
    assert app_row.job_post is not None
    return _app_to_list_out(app_row)


@router.post("/{job_id}/notes", response_model=ApplicationNoteOut, status_code=201)
def create_note(
    job_id: int,
    body: ApplicationNoteIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    app_row = _get_user_application(session, job_id, user.id)
    now = datetime.utcnow()
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Note content is required")
    note = ApplicationNote(
        application_id=app_row.id,
        user_id=user.id,
        content=content,
        created_at=now,
        updated_at=now,
    )
    session.add(note)
    session.flush()
    session.add(
        ApplicationEvent(
            user_id=user.id,
            application_id=app_row.id,
            event_type="note_added",
            source="web",
            occurred_at=now,
            payload={"note_id": note.id},
        )
    )
    session.commit()
    session.refresh(note)
    return _note_to_out(note)


@router.put("/{job_id}/notes/{note_id}", response_model=ApplicationNoteOut)
def update_note(
    job_id: int,
    note_id: int,
    body: ApplicationNoteIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    _get_user_application(session, job_id, user.id)
    note = session.get(ApplicationNote, note_id)
    if not note or note.user_id != user.id or note.application_id != job_id:
        raise HTTPException(status_code=404, detail="Note not found")
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Note content is required")
    note.content = content
    note.updated_at = datetime.utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)
    return _note_to_out(note)


@router.delete("/{job_id}/notes/{note_id}", status_code=204)
def delete_note(
    job_id: int,
    note_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    _get_user_application(session, job_id, user.id)
    note = session.get(ApplicationNote, note_id)
    if not note or note.user_id != user.id or note.application_id != job_id:
        raise HTTPException(status_code=404, detail="Note not found")
    session.delete(note)
    session.commit()
    return None


@router.delete("/{job_id}", status_code=204)
def delete_job(
    job_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    app_row = session.get(Application, job_id)
    if not app_row or app_row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    session.delete(app_row)
    session.commit()
    return None
