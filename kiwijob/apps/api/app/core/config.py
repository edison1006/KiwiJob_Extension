from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # development | staging | production (used for logging / future strict checks)
    environment: str = "development"

    # Default: file SQLite so `uvicorn` works without Docker/local Postgres. Override with Postgres in .env or Docker.
    database_url: str = "sqlite:///./data/kiwijob.db"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    google_oauth_client_id: str | None = None
    apple_oauth_client_id: str | None = None
    jwt_secret_key: str = "change-me-in-production"
    jwt_expires_minutes: int = 60 * 24 * 14
    secure_auth_cookie: bool = False
    resume_storage_dir: str = "./data/resumes"
    # Comma-separated dashboard / API client origins. Keep explicit origins when cookies are enabled.
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174"
    # Regex for dev extension origins. In production, prefer exact chrome-extension://<extension-id> in CORS_ORIGINS.
    cors_origin_regex: str | None = r"chrome-extension://.*"


@lru_cache
def get_settings() -> Settings:
    return Settings()
