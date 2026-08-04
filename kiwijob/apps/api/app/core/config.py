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
    google_oauth_client_id: str | None = None
    apple_oauth_client_id: str | None = None
    jwt_secret_key: str = "change-me-in-production"
    jwt_expires_minutes: int = 60 * 24 * 14
    secure_auth_cookie: bool = False
    resume_storage_dir: str = "./data/resumes"
    resume_s3_bucket: str | None = None
    resume_max_bytes: int = 10 * 1024 * 1024
    rate_limit_enabled: bool = True
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
    if environment != "production":
        return

    errors: list[str] = []
    if settings.jwt_secret_key == "change-me-in-production" or len(settings.jwt_secret_key) < 32:
        errors.append("JWT_SECRET_KEY must be a unique secret of at least 32 characters")
    if not settings.secure_auth_cookie:
        errors.append("SECURE_AUTH_COOKIE must be true")
    if not settings.openai_api_key:
        errors.append("OPENAI_API_KEY must be set so production never returns mock AI results")
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
