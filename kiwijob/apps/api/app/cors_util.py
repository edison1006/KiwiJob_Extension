from __future__ import annotations

import logging

from app.core.config import Settings

logger = logging.getLogger("uvicorn.error")


def parse_cors_allow_origins(settings: Settings) -> list[str]:
    raw = (settings.cors_origins or "").strip()
    if not raw or raw == "*":
        return ["*"]
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return parts if parts else ["*"]


def warn_insecure_cors_if_needed(settings: Settings, allow_origins: list[str]) -> None:
    if settings.environment.lower() == "production" and "*" in allow_origins:
        logger.warning(
            "CORS_ORIGINS is '*' in production. Prefer explicit https:// origins plus each "
            "chrome-extension://<extension-id> origin once the store build is known."
        )
    if settings.environment.lower() == "production" and settings.cors_origin_regex:
        logger.warning(
            "CORS_ORIGIN_REGEX is set in production. Prefer an exact chrome-extension://<extension-id> "
            "origin in CORS_ORIGINS after the Chrome Web Store extension id is known."
        )
