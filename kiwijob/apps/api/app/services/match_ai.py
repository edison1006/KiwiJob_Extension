from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas import MatchAnalysisOut

MATCH_SCHEMA_HINT = """
Return a single JSON object with keys:
score (number 0-100),
matched_skills (string array),
missing_skills (string array),
matched_experience (string array),
missing_experience (string array),
ats_keywords (string array),
cv_summary_suggestion (string),
bullet_point_suggestions (string array),
cover_letter_draft (string),
risk_flags (string array).
"""

JD_MATCHING_POLICY = """
Use the job description as the only source of matching criteria.
- Extract requirements, skills, responsibilities, seniority signals, domain terms, and keywords only from the JD.
- `matched_skills` and `matched_experience` must include only JD-mentioned items that are evidenced in the CV.
- `missing_skills` and `missing_experience` must include only JD-mentioned items that are absent or weak in the CV.
- Do not reward, penalize, or mention CV strengths that the JD does not ask for.
- Visa, citizenship, residency, sponsorship, and right-to-work checks must appear only when the JD explicitly mentions them.
  If the JD does not mention work authorization, do not include visa/work-rights in any matched or missing output.
- `ats_keywords` must come from the JD, not from the CV.
- The score should reflect coverage of JD requirements, not general candidate quality.
"""

JD_SKILL_PATTERNS = (
    "python",
    "react",
    "typescript",
    "javascript",
    "sql",
    "power bi",
    "tableau",
    "excel",
    "aws",
    "azure",
    "gcp",
    "machine learning",
    "data analysis",
    "data analytics",
    "reporting",
    "stakeholder",
    "leadership",
    "communication",
    "manufacturing",
    "process improvement",
    "project management",
    "agile",
    "api",
    "fastapi",
    "postgres",
    "docker",
)

VISA_REQUIREMENT_PATTERNS = (
    "right to work",
    "work rights",
    "work authorisation",
    "work authorization",
    "valid visa",
    "visa",
    "sponsorship",
    "sponsor",
    "citizen",
    "citizenship",
    "resident",
    "permanent resident",
    "nz resident",
    "new zealand resident",
)

CV_VISA_STATUS_PATTERNS = (
    "right to work",
    "work rights",
    "work authorisation",
    "work authorization",
    "valid visa",
    "work visa",
    "open work visa",
    "resident visa",
    "permanent resident",
    "nz resident",
    "new zealand resident",
    "citizen",
    "no sponsorship",
    "do not require sponsorship",
    "authorized to work",
    "authorised to work",
)

VISA_OUTPUT_PATTERNS = (*VISA_REQUIREMENT_PATTERNS, *CV_VISA_STATUS_PATTERNS, "work authorization")


def _contains(haystack: str, needle: str) -> bool:
    return needle.lower() in haystack


def _jd_required_terms(jd_l: str) -> list[str]:
    terms = [term for term in JD_SKILL_PATTERNS if _contains(jd_l, term)]
    if _jd_mentions_visa_requirement(jd_l):
        terms.append("work authorization")
    seen: set[str] = set()
    out: list[str] = []
    for term in terms:
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(term)
    return out


def _jd_mentions_visa_requirement(jd_l: str) -> bool:
    return any(term in jd_l for term in VISA_REQUIREMENT_PATTERNS)


def _cv_has_visa_status(cv_l: str) -> bool:
    return any(term in cv_l for term in CV_VISA_STATUS_PATTERNS)


def _looks_like_visa_item(value: str) -> bool:
    value_l = value.lower()
    return any(term in value_l for term in VISA_OUTPUT_PATTERNS)


def _strip_visa_items(items: list[str]) -> list[str]:
    return [item for item in items if not _looks_like_visa_item(item)]


