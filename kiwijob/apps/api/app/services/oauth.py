from __future__ import annotations

from dataclasses import dataclass

import httpx
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


def social_authorization_url(provider: str, redirect_uri: str, state: str) -> str:
    from urllib.parse import urlencode

    settings = get_settings()
    if provider == "github":
        if not settings.github_oauth_client_id or not settings.github_oauth_client_secret:
            raise HTTPException(status_code=503, detail="GitHub sign-in is not configured")
        query = urlencode(
            {
                "client_id": settings.github_oauth_client_id,
                "redirect_uri": redirect_uri,
                "scope": "read:user user:email",
                "state": state,
            }
        )
        return f"https://github.com/login/oauth/authorize?{query}"
    if provider == "linkedin":
        if not settings.linkedin_oauth_client_id or not settings.linkedin_oauth_client_secret:
            raise HTTPException(status_code=503, detail="LinkedIn sign-in is not configured")
        query = urlencode(
            {
                "response_type": "code",
                "client_id": settings.linkedin_oauth_client_id,
                "redirect_uri": redirect_uri,
                "scope": "openid profile email",
                "state": state,
            }
        )
        return f"https://www.linkedin.com/oauth/v2/authorization?{query}"
    raise HTTPException(status_code=404, detail="Unsupported social sign-in provider")


def exchange_social_code(provider: str, code: str, redirect_uri: str) -> OAuthIdentity:
    settings = get_settings()
    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            if provider == "github":
                token_response = client.post(
                    "https://github.com/login/oauth/access_token",
                    headers={"Accept": "application/json"},
                    data={
                        "client_id": settings.github_oauth_client_id,
                        "client_secret": settings.github_oauth_client_secret,
                        "code": code,
                        "redirect_uri": redirect_uri,
                    },
                )
                token_response.raise_for_status()
                access_token = str(token_response.json().get("access_token") or "")
                if not access_token:
                    raise ValueError("GitHub did not return an access token")
                headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
                profile_response = client.get("https://api.github.com/user", headers=headers)
                profile_response.raise_for_status()
                profile = profile_response.json()
                email = str(profile.get("email") or "").strip().lower()
                if not email:
                    emails_response = client.get("https://api.github.com/user/emails", headers=headers)
                    emails_response.raise_for_status()
                    emails = emails_response.json()
                    preferred = next((item for item in emails if item.get("primary") and item.get("verified")), None)
                    preferred = preferred or next((item for item in emails if item.get("verified")), None)
                    email = str((preferred or {}).get("email") or "").strip().lower()
                subject = str(profile.get("id") or "").strip()
                if not subject or not email:
                    raise ValueError("GitHub account does not expose a verified email")
                return OAuthIdentity(
                    provider="github",
                    subject=subject,
                    email=email,
                    display_name=str(profile.get("name") or profile.get("login") or ""),
                )

            if provider == "linkedin":
                token_response = client.post(
                    "https://www.linkedin.com/oauth/v2/accessToken",
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "client_id": settings.linkedin_oauth_client_id,
                        "client_secret": settings.linkedin_oauth_client_secret,
                        "redirect_uri": redirect_uri,
                    },
                )
                token_response.raise_for_status()
                access_token = str(token_response.json().get("access_token") or "")
                if not access_token:
                    raise ValueError("LinkedIn did not return an access token")
                profile_response = client.get(
                    "https://api.linkedin.com/v2/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                profile_response.raise_for_status()
                profile = profile_response.json()
                email = str(profile.get("email") or "").strip().lower()
                subject = str(profile.get("sub") or "").strip()
                if not subject or not email or profile.get("email_verified") is False:
                    raise ValueError("LinkedIn account does not expose a verified email")
                return OAuthIdentity(
                    provider="linkedin",
                    subject=subject,
                    email=email,
                    display_name=str(profile.get("name") or ""),
                )
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=401, detail=f"{provider.title()} sign-in could not be completed") from exc
    raise HTTPException(status_code=404, detail="Unsupported social sign-in provider")


def _verify_google(token: str) -> OAuthIdentity:
    settings = get_settings()
    if not settings.google_oauth_client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    try:
        import urllib3
        from google.auth.transport import urllib3 as google_urllib3
        from google.oauth2 import id_token
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Google sign-in dependency is not installed") from exc

    try:
        claims = id_token.verify_oauth2_token(
            token,
            google_urllib3.Request(urllib3.PoolManager()),
            settings.google_oauth_client_id,
        )
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
