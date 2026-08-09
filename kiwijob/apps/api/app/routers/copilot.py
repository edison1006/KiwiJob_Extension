from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.deps import get_current_user
from app.db.session import get_session
from app.models import Application, Resume, User
from app.schemas import (
    CopilotAnswerOut,
    CopilotAutofillPlanIn,
    CopilotAutofillPlanOut,
    CopilotCoverLetterIn,
    CopilotCoverLetterOut,
    CopilotQuestionIn,
    InterviewFeedbackIn,
    InterviewFeedbackOut,
    InterviewQuestionsIn,
    InterviewQuestionsOut,
)
from app.services.copilot_ai import answer_question, build_autofill_plan, generate_cover_letter
from app.services.interview_ai import TECHNICAL_CATEGORIES, evaluate_interview_answer, generate_interview_questions
from app.services.rate_limit import enforce_ai_generation_limits

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


def _resume_for_user(session: Session, user_id: int, resume_id: int | None) -> str:
    if resume_id is None:
        return ""
    row = session.exec(select(Resume).where(Resume.id == resume_id, Resume.user_id == user_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Resume not found")
    return row.extracted_text or ""


@router.post("/answer", response_model=CopilotAnswerOut)
def copilot_answer(
    body: CopilotQuestionIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    assert user.id is not None
    enforce_ai_generation_limits(session, user=user, budget_cost_cents=4)
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
    ai_call_count = sum(1 for field in body.fields[:80] if not field.current_value.strip())
    enforce_ai_generation_limits(
        session,
        user=user,
        cost=ai_call_count,
        budget_cost_cents=ai_call_count * 4,
    )
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
    enforce_ai_generation_limits(session, user=user, budget_cost_cents=4)
    profile = _profile_for_user(user)
    job = _job_for_application(session, user.id, body.job_id)
    resume_text = _resume_for_user(session, user.id, body.resume_id)
    return generate_cover_letter(
        profile=profile,
        job=job,
        resume_text=resume_text,
        tone=body.tone,
        extra_instructions=body.extra_instructions,
    )


@router.post("/interview/questions", response_model=InterviewQuestionsOut)
def interview_questions(
    body: InterviewQuestionsIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if body.interview_type == "technical" and body.occupation_category not in TECHNICAL_CATEGORIES:
        raise HTTPException(status_code=422, detail="Technical Interview requires a technical occupation category.")
    enforce_ai_generation_limits(session, user=user, budget_cost_cents=4)
    return generate_interview_questions(
        interview_type=body.interview_type,
        occupation_category=body.occupation_category,
        role=body.role,
        company=body.company,
        job_description=body.job_description,
        difficulty=body.difficulty,
        count=body.question_count,
    )


@router.post("/interview/feedback", response_model=InterviewFeedbackOut)
def interview_feedback(
    body: InterviewFeedbackIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    enforce_ai_generation_limits(session, user=user, budget_cost_cents=4)
    return evaluate_interview_answer(
        interview_type=body.interview_type,
        occupation_category=body.occupation_category,
        role=body.role,
        question=body.question,
        answer=body.answer,
    )