def _apply_visa_policy(raw: dict[str, Any], cv: str, jd: str) -> dict[str, Any]:
    jd_l = (jd or "").lower()
    cv_l = (cv or "").lower()
    jd_mentions_visa = _jd_mentions_visa_requirement(jd_l)

    for key in ("matched_skills", "missing_skills", "ats_keywords", "risk_flags"):
        items = raw.get(key)
        if isinstance(items, list):
            raw[key] = _strip_visa_items([str(item) for item in items])

    if not jd_mentions_visa:
        return raw

    target = "matched_skills" if _cv_has_visa_status(cv_l) else "missing_skills"
    raw.setdefault(target, [])
    if "work authorization" not in raw[target]:
        raw[target].append("work authorization")

    raw.setdefault("ats_keywords", [])
    if "work authorization" not in raw["ats_keywords"]:
        raw["ats_keywords"].append("work authorization")

    if target == "missing_skills":
        raw.setdefault("risk_flags", [])
        raw["risk_flags"].append("CV is missing JD-mentioned work authorization status.")

    return raw


def _jd_keywords(jd_l: str) -> list[str]:
    words = [
        w.strip(".,:;()[]{}")
        for w in jd_l.split()
        if len(w.strip(".,:;()[]{}")) > 7
    ]
    keywords: list[str] = []
    for w in words:
        if w not in keywords:
            keywords.append(w)
    for term in _jd_required_terms(jd_l):
        if term not in keywords:
            keywords.append(term)
    return keywords[:12]


def _mock_match(cv: str, jd: str) -> dict[str, Any]:
    cv_l = (cv or "").lower()
    jd_l = (jd or "").lower()
    required = _jd_required_terms(jd_l)
    matched = [
        term
        for term in required
        if (_cv_has_visa_status(cv_l) if term == "work authorization" else _contains(cv_l, term))
    ]
    missing = [term for term in required if term not in matched]
    coverage = (len(matched) / len(required)) if required else 0.0
    score = 50.0 + 45.0 * coverage if required else 60.0
    return {
        "score": round(min(95.0, score), 1),
        "matched_skills": matched[:8],
        "missing_skills": missing[:8],
        "matched_experience": ["Overlapping responsibilities inferred from shared terms"]
        if matched
        else [],
        "missing_experience": ["Add evidence for JD responsibilities: " + ", ".join(missing[:4])] if missing else [],
        "ats_keywords": _jd_keywords(jd_l),
        "cv_summary_suggestion": "Summarize impact around the JD's explicit requirements only.",
        "bullet_point_suggestions": [
            "Rewrite one bullet for each important JD requirement: Action + Scope + Metric + Tool.",
            "Mirror only JD terms that are truthful for your experience.",
        ],
        "cover_letter_draft": "Dear Hiring Manager,\n\nI am excited to apply... (mock draft — set OPENAI_API_KEY for a tailored letter.)\n",
        "risk_flags": [] if not missing else ["CV is missing JD-mentioned items: " + ", ".join(missing[:5])],
    }


def analyze_cv_vs_jd(cv_text: str, jd_text: str) -> MatchAnalysisOut:
    settings = get_settings()
    if not settings.openai_api_key:
        raw = _mock_match(cv_text, jd_text)
        raw = _apply_visa_policy(raw, cv_text, jd_text)
        return MatchAnalysisOut.model_validate(raw)

    client = OpenAI(api_key=settings.openai_api_key)
    system = (
        "You are an expert recruiter and ATS analyst. Compare the CV to the job description. "
        + JD_MATCHING_POLICY
        + MATCH_SCHEMA_HINT
    )
    user = f"CV:\n{cv_text[:12000]}\n\n---\n\nJOB DESCRIPTION:\n{jd_text[:12000]}"

    try:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )
        content = resp.choices[0].message.content or "{}"
        data = json.loads(content)
        data = _apply_visa_policy(data, cv_text, jd_text)
        return MatchAnalysisOut.model_validate(data)
    except Exception:  # noqa: BLE001
        raw = _mock_match(cv_text, jd_text)
        raw = _apply_visa_policy(raw, cv_text, jd_text)
        raw["risk_flags"] = [*raw.get("risk_flags", []), "AI scoring unavailable — using local heuristic fallback."]
        return MatchAnalysisOut.model_validate(raw)
