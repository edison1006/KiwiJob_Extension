from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.config import get_settings
from app.deps import get_current_user
from app.db.session import get_session
from app.models import Application, MatchResult, Resume, User
from app.schemas import JobSaveIn, MatchAnalysisOut, MatchAnalyzeIn
from app.services.match_ai import analyze_cv_vs_jd

router = APIRouter(prefix="/match", tags=["match"])


def _latest_resume(session: Session, user_id: int) -> Resume | None:
    return session.exec(select(Resume).where(Resume.user_id == user_id).order_by(Resume.created_at.desc())).first()


def _openai_configured() -> bool:
    key = get_settings().openai_api_key
    return bool(key and str(key).strip())


def _cv_text_for_user(session: Session, user_id: int) -> str:
    resume = _latest_resume(session, user_id)
    return (resume.extracted_text or "").strip() if resume else ""


def _jd_text(description: str | None, title: str | None, visa_requirement: str | None) -> str:
    parts = [description or title or ""]
    if visa_requirement:
        parts.append(f"Work authorization / visa requirement: {visa_requirement}")
    return "\n\n".join(p for p in parts if p)


@router.post("/preview", response_model=MatchAnalysisOut)
def preview_match(
    body: JobSaveIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Analyze a page job against the latest CV without saving it to the tracker."""
    assert user.id is not None
    cv_text = _cv_text_for_user(session, user.id)
    if not cv_text and _openai_configured():
        raise HTTPException(
            status_code=400,
            detail="Upload a CV first (required when OPENAI_API_KEY is set).",
        )
    jd = _jd_text(body.description, body.title, body.visa_requirement)
    return analyze_cv_vs_jd(cv_text, jd)


@router.post("/analyze", response_model=MatchAnalysisOut)
def analyze_match(
    body: MatchAnalyzeIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """`job_id` is the application (tracker) id."""
    assert user.id is not None
    app_row = session.exec(
        select(Application)
        .where(Application.id == body.job_id, Application.user_id == user.id)
        .options(selectinload(Application.job_post))
    ).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    assert app_row.job_post is not None

    cv_text = _cv_text_for_user(session, user.id)
    if not cv_text and _openai_configured():
        raise HTTPException(
            status_code=400,
            detail="Upload a CV first (required when OPENAI_API_KEY is set). Upload via the web dashboard or POST /resumes/upload.",
        )

    jd = _jd_text(app_row.job_post.description, app_row.job_post.title, app_row.job_post.visa_requirement)
    # Without API key the scorer is mock/heuristic and can run on JD alone; with OpenAI, CV text is required above.
    result = analyze_cv_vs_jd(cv_text, jd)

    mr = MatchResult(
        application_id=app_row.id,
        score=float(result.score),
        payload=result.model_dump(),
        created_at=datetime.utcnow(),
    )
    app_row.match_score = float(result.score)
    app_row.updated_at = datetime.utcnow()
    session.add(mr)
    session.add(app_row)
    session.commit()
    return result


@router.get("/{job_id}", response_model=MatchAnalysisOut)
def get_match(
    job_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    app_row = session.exec(
        select(Application)
        .where(Application.id == job_id, Application.user_id == user.id)
        .options(selectinload(Application.match_results))
    ).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    if not app_row.match_results:
        raise HTTPException(status_code=404, detail="No match analysis yet")
    latest = sorted(app_row.match_results, key=lambda m: m.created_at, reverse=True)[0]
    return MatchAnalysisOut.model_validate(latest.payload)
