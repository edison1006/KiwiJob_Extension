from __future__ import annotations

import os

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlmodel import Session, select

from app.deps import ensure_demo_user, get_mock_user_id, get_or_create_user
from app.db.session import get_session
from app.models import Resume
from app.schemas import CvProfileOut, ResumeOut
from app.services.resume_parse import extract_cv_text, parse_cv_profile, store_resume_file

router = APIRouter(prefix="/resumes", tags=["resumes"])


def _profile_out(row: Resume) -> CvProfileOut:
    assert row.id is not None
    return CvProfileOut.model_validate(parse_cv_profile(row.id, row.filename, row.created_at, row.extracted_text or ""))


@router.post("/upload", response_model=ResumeOut)
async def upload_resume(
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
    file: UploadFile = File(...),
):
    user = get_or_create_user(session, get_mock_user_id(x_mock_user_id))

    filename = file.filename or "resume.bin"
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 15MB)")

    try:
        text = extract_cv_text(filename, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    path = store_resume_file(user.id, filename, data)
    row = Resume(user_id=user.id, filename=filename, stored_path=path, extracted_text=text)
    session.add(row)
    session.commit()
    session.refresh(row)
    preview = (text or "")[:280].replace("\n", " ")
    return ResumeOut(
        id=row.id,
        filename=row.filename,
        created_at=row.created_at,
        text_preview=preview + ("…" if len(text) > 280 else ""),
    )


@router.get("", response_model=list[ResumeOut])
def list_resumes(
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
):
    ensure_demo_user(session)
    uid = get_mock_user_id(x_mock_user_id)
    rows = session.exec(select(Resume).where(Resume.user_id == uid).order_by(Resume.created_at.desc())).all()
    out: list[ResumeOut] = []
    for r in rows:
        preview = (r.extracted_text or "")[:280].replace("\n", " ")
        out.append(
            ResumeOut(
                id=r.id,
                filename=r.filename,
                created_at=r.created_at,
                text_preview=preview + ("…" if len(r.extracted_text or "") > 280 else ""),
            )
        )
    return out


@router.get("/profile", response_model=CvProfileOut)
def latest_resume_profile(
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
):
    ensure_demo_user(session)
    uid = get_mock_user_id(x_mock_user_id)
    row = session.exec(select(Resume).where(Resume.user_id == uid).order_by(Resume.created_at.desc())).first()
    if not row:
        return CvProfileOut()
    return _profile_out(row)


@router.get("/{resume_id}/profile", response_model=CvProfileOut)
def resume_profile(
    resume_id: int,
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
):
    ensure_demo_user(session)
    uid = get_mock_user_id(x_mock_user_id)
    row = session.exec(select(Resume).where(Resume.id == resume_id, Resume.user_id == uid)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Resume not found")
    return _profile_out(row)


@router.delete("/{resume_id}", status_code=204)
def delete_resume(
    resume_id: int,
    session: Session = Depends(get_session),
    x_mock_user_id: str | None = Header(default=None, alias="X-Mock-User-Id"),
):
    ensure_demo_user(session)
    uid = get_mock_user_id(x_mock_user_id)
    row = session.exec(select(Resume).where(Resume.id == resume_id, Resume.user_id == uid)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Resume not found")
    stored_path = row.stored_path
    session.delete(row)
    session.commit()
    if stored_path:
        try:
            os.remove(stored_path)
        except OSError:
            pass
    return None
