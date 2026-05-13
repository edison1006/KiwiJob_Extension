from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.core.config import get_settings
from app.db.session import get_engine, init_db
from app.deps import ensure_demo_user
from app.routers import analytics, jobs, match, resumes


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(get_engine()) as session:
        ensure_demo_user(session)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="EasyJob API", version="0.1.0", lifespan=lifespan)

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins else ["http://localhost:5173"],
        allow_origin_regex=r"chrome-extension://.*|http://localhost:\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(jobs.router)
    app.include_router(resumes.router)
    app.include_router(match.router)
    app.include_router(analytics.router)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
