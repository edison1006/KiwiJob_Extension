from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.config import get_settings
from app.deps import ensure_demo_user, get_mock_user_id
from app.db.session import get_session
from app.models import Application, MatchResult, Resume
from app.schemas import MatchAnalysisOut, MatchAnalyzeIn
from app.services.match_ai import analyze_cv_vs_jd

router = APIRouter(prefix="/match", tags=["match"])


def _latest_resume(session: Session, user_id: int) -> Resume | None:
    return session.exec(select(Resume).where(Resume.user_id == user_id).order_by(Resume.created_at.desc())).first()


def _openai_configured() -> bool:
    key = get_settings().openai_api_key
    return bool(key and str(key).strip())


@router.post("/analyze", response_model=MatchAnalysisOut)
def analyze_match(
    body: MatchAnalyzeIn,
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
):
    """`job_id` is the application (tracker) id."""
    ensure_demo_user(session)
    uid = get_mock_user_id(x_mock_user_id)
    app_row = session.exec(
        select(Application)
        .where(Application.id == body.job_id, Application.user_id == uid)
        .options(selectinload(Application.job_post))
    ).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    assert app_row.job_post is not None

    resume = _latest_resume(session, uid)
    cv_text = (resume.extracted_text or "").strip() if resume else ""
    if not cv_text and _openai_configured():
        raise HTTPException(
            status_code=400,
            detail="Upload a CV first (required when OPENAI_API_KEY is set). Upload via the web dashboard or POST /resumes/upload.",
        )

    jd = app_row.job_post.description or app_row.job_post.title or ""
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
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
):
    ensure_demo_user(session)
    uid = get_mock_user_id(x_mock_user_id)
    app_row = session.exec(
        select(Application)
        .where(Application.id == job_id, Application.user_id == uid)
        .options(selectinload(Application.match_results))
    ).first()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found")
    if not app_row.match_results:
        raise HTTPException(status_code=404, detail="No match analysis yet")
    latest = sorted(app_row.match_results, key=lambda m: m.created_at, reverse=True)[0]
    return MatchAnalysisOut.model_validate(latest.payload)
