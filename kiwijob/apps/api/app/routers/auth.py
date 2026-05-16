from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.core.config import get_settings
from app.db.session import get_session
from app.deps import get_current_user
from app.models import User
from app.schemas import AuthIn, AuthOut, OAuthIn, PasswordChangeIn, UserOut
from app.services.auth import create_access_token, hash_password, verify_password
from app.services.oauth import verify_oauth_identity

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    assert user.id is not None
    return UserOut(id=user.id, email=user.email, display_name=user.display_name or "")


def _set_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        "kiwijob_session",
        token,
        max_age=settings.jwt_expires_minutes * 60,
        httponly=True,
        secure=settings.secure_auth_cookie,
        samesite="none" if settings.secure_auth_cookie else "lax",
        path="/",
    )


@router.post("/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def register(body: AuthIn, response: Response, session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email is already registered")
    user = User(email=email, display_name=body.display_name.strip(), password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    assert user.id is not None
    token = create_access_token(user.id, user.email)
    _set_cookie(response, token)
    return AuthOut(access_token=token, user=_user_out(user))


@router.post("/login", response_model=AuthOut)
def login(body: AuthIn, response: Response, session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    assert user.id is not None
    token = create_access_token(user.id, user.email)
    _set_cookie(response, token)
    return AuthOut(access_token=token, user=_user_out(user))


@router.post("/oauth", response_model=AuthOut)
def oauth_login(body: OAuthIn, response: Response, session: Session = Depends(get_session)):
    identity = verify_oauth_identity(body.provider, body.id_token)
    user = session.exec(select(User).where(User.email == identity.email)).first()
    if not user:
        user = User(
            email=identity.email,
            display_name=identity.display_name,
            password_hash="",
            auth_provider=identity.provider,
            auth_provider_subject=identity.subject,
        )
        session.add(user)
    else:
        if identity.display_name and not user.display_name:
            user.display_name = identity.display_name
        user.auth_provider = identity.provider
        user.auth_provider_subject = identity.subject
        session.add(user)
    session.commit()
    session.refresh(user)
    assert user.id is not None
    token = create_access_token(user.id, user.email)
    _set_cookie(response, token)
    return AuthOut(access_token=token, user=_user_out(user))


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("kiwijob_session", path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.post("/password")
def change_password(
    body: PasswordChangeIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    session.add(user)
    session.commit()
    return {"ok": True}


@router.delete("/account", status_code=204)
def delete_account(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    from app.models import Application, ApplicationEvent, EmailEvent, Notification, Resume
    import os

    user_id = user.id
    assert user_id is not None
    for row in session.exec(select(Resume).where(Resume.user_id == user_id)).all():
        if row.stored_path:
            try:
                os.remove(row.stored_path)
            except OSError:
                pass
        session.delete(row)
    for model in (ApplicationEvent, EmailEvent, Notification, Application):
        for row in session.exec(select(model).where(model.user_id == user_id)).all():
            session.delete(row)
    session.delete(user)
    session.commit()
    return None
