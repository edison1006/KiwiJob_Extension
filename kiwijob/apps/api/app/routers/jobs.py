from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.deps import get_current_user
from app.db.session import get_session
from app.models import Application, JobPost, User
from app.schemas import ApplicationDetailOut, ApplicationListOut, ApplicationUpdateIn, JobPostOut, JobSaveIn

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
        existing_job.title = body.title
        existing_job.company = body.company
        existing_job.location = body.location
        existing_job.description = body.description
        existing_job.salary = body.salary
        existing_job.visa_requirement = body.visa_requirement
        existing_job.source_website = body.source_website
        existing_job.posted_date = body.posted_date
        existing_job.updated_at = now
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
            visa_requirement=body.visa_requirement,
            url=body.url,
            source_website=body.source_website,
            posted_date=body.posted_date,
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
        .options(selectinload(Application.job_post), selectinload(Application.match_results))
    ).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    assert app_row.job_post is not None
    latest = None
    if app_row.match_results:
        latest_sorted = sorted(app_row.match_results, key=lambda m: m.created_at, reverse=True)
        latest = latest_sorted[0].payload if latest_sorted else None
    base = _app_to_list_out(app_row)
    return ApplicationDetailOut(**base.model_dump(), latest_match=latest)


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
    session.add(app_row)
    session.commit()
    session.refresh(app_row)
    session.refresh(app_row, attribute_names=["job_post"])
    if app_row.job_post is None:
        app_row.job_post = session.get(JobPost, app_row.job_post_id)
    assert app_row.job_post is not None
    return _app_to_list_out(app_row)


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
