from __future__ import annotations

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlmodel import Session, select

from app.deps import ensure_demo_user, get_mock_user_id, get_or_create_user
from app.db.session import get_session
from app.models import Resume
from app.schemas import ResumeOut
from app.services.resume_parse import extract_cv_text, store_resume_file

router = APIRouter(prefix="/resumes", tags=["resumes"])


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
