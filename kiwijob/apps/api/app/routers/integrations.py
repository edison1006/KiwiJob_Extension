from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.config import get_settings
from app.db.session import get_session
from app.deps import get_current_user
from app.models import Application, User
from app.schemas import GmailIntegrationStatusOut, GmailLinkIn
from app.services.gmail_addon import (
    CURRENT_MESSAGE_SCOPE,
    USER_EMAIL_SCOPE,
    GmailAddOnError,
    account_required_card,
    analyze_card,
    addon_is_configured,
    analyze_message,
    auto_sync_event,
    apply_event,
    card_response,
    fetch_current_message,
    home_card,
    preview_card,
    resolve_context,
    success_card,
    verify_google_request,
)
from app.services.oauth import verify_oauth_identity

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/gmail/status", response_model=GmailIntegrationStatusOut)
def gmail_status(user: User = Depends(get_current_user)):
    return GmailIntegrationStatusOut(
        configured=addon_is_configured(),
        connected=bool(user.gmail_email),
        prompt_required=not user.gmail_onboarding_completed,
        email_address=user.gmail_email,
        last_synced_at=None,
    )


@router.post("/gmail/link", response_model=GmailIntegrationStatusOut)
def link_gmail_account(
    body: GmailLinkIn,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    identity = verify_oauth_identity("google", body.id_token)
    conflict = session.exec(
        select(User).where(
            User.id != user.id,
            or_(
                User.email == identity.email,
                User.gmail_email == identity.email,
                User.gmail_subject == identity.subject,
            ),
        )
    ).first()
    if conflict:
        raise HTTPException(status_code=409, detail="This Gmail address is already connected to another KiwiJob account")
    user.gmail_email = identity.email
    user.gmail_subject = identity.subject
    user.gmail_onboarding_completed = True
    session.add(user)
    session.commit()
    return GmailIntegrationStatusOut(
        configured=addon_is_configured(),
        connected=True,
        prompt_required=False,
        email_address=user.gmail_email,
        last_synced_at=None,
    )


@router.delete("/gmail/link", status_code=204)
def unlink_gmail_account(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    user.gmail_email = None
    user.gmail_subject = None
    session.add(user)
    session.commit()


@router.post("/gmail/onboarding-dismiss")
def dismiss_gmail_onboarding(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    user.gmail_onboarding_completed = True
    session.add(user)
    session.commit()
    return {"ok": True}


def _missing_scopes(event: dict[str, Any]) -> list[str]:
    authorized = set(event.get("authorizationEventObject", {}).get("authorizedScopes") or [])
    return [scope for scope in (CURRENT_MESSAGE_SCOPE, USER_EMAIL_SCOPE) if scope not in authorized]


@router.post("/gmail-addon")
def gmail_addon(
    event: dict[str, Any],
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
):
    try:
        verify_google_request(authorization)
    except GmailAddOnError as exc:
        status = 503 if "not configured" in str(exc) else 401
        raise HTTPException(status_code=status, detail=str(exc)) from exc

    if not event.get("gmail"):
        return card_response(home_card())

    missing = _missing_scopes(event)
    if missing:
        return {"requesting_google_scopes": {"scopes": missing}}

    parameters = event.get("commonEventObject", {}).get("parameters") or {}
    is_sync_action = parameters.get("action") == "sync"

    try:
        context = resolve_context(session, event)
    except GmailAddOnError as exc:
        if str(exc) == "NO_KIWIJOB_ACCOUNT":
            return card_response(account_required_card(), update=is_sync_action)
        return card_response({
            "header": {"title": "KiwiJob could not continue"},
            "sections": [{"widgets": [{"textParagraph": {"text": str(exc)}}]}],
        }, update=is_sync_action)

    if parameters.get("action") not in {"analyze", "sync"}:
        return card_response(analyze_card(get_settings().google_workspace_addon_audience))

    try:
        message = fetch_current_message(context)
        email_event = analyze_message(session, context, message)
    except GmailAddOnError as exc:
        return card_response({
            "header": {"title": "Email could not be analyzed"},
            "sections": [{"widgets": [{"textParagraph": {"text": str(exc)}}]}],
        }, update=is_sync_action)

    application = None
    if email_event.application_id:
        application = session.exec(
            select(Application)
            .where(Application.id == email_event.application_id, Application.user_id == context.user.id)
            .options(selectinload(Application.job_post))
        ).first()

    if parameters.get("action") == "analyze":
        synced, created = auto_sync_event(session, context.user, email_event, message)
        if synced:
            session.refresh(synced, attribute_names=["job_post"])
            notification = "Added to KiwiJob tracker" if created else "KiwiJob tracker updated automatically"
            return card_response(success_card(email_event, synced), update=True, notification=notification)

    if is_sync_action:
        applied = apply_event(session, context.user, email_event)
        if not applied:
            return card_response(preview_card(email_event, application, get_settings().google_workspace_addon_audience), update=True)
        session.refresh(applied, attribute_names=["job_post"])
        return card_response(success_card(email_event, applied), update=True, notification="KiwiJob tracker updated")

    return card_response(preview_card(email_event, application, get_settings().google_workspace_addon_audience))
