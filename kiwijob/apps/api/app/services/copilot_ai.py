from __future__ import annotations

import json
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas import (
    CopilotAnswerOut,
    CopilotAutofillFieldIn,
    CopilotAutofillPlanOut,
    CopilotCoverLetterOut,
    CopilotFieldAnswerOut,
)


def _clean(s: object, limit: int = 12000) -> str:
    return str(s or "").strip()[:limit]


def _profile_get(profile: dict[str, Any], key: str) -> str:
    return _clean(profile.get(key), 4000)


def _question_blob(question: str, field_label: str = "", field_type: str = "") -> str:
    return " ".join([question, field_label, field_type]).lower()


def _openai_client() -> OpenAI | None:
    key = get_settings().openai_api_key
    if not key or not str(key).strip():
        return None
    return OpenAI(api_key=key)


def _fallback_answer(question: str, profile: dict[str, Any], field_label: str = "", field_type: str = "") -> CopilotAnswerOut:
    q = _question_blob(question, field_label, field_type)
    used: list[str] = []

    def use(key: str) -> str:
        used.append(key)
        return _profile_get(profile, key)

    answer = ""
    confidence = 0.55
    if re.search(r"email|e-mail", q):
        answer = use("email")
        confidence = 0.95
    elif re.search(r"phone|mobile|cell", q):
        answer = use("phone")
        confidence = 0.95
    elif re.search(r"linkedin|linked-in", q):
        answer = use("linkedInUrl")
        confidence = 0.95
    elif "github" in q:
        answer = use("githubUrl")
        confidence = 0.95
    elif re.search(r"portfolio|website|personal url", q):
        answer = use("portfolioUrl") or use("githubUrl")
        confidence = 0.9
    elif re.search(r"salary|compensation|pay|rate", q):
        answer = use("salaryExpectation")
        confidence = 0.85
    elif re.search(r"sponsor|sponsorship|visa", q):
        answer = use("sponsorship")
        confidence = 0.85
    elif re.search(r"authori[sz]ed|right to work|eligible to work|work permit", q):
        answer = use("workAuthorization")
        confidence = 0.85
    elif re.search(r"notice|start date|available|availability", q):
        answer = use("noticePeriod")
        confidence = 0.8
    elif re.search(r"skill|technology|stack|tool|framework|language", q):
        answer = use("skills")
        confidence = 0.75
    elif re.search(r"cover letter|why.*role|why.*company|motivation|additional information", q):
        answer = use("coverLetter") or use("summary")
        confidence = 0.7
    elif re.search(r"summary|bio|about you|profile", q):
        answer = use("summary")
        confidence = 0.75

    warnings = [] if answer else ["No matching profile field found. Add more data under Settings > Application profile."]
    return CopilotAnswerOut(
        answer=answer,
        source="fallback",
        confidence=confidence if answer else 0.2,
        used_profile_fields=sorted(set(used)),
        warnings=warnings,
    )


def _job_context(job: dict[str, Any] | None) -> str:
    if not job:
        return ""
    return "\n".join(
        [
            f"Title: {_clean(job.get('title'), 500)}",
            f"Company: {_clean(job.get('company'), 500)}",
            f"Location: {_clean(job.get('location'), 500)}",
            f"Salary: {_clean(job.get('salary'), 500)}",
            f"Description: {_clean(job.get('description'), 12000)}",
        ]
    ).strip()


def _profile_context(profile: dict[str, Any]) -> str:
    safe = {
        k: _clean(v, 3000)
        for k, v in profile.items()
        if k
        in {
            "fullName",
            "email",
            "phone",
            "linkedInUrl",
            "portfolioUrl",
            "githubUrl",
            "city",
            "country",
            "workAuthorization",
            "sponsorship",
            "salaryExpectation",
            "noticePeriod",
            "skills",
            "summary",
            "coverLetter",
        }
    }
    return json.dumps(safe, ensure_ascii=False)


