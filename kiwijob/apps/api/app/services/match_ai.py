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


def _mock_match(cv: str, jd: str) -> dict[str, Any]:
    cv_l = (cv or "").lower()
    jd_l = (jd or "").lower()
    overlap = [w for w in ("python", "react", "typescript", "sql", "aws", "leadership") if w in cv_l and w in jd_l]
    return {
        "score": min(95.0, 55.0 + 5.0 * len(overlap)),
        "matched_skills": overlap[:8] or ["(heuristic) domain overlap"],
        "missing_skills": ["Add more JD keywords explicitly"] if len(overlap) < 3 else [],
        "matched_experience": ["Overlapping responsibilities inferred from shared terms"]
        if overlap
        else [],
        "missing_experience": ["Quantified outcomes tied to JD outcomes"] if len(overlap) < 2 else [],
        "ats_keywords": [w for w in jd_l.split() if len(w) > 8][:12],
        "cv_summary_suggestion": "Summarize impact in 2 lines aligned to the role's top 3 themes.",
        "bullet_point_suggestions": [
            "Rewrite one bullet as: Action + Scope + Metric + Tool.",
            "Mirror the JD's top 5 nouns/phrases verbatim where truthful.",
        ],
        "cover_letter_draft": "Dear Hiring Manager,\n\nI am excited to apply... (mock draft — set OPENAI_API_KEY for a tailored letter.)\n",
        "risk_flags": [] if overlap else ["Low keyword overlap — review tailoring."],
    }


def analyze_cv_vs_jd(cv_text: str, jd_text: str) -> MatchAnalysisOut:
    settings = get_settings()
    if not settings.openai_api_key:
        raw = _mock_match(cv_text, jd_text)
        return MatchAnalysisOut.model_validate(raw)

    client = OpenAI(api_key=settings.openai_api_key)
    system = (
        "You are an expert recruiter and ATS analyst. Compare the CV to the job description. "
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
        return MatchAnalysisOut.model_validate(data)
    except Exception:  # noqa: BLE001
        raw = _mock_match(cv_text, jd_text)
        raw["risk_flags"] = [*raw.get("risk_flags", []), "AI scoring unavailable — using local heuristic fallback."]
        return MatchAnalysisOut.model_validate(raw)
