from __future__ import annotations

import base64
import hashlib
import re
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Any
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.time import utc_now
from app.models import Application, EmailConnection, EmailEvent, JobPost, User

GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"

GMAIL_SEARCH_QUERY = (
    'newer_than:180d {'
    'subject:application subject:interview subject:assessment subject:offer '
    'subject:"moving forward" subject:"coding challenge" subject:"phone screen" '
    'from:seek.co.nz from:linkedin.com from:indeed.com from:greenhouse.io from:lever.co'
    '}'
)

STATUS_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "Offer",
        (
            "pleased to offer",
            "offer of employment",
            "employment offer",
            "letter of offer",
            "job offer",
        ),
    ),
    (
        "Interview",
        (
            "invite you to interview",
            "invitation to interview",
            "schedule an interview",
            "interview availability",
            "phone interview",
            "phone screen",
        ),
    ),
    (
        "Assessment",
        (
            "online assessment",
            "complete the assessment",
            "coding challenge",
            "technical assessment",
            "technical test",
        ),
    ),
    (
        "Rejected",
        (
            "not moving forward",
            "will not be progressing",
            "unsuccessful application",
            "regret to inform",
            "other candidates",
        ),
    ),
    (
        "Applied",
        (
            "thank you for applying",
            "application received",
            "received your application",
            "application has been received",
        ),
    ),
)


class GmailSyncError(RuntimeError):
    pass


def gmail_is_configured() -> bool:
    settings = get_settings()
    return bool(settings.google_gmail_client_id and settings.google_gmail_client_secret)


def build_authorization_url(state: str) -> str:
    settings = get_settings()
    if not gmail_is_configured():
        raise GmailSyncError("Gmail sync is not configured")
    return f"{GOOGLE_AUTH_URL}?{urlencode({
        'client_id': settings.google_gmail_client_id,
        'redirect_uri': settings.google_gmail_redirect_uri,
        'response_type': 'code',
        'scope': f'openid email {GMAIL_SCOPE}',
        'access_type': 'offline',
        'include_granted_scopes': 'true',
        'prompt': 'consent',
        'state': state,
    })}"


