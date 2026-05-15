from __future__ import annotations

import io
import os
import re
import uuid
from datetime import datetime
from typing import Any

from docx import Document
from pypdf import PdfReader

from app.core.config import get_settings


def extract_text_from_pdf(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        t = page.extract_text() or ""
        parts.append(t)
    return "\n".join(parts).strip()


def extract_text_from_docx(data: bytes) -> str:
    doc = Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text).strip()


def extract_cv_text(filename: str, data: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return extract_text_from_pdf(data)
    if lower.endswith(".docx"):
        return extract_text_from_docx(data)
    raise ValueError("Unsupported file type. Use PDF or DOCX.")


def store_resume_file(user_id: int, filename: str, data: bytes) -> str:
    base = get_settings().resume_storage_dir
    os.makedirs(base, exist_ok=True)
    ext = os.path.splitext(filename)[1] or ".bin"
    safe_name = f"{user_id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(base, safe_name)
    with open(path, "wb") as f:
        f.write(data)
    return path


SKILL_KEYWORDS = [
    "Python",
    "Pandas",
    "NumPy",
    "SQL",
    "Postgres",
    "PostgreSQL",
    "Power BI",
    "Tableau",
    "Matplotlib",
    "AWS",
    "Microsoft Azure",
    "Azure",
    "REST APIs",
    "REST API",
    "Git",
    "RAG",
    "React",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "FastAPI",
    "Docker",
    "Excel",
    "Financial analysis",
]

LANGUAGE_KEYWORDS = ["English", "Mandarin", "Chinese", "Cantonese", "Spanish", "French", "Japanese", "Korean"]


def _lines(text: str) -> list[str]:
    return [line.strip(" \t•-–—") for line in text.splitlines() if line.strip(" \t•-–—")]


def _section(lines: list[str], names: set[str]) -> list[str]:
    start = -1
    headings = {
        "education",
        "experience",
        "work experience",
        "employment",
        "uploads",
        "links",
        "skills",
        "languages",
        "projects",
        "certifications",
        "summary",
    }
    for i, line in enumerate(lines):
        if line.lower().strip(":") in names:
            start = i + 1
            break
    if start < 0:
        return []
    out: list[str] = []
    for line in lines[start:]:
        if line.lower().strip(":") in headings:
            break
        out.append(line)
    return out


def _initials(name: str, email: str) -> str:
    source = name or email.split("@")[0]
    parts = re.findall(r"[A-Za-z]+", source)
    if not parts:
        return "KJ"
    return "".join(part[0].upper() for part in parts[:2])


def _guess_name(lines: list[str], email: str) -> str:
    bad = {"resume", "cv", "curriculum vitae", "profile", "education", "experience", "skills"}
    for line in lines[:8]:
        clean = re.sub(r"\s+", " ", line).strip()
        if not clean or clean.lower() in bad or "@" in clean or re.search(r"https?://|\d{3,}", clean):
            continue
        words = clean.split()
        if 1 < len(words) <= 4 and all(re.match(r"^[A-Za-z][A-Za-z.'-]*$", w) for w in words):
            return clean
    if email:
        return email.split("@")[0].replace(".", " ").replace("_", " ").title()
    return ""


def _extract_education(lines: list[str]) -> list[dict[str, str]]:
    sec = _section(lines, {"education"})
    if not sec:
        return []
    out: list[dict[str, str]] = []
    school_markers = re.compile(r"\b(university|college|institute|school|polytechnic)\b", re.I)
    degree_markers = re.compile(r"\b(bachelor|master|phd|doctor|diploma|certificate|degree|b\.|m\.)\b", re.I)
    for i, line in enumerate(sec):
        if not school_markers.search(line):
            continue
        degree = ""
        years = ""
        for nxt in sec[i + 1 : i + 4]:
            if not degree and degree_markers.search(nxt):
                degree = nxt
            if not years:
                m = re.search(r"(?:19|20)\d{2}\s*(?:-|–|to)?\s*(?:(?:19|20)\d{2}|present|current)?", nxt, re.I)
                if m:
                    years = m.group(0).strip()
        out.append({"school": line, "degree": degree, "years": years})
        if len(out) >= 5:
            break
    return out


def _extract_experience(lines: list[str]) -> list[dict[str, str]]:
    sec = _section(lines, {"experience", "work experience", "employment"})
    if not sec or re.search(r"no experience provided", " ".join(sec), re.I):
        return []
    out: list[dict[str, str]] = []
    for i, line in enumerate(sec):
        years = ""
        m = re.search(r"(?:19|20)\d{2}\s*(?:-|–|to)\s*(?:(?:19|20)\d{2}|present|current)", line, re.I)
        if m:
            years = m.group(0)
        if years or re.search(r"\b(engineer|analyst|developer|manager|assistant|consultant|specialist|intern)\b", line, re.I):
            company = sec[i + 1] if i + 1 < len(sec) and not re.search(r"^\d|(?:19|20)\d{2}", sec[i + 1]) else ""
            out.append({"title": line, "company": company, "years": years})
        if len(out) >= 5:
            break
    return out


def _extract_keywords(text: str, keywords: list[str]) -> list[str]:
    found: list[str] = []
    for keyword in keywords:
        pattern = rf"(?<![A-Za-z0-9+#]){re.escape(keyword)}(?![A-Za-z0-9+#])"
        if re.search(pattern, text, re.I):
            label = "Postgres" if keyword == "PostgreSQL" else "REST APIs" if keyword == "REST API" else keyword
            if label not in found:
                found.append(label)
    return found


def parse_cv_profile(resume_id: int, filename: str, created_at: datetime, text: str) -> dict[str, Any]:
    lines = _lines(text or "")
    email = (re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", text or "") or [""])[0]
    phone = (re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", text or "") or [""])[0].strip()
    name = _guess_name(lines, email)
    links = sorted(set(re.findall(r"https?://[^\s)>\]]+", text or "")))[:8]
    return {
        "full_name": name,
        "initials": _initials(name, email),
        "email": email,
        "phone": phone,
        "education": _extract_education(lines),
        "experience": _extract_experience(lines),
        "skills": _extract_keywords(text or "", SKILL_KEYWORDS)[:20],
        "languages": _extract_keywords(text or "", LANGUAGE_KEYWORDS)[:8],
        "links": links,
        "upload": {"id": resume_id, "filename": filename, "created_at": created_at},
    }
