from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.time import utc_now
from app.db.session import get_session
from app.deps import get_current_user
from app.models import Application, ApplicationEvent, EmailConnection, EmailEvent, User
from app.routers.jobs import _app_to_list_out
from app.schemas import (
    GmailConnectOut,
    GmailIntegrationStatusOut,
    GmailSyncCandidateOut,
    GmailSyncConfirmIn,
    GmailSyncConfirmOut,
)
from app.services.auth import create_oauth_state, decode_access_token, decode_oauth_state
from app.services.gmail_sync import (
    GmailSyncError,
    build_authorization_url,
    exchange_authorization_code,
    gmail_is_configured,
    scan_gmail,
    upsert_connection,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _connection(session: Session, user_id: int) -> EmailConnection | None:
    return session.exec(
        select(EmailConnection).where(EmailConnection.user_id == user_id, EmailConnection.provider == "gmail")
    ).first()


def _candidate_out(session: Session, event: EmailEvent) -> GmailSyncCandidateOut | None:
    if not event.application_id or not event.parsed_status or event.id is None:
        return None
    application = session.exec(
        select(Application)
        .where(Application.id == event.application_id)
        .options(selectinload(Application.job_post))
    ).first()
    if not application or not application.job_post:
        return None
    return GmailSyncCandidateOut(
        email_event_id=event.id,
        application_id=application.id,
        company=application.job_post.company,
        job_title=application.job_post.title,
        current_status=application.status,
        proposed_status=event.parsed_status,
        subject=event.subject,
        sender=event.sender,
        received_at=event.received_at,
        confidence=event.confidence or 0.0,
    )


@router.get("/gmail/status", response_model=GmailIntegrationStatusOut)
def gmail_status(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    assert user.id is not None
    connection = _connection(session, user.id)
    return GmailIntegrationStatusOut(
        configured=gmail_is_configured(),
        connected=connection is not None,
        prompt_required=not user.gmail_onboarding_completed and connection is None,
        email_address=connection.email_address if connection else None,
        last_synced_at=connection.last_synced_at if connection else None,
    )


@router.post("/gmail/onboarding-dismiss")
def dismiss_gmail_onboarding(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    user.gmail_onboarding_completed = True
    session.add(user)
    session.commit()
    return {"ok": True}


@router.get("/gmail/connect", response_model=GmailConnectOut)
def connect_gmail(user: User = Depends(get_current_user)):
    assert user.id is not None
    try:
        return GmailConnectOut(authorization_url=build_authorization_url(create_oauth_state(user.id)))
    except GmailSyncError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/gmail/callback")
def gmail_callback(
    code: str = "",
    state: str = "",
    error: str = "",
    session_cookie: str | None = Cookie(default=None, alias="kiwijob_session"),
    session: Session = Depends(get_session),
):
    settings = get_settings()
    redirect_base = settings.web_app_url.rstrip("/") + "/"
    if error:
        return RedirectResponse(f"{redirect_base}?{urlencode({'gmail': 'error', 'message': error})}")
    payload = decode_oauth_state(state)
    login_payload = decode_access_token(session_cookie or "")
    if not payload or not login_payload or payload.get("sub") != login_payload.get("sub"):
        return RedirectResponse(f"{redirect_base}?{urlencode({'gmail': 'error', 'message': 'Invalid or expired authorization'})}")
    try:
        user_id = int(payload["sub"])
        user = session.get(User, user_id)
        if not user or not code:
            raise GmailSyncError("The KiwiJob account could not be found")
        token_body = exchange_authorization_code(code)
        upsert_connection(session, user, token_body)
    except (ValueError, KeyError, GmailSyncError) as exc:
        return RedirectResponse(f"{redirect_base}?{urlencode({'gmail': 'error', 'message': str(exc)})}")
    return RedirectResponse(f"{redirect_base}?gmail=connected")


@router.post("/gmail/sync-preview", response_model=list[GmailSyncCandidateOut])
def gmail_sync_preview(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    assert user.id is not None
    connection = _connection(session, user.id)
    if not connection:
        raise HTTPException(status_code=409, detail="Connect Gmail before syncing")
    try:
        events = scan_gmail(session, user, connection)
    except GmailSyncError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    candidates = [_candidate_out(session, event) for event in events]
    return [candidate for candidate in candidates if candidate is not None]


@router.post("/gmail/sync-confirm", response_model=GmailSyncConfirmOut)
def gmail_sync_confirm(
    body: GmailSyncConfirmIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assert user.id is not None
    selected_ids = set(body.email_event_ids)
    if not selected_ids:
        return GmailSyncConfirmOut(updated_count=0)
    events = session.exec(
        select(EmailEvent).where(
            EmailEvent.user_id == user.id,
            EmailEvent.provider == "gmail",
            EmailEvent.id.in_(selected_ids),
        ).order_by(EmailEvent.received_at.asc(), EmailEvent.id.asc())
    ).all()
    updated: dict[int, Application] = {}
    now = utc_now()
    for event in events:
        if event.sync_state != "pending" or not event.application_id or not event.parsed_status:
            continue
        application = session.exec(
            select(Application)
            .where(Application.id == event.application_id, Application.user_id == user.id)
            .options(selectinload(Application.job_post))
        ).first()
        if not application:
            event.sync_state = "ignored"
            session.add(event)
            continue
        application.status = event.parsed_status
        application.updated_at = event.received_at or now
        event.sync_state = "applied"
        session.add(application)
        session.add(event)
        session.add(
            ApplicationEvent(
                user_id=user.id,
                application_id=application.id,
                event_type=f"email_{event.parsed_status.lower()}",
                source="gmail",
                status_after=event.parsed_status,
                occurred_at=event.received_at or now,
                payload={
                    "email_event_id": event.id,
                    "subject": event.subject,
                    "sender": event.sender,
                    "confidence": event.confidence,
                },
            )
        )
        assert application.id is not None
        updated[application.id] = application

    for event in session.exec(
        select(EmailEvent).where(
            EmailEvent.user_id == user.id,
            EmailEvent.provider == "gmail",
            EmailEvent.sync_state == "pending",
            EmailEvent.id.notin_(selected_ids),
        )
    ).all():
        event.sync_state = "dismissed"
        session.add(event)
    session.commit()
    applications = []
    for application in updated.values():
        session.refresh(application)
        session.refresh(application, attribute_names=["job_post"])
        applications.append(_app_to_list_out(application))
    return GmailSyncConfirmOut(updated_count=len(updated), applications=applications)


@router.delete("/gmail", status_code=204)
def disconnect_gmail(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    assert user.id is not None
    connection = _connection(session, user.id)
    if connection:
        session.delete(connection)
        session.commit()
    return None