def exchange_authorization_code(code: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_gmail_client_id,
                "client_secret": settings.google_gmail_client_secret,
                "redirect_uri": settings.google_gmail_redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=20,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise GmailSyncError("Google authorization could not be completed") from exc
    body = response.json()
    if not body.get("refresh_token"):
        raise GmailSyncError("Google did not return an offline refresh token; reconnect Gmail and grant access")
    return body


def _fernet() -> Fernet:
    settings = get_settings()
    secret = settings.gmail_token_encryption_key or settings.jwt_secret_key
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_refresh_token(token: str) -> str:
    return _fernet().encrypt(token.encode("utf-8")).decode("ascii")


def decrypt_refresh_token(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise GmailSyncError("Stored Gmail authorization is invalid; reconnect Gmail") from exc


def _refresh_access_token(connection: EmailConnection) -> str:
    settings = get_settings()
    try:
        response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "refresh_token": decrypt_refresh_token(connection.encrypted_refresh_token),
                "client_id": settings.google_gmail_client_id,
                "client_secret": settings.google_gmail_client_secret,
                "grant_type": "refresh_token",
            },
            timeout=20,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise GmailSyncError("Gmail authorization expired or was revoked; reconnect Gmail") from exc
    access_token = str(response.json().get("access_token") or "")
    if not access_token:
        raise GmailSyncError("Google did not return a Gmail access token")
    return access_token


def _gmail_get(access_token: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        response = httpx.get(
            f"{GMAIL_API}/{path.lstrip('/')}",
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise GmailSyncError("Gmail could not be read right now") from exc
    return response.json()


def gmail_profile(access_token: str) -> dict[str, Any]:
    return _gmail_get(access_token, "profile")


def upsert_connection(session: Session, user: User, token_body: dict[str, Any]) -> EmailConnection:
    assert user.id is not None
    access_token = str(token_body.get("access_token") or "")
    profile = gmail_profile(access_token)
    connection = session.exec(
        select(EmailConnection).where(EmailConnection.user_id == user.id, EmailConnection.provider == "gmail")
    ).first()
    now = utc_now()
    if connection is None:
        connection = EmailConnection(
            user_id=user.id,
            provider="gmail",
            encrypted_refresh_token=encrypt_refresh_token(str(token_body["refresh_token"])),
        )
    else:
        connection.encrypted_refresh_token = encrypt_refresh_token(str(token_body["refresh_token"]))
    connection.email_address = str(profile.get("emailAddress") or user.email)
    connection.history_id = str(profile.get("historyId") or "") or None
    connection.granted_scopes = str(token_body.get("scope") or GMAIL_SCOPE)
    connection.connected_at = now
    connection.updated_at = now
    user.gmail_onboarding_completed = True
    session.add(connection)
    session.add(user)
    session.commit()
    session.refresh(connection)
    return connection


def _header(message: dict[str, Any], name: str) -> str:
    headers = message.get("payload", {}).get("headers", [])
    for header in headers:
        if str(header.get("name") or "").lower() == name.lower():
            return str(header.get("value") or "")
    return ""


def _clean_words(value: str | None) -> set[str]:
    if not value:
        return set()
    stop = {"and", "for", "the", "with", "your", "job", "role", "position", "application", "career", "careers"}
    return {word for word in re.findall(r"[a-z0-9]+", value.lower()) if len(word) > 2 and word not in stop}


def classify_status(subject: str, sender: str, snippet: str) -> tuple[str | None, float]:
    haystack = " ".join((subject, sender, snippet)).lower()
    for status, phrases in STATUS_RULES:
        if any(phrase in haystack for phrase in phrases):
            return status, 0.95
    subject_lower = subject.lower()
    subject_fallbacks = {
        "Offer": ("offer",),
        "Interview": ("interview",),
        "Assessment": ("assessment", "challenge"),
    }
    for status, words in subject_fallbacks.items():
        if any(word in subject_lower for word in words):
            return status, 0.72
    return None, 0.0


def _match_application(session: Session, user_id: int, haystack: str) -> tuple[Application | None, float]:
    normalized = haystack.lower()
    words = _clean_words(normalized)
    best: tuple[float, Application] | None = None
    applications = session.exec(select(Application).where(Application.user_id == user_id)).all()
    for application in applications:
        job = application.job_post or session.get(JobPost, application.job_post_id)
        if job is None:
            continue
        company = (job.company or "").strip().lower()
        title = job.title.strip().lower()
        exact_company = bool(company and company in normalized)
        exact_title = bool(title and title in normalized)
        title_words = _clean_words(title)
        overlap = len(title_words.intersection(words))
        if exact_company and exact_title:
            score = 0.98
        elif exact_company and overlap >= min(2, max(1, len(title_words))):
            score = 0.88
        elif exact_title:
            score = 0.82
        else:
            score = 0.0
        if score and (best is None or score > best[0]):
            application.job_post = job
            best = (score, application)
    return (best[1], best[0]) if best else (None, 0.0)


def _message_received_at(message: dict[str, Any]) -> datetime:
    try:
        return datetime.fromtimestamp(int(message.get("internalDate", "0")) / 1000, tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError):
        return utc_now()


def scan_gmail(session: Session, user: User, connection: EmailConnection) -> list[EmailEvent]:
    assert user.id is not None
    access_token = _refresh_access_token(connection)
    message_ids: list[str] = []
    page_token: str | None = None
    while len(message_ids) < 500:
        params: dict[str, Any] = {"q": GMAIL_SEARCH_QUERY, "maxResults": min(100, 500 - len(message_ids))}
        if page_token:
            params["pageToken"] = page_token
        page = _gmail_get(access_token, "messages", params)
        message_ids.extend(str(item["id"]) for item in page.get("messages", []) if item.get("id"))
        page_token = page.get("nextPageToken")
        if not page_token:
            break

    pending: list[EmailEvent] = []
    for message_id in message_ids:
        existing = session.exec(
            select(EmailEvent).where(
                EmailEvent.user_id == user.id,
                EmailEvent.provider == "gmail",
                EmailEvent.external_id == message_id,
            )
        ).first()
        if existing:
            if existing.sync_state == "pending" and existing.application_id and existing.parsed_status:
                pending.append(existing)
            continue
        message = _gmail_get(access_token, f"messages/{message_id}", {"format": "metadata", "metadataHeaders": ["Subject", "From"]})
        subject = _header(message, "Subject")
        sender = parseaddr(_header(message, "From"))[1] or _header(message, "From")
        snippet = str(message.get("snippet") or "")
        status, status_confidence = classify_status(subject, sender, snippet)
        application, match_confidence = _match_application(session, user.id, " ".join((subject, sender, snippet)))
        confidence = min(status_confidence, match_confidence) if status and application else 0.0
        event = EmailEvent(
            user_id=user.id,
            application_id=application.id if application else None,
            external_id=message_id,
            provider="gmail",
            thread_id=str(message.get("threadId") or ""),
            sender=sender[:1000],
            subject=subject[:1000],
            body_preview=snippet[:2000],
            received_at=_message_received_at(message),
            parsed_status=status,
            confidence=confidence,
            sync_state="pending" if status and application and confidence >= 0.70 else "ignored",
        )
        session.add(event)
        session.flush()
        if event.sync_state == "pending":
            pending.append(event)

    profile = gmail_profile(access_token)
    connection.history_id = str(profile.get("historyId") or "") or connection.history_id
    connection.last_synced_at = utc_now()
    connection.updated_at = utc_now()
    session.add(connection)
    session.commit()
    for event in pending:
        session.refresh(event)
    return pending
