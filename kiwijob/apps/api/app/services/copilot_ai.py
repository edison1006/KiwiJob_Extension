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


_COVER_LETTER_SKILLS = (
    "Python",
    "SQL",
    "AWS",
    "Azure",
    "Google Cloud",
    "Power BI",
    "Tableau",
    "Excel",
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "Java",
    "C#",
    "Docker",
    "Kubernetes",
    "Terraform",
    "ETL",
    "data modelling",
    "data analysis",
    "machine learning",
    "APIs",
    "Git",
    "Agile",
)


def _mentioned_skills(text: str, *, limit: int = 8) -> list[str]:
    lowered = text.lower()
    found: list[str] = []
    for skill in _COVER_LETTER_SKILLS:
        if re.search(rf"(?<![a-z0-9]){re.escape(skill.lower())}(?![a-z0-9])", lowered):
            found.append(skill)
    return found[:limit]


def _natural_list(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def _resume_candidate_name(profile: dict[str, Any], resume_text: str) -> str:
    profile_name = _profile_get(profile, "fullName")
    if profile_name:
        return profile_name
    first_line = next((line.strip() for line in resume_text.splitlines() if line.strip()), "")
    if (
        2 <= len(first_line.split()) <= 5
        and len(first_line) <= 80
        and re.fullmatch(r"[A-Za-z][A-Za-z .'-]+", first_line)
        and not re.search(r"\b(?:resume|curriculum|vitae|cv)\b", first_line, re.I)
    ):
        return first_line
    return ""


def _fallback_cover_letter(*, profile: dict[str, Any], job: dict[str, Any] | None, resume_text: str) -> str:
    job_data = job or {}
    job_title = _clean(job_data.get("title"), 200) or "this role"
    company = _clean(job_data.get("company"), 200) or "your organisation"
    location = _clean(job_data.get("location"), 200)
    summary = _profile_get(profile, "coverLetter") or _profile_get(profile, "summary")
    applicant_skills = _mentioned_skills(f"{_profile_get(profile, 'skills')}\n{resume_text}")
    job_skills = _mentioned_skills(_clean(job_data.get("description"), 12000))
    shared_skills = [skill for skill in job_skills if skill in applicant_skills]
    evidence_skills = shared_skills or applicant_skills
    role_focus = job_skills[:5]
    name = _resume_candidate_name(profile, resume_text)

    opening_location = f" in {location}" if location else ""
    opening = (
        f"I am writing to express my interest in the {job_title} position at {company}{opening_location}. "
        "After reviewing the opportunity, I am drawn to the chance to apply my background in a role that values thoughtful "
        "problem solving, dependable delivery, and effective collaboration."
    )

    evidence_parts: list[str] = []
    if summary:
        evidence_parts.append(summary.rstrip(". ") + ".")
    if evidence_skills:
        evidence_parts.append(
            f"My CV also reflects practical capability across {_natural_list(evidence_skills)}. "
            "I focus on using these skills purposefully: understanding the problem, working carefully with the available information, "
            "and turning it into an outcome that is clear, useful, and maintainable."
        )
    else:
        evidence_parts.append(
            "My application materials outline the experience and transferable capabilities I would bring to the position. "
            "Across my work and study, I have developed a structured approach to learning new requirements, communicating clearly, "
            "and following work through from initial analysis to a practical result."
        )
    evidence = " ".join(evidence_parts)

    if role_focus:
        fit = (
            f"The role's focus on {_natural_list(role_focus)} is particularly appealing to me. "
            "I would approach these responsibilities with curiosity, attention to detail, and a willingness to work closely with both "
            "technical and non-technical colleagues. I also understand the importance of documenting decisions, responding constructively "
            "to feedback, and continuing to improve the quality of what I deliver."
        )
    else:
        fit = (
            f"What interests me most about joining {company} is the opportunity to contribute in a practical way while continuing to grow. "
            "I would bring curiosity, attention to detail, and a collaborative mindset, along with a willingness to learn the team's tools, "
            "priorities, and ways of working quickly."
        )

    motivation = (
        f"I would value the opportunity to contribute to {company}, learn from the people around me, and take ownership of work that supports "
        "the wider team. I value asking clear questions at the outset, keeping stakeholders informed as work develops, and checking that the "
        "final result addresses the real need rather than only the immediate task. I am also comfortable receiving feedback and using it to "
        "strengthen both the work itself and the way I approach future challenges. "
        f"I am confident that my existing foundation, combined with my motivation to keep learning, would allow me to make a positive contribution "
        f"in the {job_title} role."
    )
    closing = (
        "Thank you for considering my application. I would welcome the opportunity to discuss the position, the priorities for the successful "
        "candidate, and how my experience could support your team."
    )
    signoff = f"Kind regards,\n{name}" if name else "Kind regards"
    return f"Dear Hiring Manager,\n\n{opening}\n\n{evidence}\n\n{fit}\n\n{motivation}\n\n{closing}\n\n{signoff}"


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
            max_tokens=get_settings().openai_copilot_max_output_tokens,
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
    resume_text: str = "",
    tone: str = "concise and professional",
    extra_instructions: str = "",
) -> CopilotCoverLetterOut:
    client = _openai_client()
    fallback = _fallback_cover_letter(profile=profile, job=job, resume_text=resume_text)
    if client is None:
        return CopilotCoverLetterOut(
            cover_letter=fallback,
            source="fallback",
            warnings=["AI generation is temporarily unavailable. This complete draft was created from your saved job, CV, and profile."],
        )

    system = (
        "Write a truthful, polished job application cover letter of 300 to 450 words in 5 to 7 short paragraphs. "
        "Tailor it to the role and company, connect specific CV evidence to job requirements, explain motivation, and close with a clear expression "
        "of interest. Use only the provided applicant profile, resume, and job context. Never invent experience, qualifications, metrics, employers, "
        "or responsibilities. Avoid generic filler and repeated claims. Return JSON with keys: cover_letter (string), warnings (array)."
    )
    user = {
        "tone": tone,
        "extra_instructions": extra_instructions,
        "applicant_profile": json.loads(_profile_context(profile) or "{}"),
        "resume": _clean(resume_text, 16000),
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
            max_tokens=get_settings().openai_copilot_max_output_tokens,
            temperature=0.35,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        return CopilotCoverLetterOut(
            cover_letter=_clean(data.get("cover_letter"), 20000) or fallback,
            source="ai",
            warnings=[str(x) for x in data.get("warnings", []) if str(x).strip()],
        )
    except Exception:  # noqa: BLE001
        return CopilotCoverLetterOut(
            cover_letter=fallback,
            source="fallback",
            warnings=["AI generation is temporarily unavailable. This complete draft was created from your saved job, CV, and profile."],
        )
