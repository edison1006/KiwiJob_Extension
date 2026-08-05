from __future__ import annotations

import re
from functools import lru_cache
from urllib.parse import parse_qs, urlsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # development | staging | production (used for logging / future strict checks)
    environment: str = "development"

    # PostgreSQL is the only supported database. Override in .env for hosted environments.
    database_url: str = "postgresql+psycopg2://kiwijob:kiwijob@localhost:5432/kiwijob"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_match_max_output_tokens: int = 2000
    openai_cv_max_output_tokens: int = 5000
    openai_copilot_max_output_tokens: int = 1500
    google_oauth_client_id: str | None = None
    apple_oauth_client_id: str | None = None
    jwt_secret_key: str = "change-me-in-production"
    jwt_expires_minutes: int = 60 * 24 * 14
    secure_auth_cookie: bool = False
    resume_storage_dir: str = "./data/resumes"
    resume_s3_bucket: str | None = None
    resume_max_bytes: int = 10 * 1024 * 1024
    rate_limit_enabled: bool = True
    # Cost guardrails for OpenAI-backed features. These count provider calls, not HTTP requests.
    ai_free_hourly_limit: int = 5
    ai_free_daily_limit: int = 5
    ai_free_monthly_limit: int = 20
    ai_pro_hourly_limit: int = 30
    ai_pro_daily_limit: int = 60
    ai_pro_monthly_limit: int = 500
    ai_premium_hourly_limit: int = 60
    ai_premium_daily_limit: int = 150
    ai_premium_monthly_limit: int = 1500
    # Reserve at most $95/month in-app, leaving a $5 buffer below the $100 account target.
    ai_monthly_budget_cents: int = 9500
    # Comma-separated dashboard / API client origins. Keep explicit origins when cookies are enabled.
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174"
    # Regex for dev extension origins. In production, prefer exact chrome-extension://<extension-id> in CORS_ORIGINS.
    cors_origin_regex: str | None = r"chrome-extension://.*"


def validate_settings(settings: Settings) -> None:
    """Fail fast when a deployment is unsafe or incomplete."""
    environment = settings.environment.strip().lower()
    if environment not in {"development", "staging", "production"}:
        raise RuntimeError("ENVIRONMENT must be development, staging, or production.")
    if settings.resume_max_bytes < 1024 or settings.resume_max_bytes > 25 * 1024 * 1024:
        raise RuntimeError("RESUME_MAX_BYTES must be between 1KB and 25MB.")
    output_limits = {
        "OPENAI_MATCH_MAX_OUTPUT_TOKENS": settings.openai_match_max_output_tokens,
        "OPENAI_CV_MAX_OUTPUT_TOKENS": settings.openai_cv_max_output_tokens,
        "OPENAI_COPILOT_MAX_OUTPUT_TOKENS": settings.openai_copilot_max_output_tokens,
    }
    invalid_output_limits = [name for name, value in output_limits.items() if value < 128 or value > 16_000]
    if invalid_output_limits:
        raise RuntimeError(f"{', '.join(invalid_output_limits)} must be between 128 and 16000.")
    ai_limits = {
        "AI_FREE_HOURLY_LIMIT": settings.ai_free_hourly_limit,
        "AI_FREE_DAILY_LIMIT": settings.ai_free_daily_limit,
        "AI_FREE_MONTHLY_LIMIT": settings.ai_free_monthly_limit,
        "AI_PRO_HOURLY_LIMIT": settings.ai_pro_hourly_limit,
        "AI_PRO_DAILY_LIMIT": settings.ai_pro_daily_limit,
        "AI_PRO_MONTHLY_LIMIT": settings.ai_pro_monthly_limit,
        "AI_PREMIUM_HOURLY_LIMIT": settings.ai_premium_hourly_limit,
        "AI_PREMIUM_DAILY_LIMIT": settings.ai_premium_daily_limit,
        "AI_PREMIUM_MONTHLY_LIMIT": settings.ai_premium_monthly_limit,
        "AI_MONTHLY_BUDGET_CENTS": settings.ai_monthly_budget_cents,
    }
    invalid_ai_limits = [name for name, value in ai_limits.items() if value < 1]
    if invalid_ai_limits:
        raise RuntimeError(f"{', '.join(invalid_ai_limits)} must be at least 1.")
    for tier in ("free", "pro", "premium"):
        hourly = getattr(settings, f"ai_{tier}_hourly_limit")
        daily = getattr(settings, f"ai_{tier}_daily_limit")
        monthly = getattr(settings, f"ai_{tier}_monthly_limit")
        if not hourly <= daily <= monthly:
            raise RuntimeError(f"AI_{tier.upper()} limits must satisfy hourly <= daily <= monthly.")
    if environment != "production":
        return

    errors: list[str] = []
    if settings.jwt_secret_key == "change-me-in-production" or len(settings.jwt_secret_key) < 32:
        errors.append("JWT_SECRET_KEY must be a unique secret of at least 32 characters")
    if not settings.secure_auth_cookie:
        errors.append("SECURE_AUTH_COOKIE must be true")
    if not settings.openai_api_key:
        errors.append("OPENAI_API_KEY must be set so production never returns mock AI results")
    if not settings.openai_model.strip().lower().startswith("gpt-4o-mini"):
        errors.append("OPENAI_MODEL must remain gpt-4o-mini until AI budget reservations are recalculated")
    if not settings.resume_s3_bucket:
        errors.append("RESUME_S3_BUCKET must be set so uploaded CVs use durable storage")
    if not settings.rate_limit_enabled:
        errors.append("RATE_LIMIT_ENABLED must be true")

    cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
    if not cors_origins or "*" in cors_origins:
        errors.append("CORS_ORIGINS must contain explicit production origins")
    invalid_origins = [
        origin
        for origin in cors_origins
        if not (origin.startswith("https://") or origin.startswith("chrome-extension://"))
    ]
    if invalid_origins:
        errors.append("CORS_ORIGINS may only contain https:// or exact chrome-extension:// origins")
    invalid_extension_origins = [
        origin
        for origin in cors_origins
        if origin.startswith("chrome-extension://")
        and not re.fullmatch(r"chrome-extension://[a-p]{32}", origin)
    ]
    if invalid_extension_origins:
        errors.append("Chrome extension CORS origins must contain one exact 32-character extension id")
    if settings.cors_origin_regex and settings.cors_origin_regex.strip():
        errors.append("CORS_ORIGIN_REGEX must be empty; allow only the exact published extension id")

    database_url = urlsplit(settings.database_url.replace("postgresql+psycopg2://", "postgresql://", 1))
    ssl_mode = parse_qs(database_url.query).get("sslmode", [""])[0]
    if ssl_mode not in {"require", "verify-ca", "verify-full"}:
        errors.append("DATABASE_URL must enable TLS with sslmode=require, verify-ca, or verify-full")

    if errors:
        details = "\n- ".join(errors)
        raise RuntimeError(f"Unsafe production configuration:\n- {details}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