def answer_question(
    *,
    question: str,
    profile: dict[str, Any],
    job: dict[str, Any] | None = None,
    field_label: str = "",
    field_type: str = "",
) -> CopilotAnswerOut:
    fallback = _fallback_answer(question, profile, field_label, field_type)
    client = _openai_client()
    if client is None:
        return fallback

    system = (
        "You are KiwiJob Copilot for job applications. Answer one application form question truthfully using only the applicant profile "
        "and job context. Never invent credentials, work authorization, salary, dates, degrees, or experience. Return JSON with keys: "
        "answer (string), confidence (0-1), used_profile_fields (array), warnings (array)."
    )
    user = {
        "question": question,
        "field_label": field_label,
        "field_type": field_type,
        "applicant_profile": json.loads(_profile_context(profile) or "{}"),
        "job_context": _job_context(job),
        "fallback_answer": fallback.answer,
    }
    try:
        resp = client.chat.completions.create(
            model=get_settings().openai_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
            ],
            temperature=0.2,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        return CopilotAnswerOut(
            answer=_clean(data.get("answer"), 8000),
            source="ai",
            confidence=float(data.get("confidence", 0.7)),
            used_profile_fields=[str(x) for x in data.get("used_profile_fields", []) if str(x).strip()],
            warnings=[str(x) for x in data.get("warnings", []) if str(x).strip()],
        )
    except Exception as e:  # noqa: BLE001
        fallback.warnings.append(f"AI unavailable, used fallback answer. ({type(e).__name__})")
        return fallback


def build_autofill_plan(
    *,
    fields: list[CopilotAutofillFieldIn],
    profile: dict[str, Any],
    job: dict[str, Any] | None = None,
) -> CopilotAutofillPlanOut:
    answers: list[CopilotFieldAnswerOut] = []
    warnings: list[str] = []
    for field in fields[:80]:
        if field.current_value.strip():
            continue
        result = answer_question(
            question=field.label or field.key,
            field_label=field.label,
            field_type=field.field_type,
            profile=profile,
            job=job,
        )
        if result.answer:
            answers.append(
                CopilotFieldAnswerOut(
                    key=field.key,
                    answer=result.answer,
                    source=result.source,
                    confidence=result.confidence,
                )
            )
        warnings.extend(result.warnings)
    return CopilotAutofillPlanOut(answers=answers, warnings=sorted(set(warnings)))


def generate_cover_letter(
    *,
    profile: dict[str, Any],
    job: dict[str, Any] | None = None,
    tone: str = "concise and professional",
    extra_instructions: str = "",
) -> CopilotCoverLetterOut:
    client = _openai_client()
    base = _profile_get(profile, "coverLetter") or _profile_get(profile, "summary")
    job_title = _clean((job or {}).get("title"), 200) or "this role"
    company = _clean((job or {}).get("company"), 200) or "your team"
    fallback = (
        f"Dear Hiring Manager,\n\nI am excited to apply for {job_title} at {company}. "
        f"{base or 'My background aligns with the role requirements, and I would welcome the opportunity to discuss how I can contribute.'}\n\n"
        "Kind regards"
    )
    if client is None:
        return CopilotCoverLetterOut(
            cover_letter=fallback,
            source="fallback",
            warnings=["Set OPENAI_API_KEY for a tailored cover letter."],
        )

    system = (
        "Write a truthful, concise job application cover letter. Use only the provided applicant profile and job context. "
        "Do not invent experience. Return JSON with keys: cover_letter (string), warnings (array)."
    )
    user = {
        "tone": tone,
        "extra_instructions": extra_instructions,
        "applicant_profile": json.loads(_profile_context(profile) or "{}"),
        "job_context": _job_context(job),
    }
    try:
        resp = client.chat.completions.create(
            model=get_settings().openai_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
            ],
            temperature=0.35,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        return CopilotCoverLetterOut(
            cover_letter=_clean(data.get("cover_letter"), 20000) or fallback,
            source="ai",
            warnings=[str(x) for x in data.get("warnings", []) if str(x).strip()],
        )
    except Exception as e:  # noqa: BLE001
        return CopilotCoverLetterOut(
            cover_letter=fallback,
            source="fallback",
            warnings=[f"AI unavailable, used fallback letter. ({type(e).__name__})"],
        )
