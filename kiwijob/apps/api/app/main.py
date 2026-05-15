from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.core.config import get_settings
from app.cors_util import parse_cors_allow_origins, warn_insecure_cors_if_needed
from app.db.session import get_engine, init_db
from app.deps import ensure_demo_user
from app.routers import analytics, copilot, events, jobs, match, profile, resumes


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(get_engine()) as session:
        ensure_demo_user(session)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="KiwiJob API", version="0.1.0", lifespan=lifespan)

    allow_origins = parse_cors_allow_origins(settings)
    warn_insecure_cors_if_needed(settings, allow_origins)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
