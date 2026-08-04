import pytest

from app.core.config import Settings, validate_settings


def production_settings(**overrides) -> Settings:
    values = {
        "environment": "production",
        "database_url": "postgresql+psycopg2://user:password@db.example.com:5432/kiwijob?sslmode=require",
        "openai_api_key": "test-openai-key",
        "jwt_secret_key": "a-production-secret-that-is-longer-than-32-characters",
        "secure_auth_cookie": True,
        "resume_s3_bucket": "kiwijob-resumes",
        "cors_origins": "https://app.kiwijob.co.nz,chrome-extension://abcdefghijklmnopabcdefghijklmnop",
        "cors_origin_regex": "",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_safe_production_settings_are_accepted() -> None:
    validate_settings(production_settings())


def test_invalid_resume_limit_is_rejected_in_every_environment() -> None:
    with pytest.raises(RuntimeError, match="RESUME_MAX_BYTES"):
        validate_settings(Settings(_env_file=None, environment="development", resume_max_bytes=0))


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"jwt_secret_key": "change-me-in-production"}, "JWT_SECRET_KEY"),
        ({"secure_auth_cookie": False}, "SECURE_AUTH_COOKIE"),
        ({"openai_api_key": None}, "OPENAI_API_KEY"),
        ({"resume_s3_bucket": None}, "RESUME_S3_BUCKET"),
        ({"rate_limit_enabled": False}, "RATE_LIMIT_ENABLED"),
        ({"cors_origins": "*"}, "CORS_ORIGINS"),
        ({"cors_origins": "https://app.kiwijob.co.nz,chrome-extension://.*"}, "exact 32-character"),
        ({"cors_origin_regex": "^chrome-extension://.*$"}, "CORS_ORIGIN_REGEX"),
        (
            {"database_url": "postgresql+psycopg2://user:password@db.example.com:5432/kiwijob"},
            "DATABASE_URL",
        ),
    ],
)
def test_unsafe_production_settings_are_rejected(override: dict, message: str) -> None:
    with pytest.raises(RuntimeError, match=message):
        validate_settings(production_settings(**override))
