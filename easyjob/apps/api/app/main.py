from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

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
    app = FastAPI(title="EasyJob API", version="0.1.0", lifespan=lifespan)

    # MVP: permissive CORS so the web app (5173) and MV3 extension (chrome-extension://) can call the API
    # without cookie credentials on requests (fetch defaults are fine).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
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
