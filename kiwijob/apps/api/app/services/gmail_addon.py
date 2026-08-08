from __future__ import annotations

import base64
import html
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Any
from urllib.parse import quote

import httpx
import urllib3
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import urllib3 as google_urllib3
from google.oauth2 import id_token
from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.time import utc_now
from app.models import Application, ApplicationEvent, EmailEvent, JobPost, User
from app.services.gmail_sync import classify_status, infer_job_identity, match_application, message_header

CURRENT_MESSAGE_SCOPE = "https://www.googleapis.com/auth/gmail.addons.current.message.action"
EXECUTE_SCOPE = "https://www.googleapis.com/auth/gmail.addons.execute"
USER_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"


def _google_request() -> google_urllib3.Request:
    return google_urllib3.Request(urllib3.PoolManager())


class GmailAddOnError(RuntimeError):
    pass


@dataclass
class AddOnContext:
    user: User
    user_oauth_token: str
    message_token: str
    message_id: str


def addon_is_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.google_workspace_addon_client_id
        and settings.google_workspace_addon_service_account_email
        and settings.google_workspace_addon_audience
    )


def verify_google_request(authorization: str | None) -> None:
    settings = get_settings()
    if not addon_is_configured():
        raise GmailAddOnError("KiwiJob Gmail Add-on is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise GmailAddOnError("Missing Google authorization")
    try:
        payload = id_token.verify_oauth2_token(
            authorization.removeprefix("Bearer ").strip(),
            _google_request(),
            settings.google_workspace_addon_audience,
        )
    except (GoogleAuthError, ValueError) as exc:
        raise GmailAddOnError("Invalid Google Add-on request") from exc
    if not payload.get("email_verified") or payload.get("email") != settings.google_workspace_addon_service_account_email:
        raise GmailAddOnError("Invalid Google Add-on service account")


def _user_email(event: dict[str, Any]) -> str:
    settings = get_settings()
    token = str(event.get("authorizationEventObject", {}).get("userIdToken") or "")
    if not token:
        raise GmailAddOnError("Google did not provide the signed-in email address")
    try:
        payload = id_token.verify_oauth2_token(token, _google_request(), settings.google_workspace_addon_client_id)
    except (GoogleAuthError, ValueError) as exc:
        raise GmailAddOnError("The Google user identity could not be verified") from exc
    email = str(payload.get("email") or "").strip().lower()
    if not email or not payload.get("email_verified"):
        raise GmailAddOnError("The Google account email is not verified")
    return email


def resolve_context(session: Session, event: dict[str, Any]) -> AddOnContext:
    email = _user_email(event)
    user = session.exec(
        select(User).where(
            or_(
                func.lower(User.email) == email,
                func.lower(User.gmail_email) == email,
            )
        )
    ).first()
    if not user:
        raise GmailAddOnError("NO_KIWIJOB_ACCOUNT")
    authorization = event.get("authorizationEventObject", {})
    gmail = event.get("gmail", {})
    user_oauth_token = str(authorization.get("userOAuthToken") or "")
    message_token = str(gmail.get("accessToken") or "")
    message_id = str(gmail.get("messageId") or "")
    if not user_oauth_token or not message_token or not message_id:
        raise GmailAddOnError("Open a Gmail message, then open KiwiJob from the side panel")
    return AddOnContext(user=user, user_oauth_token=user_oauth_token, message_token=message_token, message_id=message_id)


def fetch_current_message(context: AddOnContext) -> dict[str, Any]:
    try:
        response = httpx.get(
            f"{GMAIL_API}/messages/{context.message_id}",
            params={"format": "full"},
            headers={
                "Authorization": f"Bearer {context.user_oauth_token}",
                "X-Goog-Gmail-Access-Token": context.message_token,
            },
            timeout=20,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise GmailAddOnError("Gmail could not read the open message") from exc
    return response.json()


def _decode_body(data: str) -> str:
    if not data:
        return ""
    try:
        return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", errors="replace")
    except (ValueError, TypeError):
        return ""


def _message_text(part: dict[str, Any]) -> str:
    mime_type = str(part.get("mimeType") or "")
    if mime_type == "text/plain":
        return _decode_body(str(part.get("body", {}).get("data") or ""))
    text_parts = [_message_text(child) for child in part.get("parts", [])]
    text = "\n".join(value for value in text_parts if value)
    if text:
        return text
    if mime_type == "text/html":
        raw = _decode_body(str(part.get("body", {}).get("data") or ""))
        return html.unescape(re.sub(r"<[^>]+>", " ", raw))
    return ""


def _received_at(message: dict[str, Any]) -> datetime:
    try:
        return datetime.fromtimestamp(int(message.get("internalDate", "0")) / 1000, tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError):
        return utc_now()


def analyze_message(session: Session, context: AddOnContext, message: dict[str, Any]) -> EmailEvent:
    assert context.user.id is not None
    subject = message_header(message, "Subject")
    from_header = message_header(message, "From")
    sender = parseaddr(from_header)[1] or from_header
    body = _message_text(message.get("payload", {}))
    snippet = str(message.get("snippet") or "")
    analysis_text = " ".join((subject, sender, snippet, body[:12000]))
    status, status_confidence = classify_status(subject, sender, analysis_text)
    application, match_confidence = match_application(session, context.user.id, analysis_text)
    confidence = min(status_confidence, match_confidence) if status and application else status_confidence
    existing = session.exec(
        select(EmailEvent).where(
            EmailEvent.user_id == context.user.id,
            EmailEvent.provider == "gmail_addon",
            EmailEvent.external_id == context.message_id,
        )
    ).first()
    event = existing or EmailEvent(user_id=context.user.id, provider="gmail_addon", external_id=context.message_id)
    event.application_id = application.id if application else None
    event.thread_id = str(message.get("threadId") or "")
    event.sender = sender[:1000]
    event.subject = subject[:1000]
    event.body_preview = snippet[:2000]
    event.received_at = _received_at(message)
    event.parsed_status = status
    event.confidence = confidence
    if event.sync_state != "applied":
        event.sync_state = "pending" if status and application and confidence >= 0.70 else "ignored"
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


def auto_sync_event(
    session: Session,
    user: User,
    event: EmailEvent,
    message: dict[str, Any],
) -> tuple[Application | None, bool]:
    """Apply a reliable match or create a reliable missing tracker row.

    Returns the application and whether a new tracker row was created.
    """
    if event.sync_state == "applied":
        application = apply_event(session, user, event)
        return application, False
    if not event.parsed_status or (event.confidence or 0) < 0.9:
        return None, False
    if event.application_id:
        return apply_event(session, user, event), False

    subject = event.subject
    sender = event.sender
    body = " ".join((str(message.get("snippet") or ""), _message_text(message.get("payload", {}))[:12000]))
    title, company, identity_confidence = infer_job_identity(subject, sender, body)
    if not title or not company or identity_confidence < 0.9:
        return None, False

    assert user.id is not None
    message_url = f"https://mail.google.com/mail/u/0/#all/{quote(event.external_id, safe='')}"
    job = session.exec(select(JobPost).where(JobPost.url == message_url)).first()
    if not job:
        job = JobPost(
            title=title[:500],
            company=company[:500],
            description=f"Created from Gmail status email: {subject}"[:2000],
            url=message_url,
            source_website="gmail",
        )
        session.add(job)
        session.flush()
    assert job.id is not None
    application = session.exec(
        select(Application).where(Application.user_id == user.id, Application.job_post_id == job.id)
    ).first()
    created = application is None
    if not application:
        application = Application(user_id=user.id, job_post_id=job.id, status=event.parsed_status)
        session.add(application)
        session.flush()
    else:
        application.status = event.parsed_status
    application.updated_at = event.received_at or utc_now()
    event.application_id = application.id
    event.sync_state = "applied"
    event.confidence = min(event.confidence or 0, identity_confidence)
    session.add(application)
    session.add(event)
    session.add(ApplicationEvent(
        user_id=user.id,
        application_id=application.id,
        event_type=f"email_{event.parsed_status.lower()}",
        source="gmail_addon",
        status_after=event.parsed_status,
        occurred_at=event.received_at or utc_now(),
        payload={"email_event_id": event.id, "subject": event.subject, "sender": event.sender, "confidence": event.confidence, "auto_created": created},
    ))
    session.commit()
    session.refresh(application)
    application.job_post = job
    return application, created


def apply_event(session: Session, user: User, event: EmailEvent) -> Application | None:
    assert user.id is not None
    if event.sync_state == "applied":
        return session.exec(
            select(Application).where(Application.id == event.application_id, Application.user_id == user.id).options(selectinload(Application.job_post))
        ).first()
    if event.sync_state != "pending" or not event.application_id or not event.parsed_status:
        return None
    application = session.exec(
        select(Application).where(Application.id == event.application_id, Application.user_id == user.id).options(selectinload(Application.job_post))
    ).first()
    if not application:
        return None
    occurred_at = event.received_at or utc_now()
    application.status = event.parsed_status
    application.updated_at = occurred_at
    event.sync_state = "applied"
    session.add(application)
    session.add(event)
    session.add(ApplicationEvent(
        user_id=user.id,
        application_id=application.id,
        event_type=f"email_{event.parsed_status.lower()}",
        source="gmail_addon",
        status_after=event.parsed_status,
        occurred_at=occurred_at,
        payload={"email_event_id": event.id, "subject": event.subject, "sender": event.sender, "confidence": event.confidence},
    ))
    session.commit()
    session.refresh(application)
    return application


def _safe(value: str | None) -> str:
    return html.escape(value or "")


def card_response(card: dict[str, Any], *, update: bool = False, notification: str | None = None) -> dict[str, Any]:
    action: dict[str, Any] = {"navigations": [{"updateCard" if update else "pushCard": card}]}
    if notification:
        action["notification"] = {"text": notification}
    return {"renderActions": {"action": action}} if update else {"action": action}


def home_card() -> dict[str, Any]:
    return {
        "header": {"title": "KiwiJob", "subtitle": "Job application tracker"},
        "sections": [{"widgets": [
            {"textParagraph": {"text": "Open a recruitment email, then open KiwiJob from the Gmail side panel."}},
            {"textParagraph": {"text": "KiwiJob reads only the message you are viewing. Reliable results sync automatically; ambiguous results ask for confirmation."}},
        ]}],
    }


def analyze_card(action_url: str) -> dict[str, Any]:
    return {
        "header": {"title": "Analyze this recruitment email", "subtitle": "Only the open message is accessed"},
        "sections": [{"widgets": [
            {"textParagraph": {"text": "KiwiJob will read this open message only. Reliable results sync automatically; ambiguous results remain a preview for your confirmation."}},
            {"buttonList": {"buttons": [{
                "text": "Analyze this email",
                "color": {"red": 0.36, "green": 0.20, "blue": 0.76},
                "onClick": {"action": {"function": action_url, "parameters": [{"key": "action", "value": "analyze"}]}},
            }]}},
        ]}],
    }


def account_required_card() -> dict[str, Any]:
    settings = get_settings()
    return {
        "header": {"title": "Sign in to KiwiJob"},
        "sections": [{"widgets": [
            {"textParagraph": {"text": "This Gmail address is not linked yet. Sign in to your existing KiwiJob account, then connect Gmail in Settings."}},
            {"buttonList": {"buttons": [{"text": "Connect in KiwiJob", "onClick": {"openLink": {"url": f"{settings.web_app_url.rstrip('/')}/settings#gmail-sync", "openAs": "FULL_SIZE", "onClose": "RELOAD"}}}]}},
        ]}],
    }


def preview_card(event: EmailEvent, application: Application | None, action_url: str) -> dict[str, Any]:
    if not event.parsed_status:
        summary = "This message does not look like a job-status update."
    elif not application or not application.job_post:
        summary = f"Detected status: <b>{_safe(event.parsed_status)}</b><br>No matching company and role were found in your KiwiJob tracker."
    else:
        job = application.job_post
        summary = (
            f"<b>{_safe(job.company or 'Unknown company')} · {_safe(job.title)}</b><br>"
            f"{_safe(application.status)} → <b>{_safe(event.parsed_status)}</b><br>"
            f"Confidence: {round((event.confidence or 0) * 100)}%"
        )
    widgets: list[dict[str, Any]] = [
        {"decoratedText": {"topLabel": "Email", "text": _safe(event.subject) or "(No subject)", "bottomLabel": _safe(event.sender), "wrapText": True}},
        {"textParagraph": {"text": summary}},
    ]
    if event.sync_state == "pending" and application:
        widgets.append({"buttonList": {"buttons": [{
            "text": "Sync status to KiwiJob",
            "color": {"red": 0.12, "green": 0.55, "blue": 0.35},
            "onClick": {"action": {"function": action_url, "parameters": [{"key": "action", "value": "sync"}]}},
        }]}})
    elif event.sync_state == "applied":
        widgets.append({"textParagraph": {"text": "✓ This email has already been synced."}})
    return {"header": {"title": "Review job-status update", "subtitle": "Nothing changes until you confirm"}, "sections": [{"widgets": widgets}]}


def success_card(event: EmailEvent, application: Application) -> dict[str, Any]:
    job = application.job_post
    return {
        "header": {"title": "Tracker updated", "subtitle": "Synced from this Gmail message"},
        "sections": [{"widgets": [{"textParagraph": {"text": f"<b>{_safe(job.company if job else '')} · {_safe(job.title if job else '')}</b><br>Status: <b>{_safe(application.status)}</b>"}}]}],
    }
