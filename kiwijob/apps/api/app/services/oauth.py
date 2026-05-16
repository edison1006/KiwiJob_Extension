from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from app.core.config import get_settings


@dataclass(frozen=True)
class OAuthIdentity:
    provider: str
    subject: str
    email: str
    display_name: str = ""


def verify_oauth_identity(provider: str, token: str) -> OAuthIdentity:
    if provider == "google":
        return _verify_google(token)
    if provider == "apple":
        return _verify_apple(token)
    raise HTTPException(status_code=400, detail="Unsupported OAuth provider")


def _verify_google(token: str) -> OAuthIdentity:
    settings = get_settings()
    if not settings.google_oauth_client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    try:
        from google.auth.transport import requests
        from google.oauth2 import id_token
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Google sign-in dependency is not installed") from exc

    try:
        claims = id_token.verify_oauth2_token(token, requests.Request(), settings.google_oauth_client_id)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Google sign-in token") from exc

    if claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Invalid Google token issuer")
    email = str(claims.get("email") or "").strip().lower()
    subject = str(claims.get("sub") or "").strip()
    if not email or not subject:
        raise HTTPException(status_code=401, detail="Google token missing account identity")
    return OAuthIdentity(provider="google", subject=subject, email=email, display_name=str(claims.get("name") or ""))


def _verify_apple(token: str) -> OAuthIdentity:
    settings = get_settings()
    if not settings.apple_oauth_client_id:
        raise HTTPException(status_code=503, detail="Apple sign-in is not configured")
    try:
        import jwt
        from jwt import PyJWKClient
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Apple sign-in dependency is not installed") from exc

    try:
        jwks = PyJWKClient("https://appleid.apple.com/auth/keys")
        signing_key = jwks.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.apple_oauth_client_id,
            issuer="https://appleid.apple.com",
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Apple sign-in token") from exc

    email = str(claims.get("email") or "").strip().lower()
    subject = str(claims.get("sub") or "").strip()
    if not email or not subject:
        raise HTTPException(status_code=401, detail="Apple token missing account identity")
    return OAuthIdentity(provider="apple", subject=subject, email=email)
