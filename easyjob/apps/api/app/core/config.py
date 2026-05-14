from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Default: file SQLite so `uvicorn` works without Docker/local Postgres. Override with Postgres in .env or Docker.
    database_url: str = "sqlite:///./data/easyjob.db"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    mock_user_id: int = 1
    resume_storage_dir: str = "./data/resumes"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
