from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.deps import ensure_demo_user, get_mock_user_id
from app.db.session import get_session
from app.models import Application
from app.schemas import AnalyticsSummaryOut

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummaryOut)
def analytics_summary(
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
):
    ensure_demo_user(session)
    uid = get_mock_user_id(x_mock_user_id)
    rows = session.exec(
        select(Application)
        .where(Application.user_id == uid)
        .options(selectinload(Application.job_post))
    ).all()

    total_saved = len(rows)
    total_applied = sum(1 for a in rows if a.status == "Applied")
    interview_count = sum(1 for a in rows if a.status == "Interview")
    rejection_count = sum(1 for a in rows if a.status == "Rejected")

    scores = [float(a.match_score) for a in rows if a.match_score is not None]
    average_match_score = round(sum(scores) / len(scores), 1) if scores else None

    by_source: Counter[str] = Counter()
    by_status: Counter[str] = Counter()
    for a in rows:
        by_status[a.status] += 1
        src = (a.job_post.source_website if a.job_post else None) or "unknown"
        by_source[src] += 1

    return AnalyticsSummaryOut(
        total_saved=total_saved,
        total_applied=total_applied,
        interview_count=interview_count,
        rejection_count=rejection_count,
        average_match_score=average_match_score,
        by_source=dict(by_source),
        by_status=dict(by_status),
    )
