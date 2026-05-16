from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.cors_util import parse_cors_allow_origins, warn_insecure_cors_if_needed
from app.db.session import init_db
from app.routers import analytics, auth, copilot, events, jobs, match, profile, resumes


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="KiwiJob API", version="0.1.0", lifespan=lifespan)

    allow_origins = parse_cors_allow_origins(settings)
    warn_insecure_cors_if_needed(settings, allow_origins)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(profile.router)
    app.include_router(copilot.router)
    app.include_router(jobs.router)
    app.include_router(events.router)
    app.include_router(resumes.router)
    app.include_router(match.router)
    app.include_router(analytics.router)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
