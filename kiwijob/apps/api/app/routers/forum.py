from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.time import utc_now
from app.db.session import get_session
from app.deps import get_current_user
from app.models import ForumAttachment, ForumComment, ForumPost, ForumPostLike, User
from app.schemas import (
    ForumAttachmentOut,
    ForumAuthorOut,
    ForumCommentCreateIn,
    ForumCommentOut,
    ForumLikeOut,
    ForumPostCreateIn,
    ForumPostDetailOut,
    ForumPostOut,
)
from app.services.forum_content import forum_plain_text, sanitize_forum_html
from app.services.rate_limit import enforce_rate_limit, user_rate_limit_key

router = APIRouter(prefix="/forum", tags=["forum"])

ALLOWED_ATTACHMENTS = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain", ".csv": "text/csv", ".zip": "application/zip",
}


def _attachment_out(row: ForumAttachment) -> ForumAttachmentOut:
    assert row.id is not None
    return ForumAttachmentOut(
        id=row.id,
        filename=row.filename,
        media_type=row.media_type,
        size_bytes=row.size_bytes,
        kind=row.kind,
    )


def _attachments(session: Session, post_id: int) -> list[ForumAttachmentOut]:
    rows = session.exec(
        select(ForumAttachment).where(ForumAttachment.post_id == post_id).order_by(ForumAttachment.created_at.asc())
    ).all()
    return [_attachment_out(row) for row in rows]


def _author(session: Session, user_id: int) -> ForumAuthorOut:
    user = session.get(User, user_id)
    name = (user.display_name if user else "").strip() or "KiwiJob member"
    return ForumAuthorOut(id=user_id, display_name=name)


def _counts(session: Session, post_id: int) -> tuple[int, int]:
    likes = session.exec(select(func.count()).select_from(ForumPostLike).where(ForumPostLike.post_id == post_id)).one()
    comments = session.exec(select(func.count()).select_from(ForumComment).where(ForumComment.post_id == post_id)).one()
    return int(likes), int(comments)


