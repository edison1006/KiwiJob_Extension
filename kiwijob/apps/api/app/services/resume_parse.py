from __future__ import annotations

import io
import os
import uuid

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
