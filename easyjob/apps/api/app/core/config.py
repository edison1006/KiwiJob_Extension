from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # development | staging | production (used for logging / future strict checks)
    environment: str = "development"

    # Default: file SQLite so `uvicorn` works without Docker/local Postgres. Override with Postgres in .env or Docker.
    database_url: str = "sqlite:///./data/easyjob.db"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    mock_user_id: int = 1
    resume_storage_dir: str = "./data/resumes"
    # Comma-separated browser origins, or * (default: dev-friendly for web + MV3 extension chrome-extension://).
    cors_origins: str = "*"


@lru_cache
def get_settings() -> Settings:
    return Settings()