def _post_out(session: Session, post: ForumPost, user_id: int, *, include_content: bool = True) -> ForumPostOut:
    assert post.id is not None
    likes, comments = _counts(session, post.id)
    liked = session.exec(
        select(ForumPostLike).where(ForumPostLike.post_id == post.id, ForumPostLike.user_id == user_id)
    ).first() is not None
    plain_content = forum_plain_text(post.content)
    content = post.content if include_content else (plain_content[:420].rstrip() + ("…" if len(plain_content) > 420 else ""))
    return ForumPostOut(
        id=post.id,
        category=post.category,
        title=post.title,
        content=content,
        tags=post.tags if isinstance(post.tags, list) else [],
        attachments=_attachments(session, post.id),
        author=_author(session, post.user_id),
        view_count=post.view_count,
        like_count=likes,
        comment_count=comments,
        liked_by_me=liked,
        can_delete=post.user_id == user_id,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def _get_post(session: Session, post_id: int) -> ForumPost:
    post = session.get(ForumPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Forum post not found")
    return post


@router.get("/posts", response_model=list[ForumPostOut])
def list_posts(
    category: str = Query(default="all", max_length=50),
    query: str = Query(default="", max_length=200),
    sort: str = Query(default="latest", pattern="^(latest|popular)$"),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    statement = select(ForumPost)
    if category != "all":
        statement = statement.where(ForumPost.category == category)
    term = query.strip()
    if term:
        like = f"%{term}%"
        statement = statement.where(or_(ForumPost.title.ilike(like), ForumPost.content.ilike(like)))
    statement = statement.order_by(ForumPost.created_at.desc()).offset(offset).limit(limit)
    posts = list(session.exec(statement).all())
    rows = [_post_out(session, post, user.id, include_content=False) for post in posts]
    if sort == "popular":
        rows.sort(key=lambda item: (item.like_count * 3 + item.comment_count * 2 + item.view_count, item.created_at), reverse=True)
    return rows


@router.post("/posts", response_model=ForumPostOut, status_code=201)
def create_post(
    body: ForumPostCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tags = list(dict.fromkeys(tag.strip().lower()[:40] for tag in body.tags if tag.strip()))[:5]
    safe_content = sanitize_forum_html(body.content)
    plain_content = forum_plain_text(safe_content)
    if len(plain_content) < 20:
        raise HTTPException(status_code=422, detail="Post content must contain at least 20 characters of text")
    if len(plain_content) > 30_000:
        raise HTTPException(status_code=422, detail="Post content cannot exceed 30,000 characters")
    attachment_ids = list(dict.fromkeys(body.attachment_ids))
    attachments = list(session.exec(
        select(ForumAttachment).where(
            ForumAttachment.id.in_(attachment_ids),
            ForumAttachment.user_id == user.id,
            ForumAttachment.post_id.is_(None),
        )
    ).all()) if attachment_ids else []
    if len(attachments) != len(attachment_ids):
        raise HTTPException(status_code=400, detail="One or more attachments are invalid or already attached")
    post = ForumPost(
        user_id=user.id,
        category=body.category,
        title=body.title.strip(),
        content=safe_content,
        tags=tags,
    )
    session.add(post)
    session.flush()
    for attachment in attachments:
        attachment.post_id = post.id
        session.add(attachment)
    session.commit()
    session.refresh(post)
    return _post_out(session, post, user.id)


@router.get("/posts/{post_id}", response_model=ForumPostDetailOut)
def get_post(
    post_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    post = _get_post(session, post_id)
    post.view_count += 1
    session.add(post)
    session.commit()
    session.refresh(post)
    base = _post_out(session, post, user.id)
    comments = session.exec(
        select(ForumComment).where(ForumComment.post_id == post_id).order_by(ForumComment.created_at.asc())
    ).all()
    return ForumPostDetailOut(
        **base.model_dump(),
        comments=[
            ForumCommentOut(
                id=comment.id,
                content=comment.content,
                author=_author(session, comment.user_id),
                created_at=comment.created_at,
                updated_at=comment.updated_at,
                can_delete=comment.user_id == user.id,
            )
            for comment in comments
        ],
    )


@router.post("/attachments", response_model=ForumAttachmentOut, status_code=201)
async def upload_attachment(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    enforce_rate_limit(
        session,
        action="forum_attachment_upload",
        bucket_key=user_rate_limit_key(user.id),
        limit=30,
        window_seconds=60 * 60,
    )
    filename = Path(file.filename or "attachment.bin").name[:500]
    extension = Path(filename).suffix.lower()
    media_type = ALLOWED_ATTACHMENTS.get(extension)
    if not media_type:
        raise HTTPException(status_code=400, detail="Unsupported attachment type")
    max_bytes = get_settings().forum_attachment_max_bytes
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File too large (max {max_bytes // (1024 * 1024)}MB)")
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if extension in {".jpg", ".jpeg"} and not data.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail="Invalid JPEG image")
    if extension == ".png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="Invalid PNG image")
    if extension == ".gif" and not data.startswith((b"GIF87a", b"GIF89a")):
        raise HTTPException(status_code=400, detail="Invalid GIF image")
    if extension == ".webp" and not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
        raise HTTPException(status_code=400, detail="Invalid WebP image")

    storage_dir = Path(get_settings().forum_storage_dir).resolve() / str(user.id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    stored_path = storage_dir / f"{uuid4().hex}{extension}"
    stored_path.write_bytes(data)
    row = ForumAttachment(
        user_id=user.id,
        filename=filename,
        stored_path=str(stored_path),
        media_type=media_type or mimetypes.guess_type(filename)[0] or "application/octet-stream",
        size_bytes=len(data),
        kind="image" if media_type.startswith("image/") else "file",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _attachment_out(row)


@router.get("/attachments/{attachment_id}/content")
def attachment_content(
    attachment_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    row = session.get(ForumAttachment, attachment_id)
    if not row or (row.post_id is None and row.user_id != user.id):
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = Path(row.stored_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file not found")
    disposition = "inline" if row.kind == "image" else "attachment"
    headers = {"Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(row.filename)}"}
    return FileResponse(path, media_type=row.media_type, headers=headers)


@router.delete("/attachments/{attachment_id}", status_code=204)
def delete_attachment(
    attachment_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    row = session.get(ForumAttachment, attachment_id)
    if not row or row.user_id != user.id or row.post_id is not None:
        raise HTTPException(status_code=404, detail="Unattached file not found")
    stored_path = row.stored_path
    session.delete(row)
    session.commit()
    Path(stored_path).unlink(missing_ok=True)
    return Response(status_code=204)


@router.post("/posts/{post_id}/comments", response_model=ForumCommentOut, status_code=201)
def create_comment(
    post_id: int,
    body: ForumCommentCreateIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _get_post(session, post_id)
    comment = ForumComment(post_id=post_id, user_id=user.id, content=body.content.strip())
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return ForumCommentOut(
        id=comment.id,
        content=comment.content,
        author=_author(session, user.id),
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        can_delete=True,
    )


@router.post("/posts/{post_id}/like", response_model=ForumLikeOut)
def toggle_like(
    post_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _get_post(session, post_id)
    existing = session.exec(
        select(ForumPostLike).where(ForumPostLike.post_id == post_id, ForumPostLike.user_id == user.id)
    ).first()
    if existing:
        session.delete(existing)
        liked = False
    else:
        session.add(ForumPostLike(post_id=post_id, user_id=user.id))
        liked = True
    session.commit()
    like_count, _ = _counts(session, post_id)
    return ForumLikeOut(liked=liked, like_count=like_count)


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(
    post_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    post = _get_post(session, post_id)
    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    attachments = list(session.exec(select(ForumAttachment).where(ForumAttachment.post_id == post_id)).all())
    stored_paths = [row.stored_path for row in attachments]
    for attachment in attachments:
        session.delete(attachment)
    session.delete(post)
    session.commit()
    for stored_path in stored_paths:
        Path(stored_path).unlink(missing_ok=True)
    return Response(status_code=204)
