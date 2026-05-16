from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.deps import get_current_user
from app.db.session import get_session
from app.models import Application, User
from app.schemas import (
    CopilotAnswerOut,
    CopilotAutofillPlanIn,
    CopilotAutofillPlanOut,
    CopilotCoverLetterIn,
    CopilotCoverLetterOut,
    CopilotQuestionIn,
)
from app.services.copilot_ai import answer_question, build_autofill_plan, generate_cover_letter

router = APIRouter(prefix="/copilot", tags=["copilot"])


def _profile_for_user(user: User) -> dict:
    raw = user.applicant_profile or {}
    return raw if isinstance(raw, dict) else {}


def _job_for_application(session: Session, user_id: int, job_id: int | None) -> dict | None:
    if job_id is None:
        return None
    app_row = session.exec(
        select(Application)
        .where(Application.id == job_id, Application.user_id == user_id)
        .options(selectinload(Application.job_post))
    ).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    if app_row.job_post is None:
        return None
    job = app_row.job_post
    return {
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "salary": job.salary,
        "description": job.description,
        "source_website": job.source_website,
    }


@router.post("/answer", response_model=CopilotAnswerOut)
def copilot_answer(
    body: CopilotQuestionIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    assert user.id is not None
    profile = _profile_for_user(user)
    job = _job_for_application(session, user.id, body.job_id)
    return answer_question(
        question=body.question,
        field_label=body.field_label,
        field_type=body.field_type,
        profile=profile,
        job=job,
    )


@router.post("/autofill-plan", response_model=CopilotAutofillPlanOut)
def copilot_autofill_plan(
    body: CopilotAutofillPlanIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    assert user.id is not None
    profile = _profile_for_user(user)
    job = _job_for_application(session, user.id, body.job_id)
    return build_autofill_plan(fields=body.fields, profile=profile, job=job)


@router.post("/cover-letter", response_model=CopilotCoverLetterOut)
def copilot_cover_letter(
    body: CopilotCoverLetterIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    assert user.id is not None
    profile = _profile_for_user(user)
    job = _job_for_application(session, user.id, body.job_id)
    return generate_cover_letter(
        profile=profile,
        job=job,
        tone=body.tone,
        extra_instructions=body.extra_instructions,
    )
