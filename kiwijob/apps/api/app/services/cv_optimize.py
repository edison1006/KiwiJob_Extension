from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas import CvOptimizationSuggestionOut
from app.services.match_ai import analyze_cv_vs_jd


def _fallback(cv: str, jd: str) -> tuple[float, list[CvOptimizationSuggestionOut], str]:
    match = analyze_cv_vs_jd(cv, jd)
    suggestions: list[CvOptimizationSuggestionOut] = []
    if match.cv_summary_suggestion:
        suggestions.append(
            CvOptimizationSuggestionOut(
                id="summary-1",
                section="Professional Summary",
                original="",
                suggested=match.cv_summary_suggestion,
                reason="Align the opening summary with the role's explicit requirements.",
            )
        )
    for index, bullet in enumerate(match.bullet_point_suggestions):
        suggestions.append(
            CvOptimizationSuggestionOut(
                id=f"experience-{index + 1}",
                section="Experience",
                original="",
                suggested=bullet,
                reason="Make existing evidence easier for recruiters and ATS systems to identify.",
            )
        )
    if match.ats_keywords:
        suggestions.append(
            CvOptimizationSuggestionOut(
                id="skills-1",
                section="Skills",
                original="",
                suggested=", ".join(match.ats_keywords),
                reason="Use only the listed JD keywords that are truthful for your background.",
            )
        )
    optimized = cv.strip()
    if suggestions:
        optimized += "\n\nTARGETED IMPROVEMENTS\n" + "\n".join(
            f"{item.section}: {item.suggested}" for item in suggestions
        )
    return float(match.score), suggestions, optimized


def optimize_cv(cv: str, jd: str) -> tuple[float, list[CvOptimizationSuggestionOut], str]:
    settings = get_settings()
    if not settings.openai_api_key:
        return _fallback(cv, jd)

    system = """You optimize CVs for one job description. Never invent or imply facts, skills,
employers, projects, qualifications, metrics, dates, or seniority not evidenced in the CV.
Return JSON with match_score (0-100), suggestions, and optimized_text.
Each suggestion must have id, section, original, suggested, reason, accepted=true.
Only rewrite existing evidence. If a JD requirement is not evidenced, explain the gap instead
of adding it to optimized_text. Preserve contact details, employers, dates, education, and meaning.
optimized_text must be a complete, clean, plain-text CV ready for DOCX export."""
    user = f"CV:\n{cv[:18000]}\n\nJOB DESCRIPTION:\n{jd[:14000]}"
    try:
        response = OpenAI(api_key=settings.openai_api_key).chat.completions.create(
            model=settings.openai_model,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.15,
        )
        raw: dict[str, Any] = json.loads(response.choices[0].message.content or "{}")
        suggestions = [
            CvOptimizationSuggestionOut.model_validate({**item, "accepted": item.get("accepted", True)})
            for item in raw.get("suggestions", [])
        ]
        text = str(raw.get("optimized_text") or "").strip()
        if not text:
            raise ValueError("AI returned empty optimized CV")
        return float(raw.get("match_score", 0)), suggestions, text
    except Exception:  # noqa: BLE001
        return _fallback(cv, jd)
