from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlmodel import Session

from app.deps import get_or_create_user, get_mock_user_id
from app.db.session import get_session
from app.models import User
from app.schemas import ApplicantAutofillIn, ApplicantAutofillOut

router = APIRouter(prefix="/me", tags=["profile"])


def _out_from_user(user: User) -> ApplicantAutofillOut:
    raw = user.applicant_profile or {}
    if not isinstance(raw, dict):
        raw = {}
    return ApplicantAutofillOut(
        fullName=str(raw.get("fullName", "") or "")[:500],
        email=str(raw.get("email", "") or "")[:500],
        phone=str(raw.get("phone", "") or "")[:80],
        linkedInUrl=str(raw.get("linkedInUrl", "") or "")[:2048],
        portfolioUrl=str(raw.get("portfolioUrl", "") or "")[:2048],
        githubUrl=str(raw.get("githubUrl", "") or "")[:2048],
        city=str(raw.get("city", "") or "")[:200],
        country=str(raw.get("country", "") or "")[:200],
        workAuthorization=str(raw.get("workAuthorization", "") or "")[:500],
        sponsorship=str(raw.get("sponsorship", "") or "")[:500],
        salaryExpectation=str(raw.get("salaryExpectation", "") or "")[:500],
        noticePeriod=str(raw.get("noticePeriod", "") or "")[:500],
        skills=str(raw.get("skills", "") or "")[:8000],
        summary=str(raw.get("summary", "") or "")[:8000],
        coverLetter=str(raw.get("coverLetter", "") or "")[:20000],
    )


@router.get("/applicant-profile", response_model=ApplicantAutofillOut)
def get_applicant_profile(
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
):
    user = get_or_create_user(session, get_mock_user_id(x_mock_user_id))
    return _out_from_user(user)


@router.put("/applicant-profile", response_model=ApplicantAutofillOut)
def put_applicant_profile(
    body: ApplicantAutofillIn,
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
):
    user = get_or_create_user(session, get_mock_user_id(x_mock_user_id))
    user.applicant_profile = body.model_dump()
    session.add(user)
    try:
        session.commit()
    except Exception as e:  # noqa: BLE001
        session.rollback()
        raise HTTPException(status_code=500, detail="Could not save profile") from e
    session.refresh(user)
    return _out_from_user(user)
