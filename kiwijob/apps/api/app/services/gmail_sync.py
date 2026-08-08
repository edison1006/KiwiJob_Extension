from __future__ import annotations

import re
from typing import Any

from sqlmodel import Session, select

from app.models import Application, JobPost


STATUS_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Offer", ("pleased to offer", "offer of employment", "employment offer", "letter of offer", "job offer")),
    ("Interview", ("invite you to interview", "invitation to interview", "schedule an interview", "interview availability", "phone interview", "phone screen")),
    ("Assessment", ("online assessment", "complete the assessment", "coding challenge", "technical assessment", "technical test")),
    (
        "Rejected",
        (
            "not moving forward",
            "will not be progressing",
            "unsuccessful application",
            "not been successful",
            "not successful on this occasion",
            "regret to inform",
            "other candidates",
        ),
    ),
    ("Applied", ("thank you for applying", "application received", "received your application", "application has been received")),
)


def _clean_words(value: str | None) -> set[str]:
    if not value:
        return set()
    stop = {"and", "for", "the", "with", "your", "job", "role", "position", "application", "career", "careers"}
    return {word for word in re.findall(r"[a-z0-9]+", value.lower()) if len(word) > 2 and word not in stop}


def _compact(value: str) -> str:
    return "".join(re.findall(r"[a-z0-9]+", value.lower()))


def _company_key(value: str) -> str:
    words = re.findall(r"[a-z0-9]+", value.lower())
    legal_suffixes = {"limited", "ltd", "inc", "incorporated", "llc", "plc"}
    while words and words[-1] in legal_suffixes:
        words.pop()
    return "".join(words)


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


def infer_job_identity(subject: str, sender: str, body: str) -> tuple[str | None, str | None, float]:
    title: str | None = None
    title_patterns = (
        r"(?:application\s+(?:outcome|update|status)|your\s+application)\s*[-–—:]\s*(.{2,120})$",
        r"appl(?:ied|ying)\s+for\s+(?:the\s+)?(?:role|position)\s+of\s+([^\n.,]{2,120})",
        r"application\s+for\s+([^\n.,]{2,120})",
    )
    for pattern in title_patterns:
        match = re.search(pattern, f"{subject}\n{body}", flags=re.IGNORECASE | re.MULTILINE)
        if match:
            title = re.sub(r"\s+", " ", match.group(1)).strip(" -–—:.")
            break

    domain_match = re.search(r"@([a-z0-9.-]+)", sender.lower())
    company: str | None = None
    if domain_match:
        label = domain_match.group(1).split(".")[0]
        if label not in {"gmail", "outlook", "hotmail", "yahoo", "icloud"}:
            words = label.replace("-", " ").replace("_", " ")
            for suffix in ("recruitment", "consulting", "technologies", "technology", "careers", "talent", "group"):
                words = re.sub(rf"(?<=[a-z0-9]){suffix}$", f" {suffix}", words)
                if words.endswith(f" {suffix}"):
                    break
            company = " ".join(word.capitalize() for word in words.split()) or None

    confidence = 0.9 if title and company else 0.0
    return title, company, confidence


def match_application(session: Session, user_id: int, haystack: str) -> tuple[Application | None, float]:
    normalized = haystack.lower()
    compact_haystack = _compact(haystack)
    words = _clean_words(normalized)
    best: tuple[float, Application] | None = None
    applications = session.exec(select(Application).where(Application.user_id == user_id)).all()
    for application in applications:
        job = application.job_post or session.get(JobPost, application.job_post_id)
        if job is None:
            continue
        company = (job.company or "").strip().lower()
        title = job.title.strip().lower()
        company_key = _company_key(company)
        exact_company = bool(
            company
            and (
                company in normalized
                or (len(company_key) >= 5 and company_key in compact_haystack)
            )
        )
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


def message_header(message: dict[str, Any], name: str) -> str:
    for header in message.get("payload", {}).get("headers", []):
        if str(header.get("name") or "").lower() == name.lower():
            return str(header.get("value") or "")
    return ""
