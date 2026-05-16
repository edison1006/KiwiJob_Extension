from __future__ import annotations

from collections import Counter
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.deps import get_current_user
from app.db.session import get_session
from app.models import Application, User
from app.schemas import AnalyticsSummaryOut, InsightTitleCountOut, InsightsSummaryOut

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummaryOut)
def analytics_summary(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    rows = session.exec(
        select(Application)
        .where(Application.user_id == user.id)
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


@router.get("/insights", response_model=InsightsSummaryOut)
def analytics_insights(
    days: int = 7,
    start: str | None = None,
    end: str | None = None,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    now = datetime.utcnow()
    window_days = min(max(days, 1), 365)
    until = now
    since = now - timedelta(days=window_days)
    if start:
        since = datetime.combine(datetime.fromisoformat(start).date(), time.min)
    if end:
        until = datetime.combine(datetime.fromisoformat(end).date(), time.max)
    window_days = max(1, (until.date() - since.date()).days + 1)
    rows = session.exec(
        select(Application)
        .where(Application.user_id == user.id, Application.updated_at >= since, Application.updated_at <= until)
        .options(selectinload(Application.job_post))
    ).all()

    applications = sum(1 for a in rows if a.status in {"Applied", "Assessment", "Interview", "Rejected", "Offer"})
    replies = sum(1 for a in rows if a.status in {"Assessment", "Interview", "Rejected", "Offer"})
    interviews = sum(1 for a in rows if a.status == "Interview")
    offers = sum(1 for a in rows if a.status == "Offer")
    rejections = sum(1 for a in rows if a.status == "Rejected")

    by_status: Counter[str] = Counter(a.status for a in rows)
    titles: Counter[str] = Counter()
    for app_row in rows:
        title = app_row.job_post.title if app_row.job_post else ""
        if title:
            titles[title] += 1

    response_rate = round((replies / applications * 100), 1) if applications else 0.0
    interview_rate = round((interviews / applications * 100), 1) if applications else 0.0

    return InsightsSummaryOut(
        days=window_days,
        start_date=since,
        end_date=until,
        applications=applications,
        replies=replies,
        interviews=interviews,
        offers=offers,
        rejections=rejections,
        response_rate=response_rate,
        interview_rate=interview_rate,
        top_titles=[InsightTitleCountOut(title=title, count=count) for title, count in titles.most_common(6)],
        by_status=dict(by_status),
    )
