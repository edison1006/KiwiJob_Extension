from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select

from app.core.config import get_settings
from app.db.session import get_session
from app.deps import get_current_user
from app.models import User
from app.schemas import AccountIdentifyIn, AccountIdentifyOut, AuthIn, AuthOut, OAuthIn, PasswordChangeIn, UserOut
from app.services.auth import create_access_token, create_social_oauth_state, decode_social_oauth_state, hash_password, verify_password
from app.services.membership import effective_membership_tier
from app.services.oauth import OAuthIdentity, exchange_social_code, social_authorization_url, verify_oauth_identity
from app.services.rate_limit import client_rate_limit_key, enforce_rate_limit, value_rate_limit_key

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    assert user.id is not None
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name or "",
        membership_tier=effective_membership_tier(user),
        membership_expires_at=user.membership_expires_at,
    )


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


def _upsert_oauth_user(identity: OAuthIdentity, session: Session) -> User:
    user = session.exec(
        select(User).where(
            User.auth_provider == identity.provider,
            User.auth_provider_subject == identity.subject,
        )
    ).first()
    if not user and identity.provider == "google":
        user = session.exec(select(User).where(User.gmail_subject == identity.subject)).first()
    if not user:
        user = session.exec(select(User).where(User.email == identity.email)).first()
    if not user and identity.provider == "google":
        user = session.exec(select(User).where(User.gmail_email == identity.email)).first()
    if not user:
        user = User(
            email=identity.email,
            display_name=identity.display_name,
            password_hash="",
            auth_provider=identity.provider,
            auth_provider_subject=identity.subject,
            gmail_email=identity.email if identity.provider == "google" else None,
            gmail_subject=identity.subject if identity.provider == "google" else None,
        )
        session.add(user)
    else:
        if user.email != identity.email:
            email_owner = session.exec(select(User).where(User.email == identity.email)).first()
            if email_owner and email_owner.id != user.id:
                raise HTTPException(
                    status_code=409,
                    detail="This email is already used by another KiwiJob account",
                )
            # A successful OAuth exchange proves ownership of this address. Keep
            # the existing KiwiJob user id (and its tracker/CV history), while
            # making the provider's verified email the account's primary email.
            user.email = identity.email
        if identity.display_name and not user.display_name:
            user.display_name = identity.display_name
        user.auth_provider = identity.provider
        user.auth_provider_subject = identity.subject
        if identity.provider == "google":
            user.gmail_email = identity.email
            user.gmail_subject = identity.subject
        session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/identify", response_model=AccountIdentifyOut)
def identify_account(body: AccountIdentifyIn, request: Request, session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    enforce_rate_limit(
        session,
        action="auth_identify_client",
        bucket_key=client_rate_limit_key(request),
        limit=30,
        window_seconds=15 * 60,
    )
    enforce_rate_limit(
        session,
        action="auth_identify_email",
        bucket_key=value_rate_limit_key("identify-email", email),
        limit=10,
        window_seconds=15 * 60,
    )
    user = session.exec(select(User).where(User.email == email)).first()
    matched_linked_gmail = False
    if not user:
        user = session.exec(select(User).where(User.gmail_email == email)).first()
        matched_linked_gmail = user is not None
    return AccountIdentifyOut(
        account_exists=user is not None,
        password_login_available=bool(user and user.password_hash and not matched_linked_gmail),
        auth_provider=(
            "google"
            if matched_linked_gmail
            else user.auth_provider if user and user.auth_provider in {"google", "apple", "github"} else None
        ),
    )


@router.post("/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def register(body: AuthIn, request: Request, response: Response, session: Session = Depends(get_session)):
    enforce_rate_limit(
        session,
        action="auth_register",
        bucket_key=client_rate_limit_key(request),
        limit=5,
        window_seconds=60 * 60,
    )
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
def login(body: AuthIn, request: Request, response: Response, session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    enforce_rate_limit(
        session,
        action="auth_login_client",
        bucket_key=client_rate_limit_key(request),
        limit=30,
        window_seconds=15 * 60,
    )
    enforce_rate_limit(
        session,
        action="auth_login_account",
        bucket_key=value_rate_limit_key("email", email),
        limit=10,
        window_seconds=15 * 60,
    )
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    assert user.id is not None
    token = create_access_token(user.id, user.email)
    _set_cookie(response, token)
    return AuthOut(access_token=token, user=_user_out(user))


@router.post("/oauth", response_model=AuthOut)
def oauth_login(body: OAuthIn, request: Request, response: Response, session: Session = Depends(get_session)):
    enforce_rate_limit(
        session,
        action="auth_oauth",
        bucket_key=client_rate_limit_key(request),
        limit=20,
        window_seconds=15 * 60,
    )
    identity = verify_oauth_identity(body.provider, body.id_token)
    user = _upsert_oauth_user(identity, session)
    assert user.id is not None
    token = create_access_token(user.id, user.email)
    _set_cookie(response, token)
    return AuthOut(access_token=token, user=_user_out(user))


@router.get("/social/{provider}/start")
def social_oauth_start(provider: str, return_to: str = "/"):
    if provider != "github":
        raise HTTPException(status_code=404, detail="Unsupported social sign-in provider")
    redirect_uri = f"{get_settings().api_public_url.rstrip('/')}/auth/social/{provider}/callback"
    state_token = create_social_oauth_state(provider, return_to)
    return RedirectResponse(social_authorization_url(provider, redirect_uri, state_token), status_code=302)


@router.get("/social/{provider}/callback", name="social_oauth_callback")
def social_oauth_callback(
    provider: str,
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    session: Session = Depends(get_session),
):
    settings = get_settings()
    enforce_rate_limit(
        session,
        action="auth_social_oauth",
        bucket_key=client_rate_limit_key(request),
        limit=20,
        window_seconds=15 * 60,
    )
    state_payload = decode_social_oauth_state(state, provider)
    if not state_payload:
        raise HTTPException(status_code=400, detail="Invalid or expired social sign-in request")
    return_to = str(state_payload.get("return_to") or "/")
    if error or not code:
        query = urlencode({"oauth_error": error or "authorization_cancelled"})
        return RedirectResponse(f"{settings.web_app_url.rstrip('/')}/login?{query}", status_code=302)
    redirect_uri = f"{settings.api_public_url.rstrip('/')}/auth/social/{provider}/callback"
    identity = exchange_social_code(provider, code, redirect_uri)
    user = _upsert_oauth_user(identity, session)
    assert user.id is not None
    token = create_access_token(user.id, user.email)
    query = urlencode({"oauth": "success", "return_to": return_to})
    response = RedirectResponse(f"{settings.web_app_url.rstrip('/')}/login?{query}", status_code=302)
    _set_cookie(response, token)
    return response


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
    from app.models import Application, ApplicationEvent, CvOptimization, EmailConnection, EmailEvent, Notification, Resume
    from app.services.resume_parse import delete_resume_file

    user_id = user.id
    assert user_id is not None
    for row in session.exec(select(CvOptimization).where(CvOptimization.user_id == user_id)).all():
        session.delete(row)
    for row in session.exec(select(Resume).where(Resume.user_id == user_id)).all():
        if row.stored_path:
            try:
                delete_resume_file(row.stored_path)
            except Exception:  # noqa: BLE001
                pass
        session.delete(row)
    for model in (ApplicationEvent, EmailEvent, Notification, Application):
        for row in session.exec(select(model).where(model.user_id == user_id)).all():
            session.delete(row)
    for row in session.exec(select(EmailConnection).where(EmailConnection.user_id == user_id)).all():
        session.delete(row)
    session.delete(user)
    session.commit()
    return None
