from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from contextlib import suppress
import json
import logging
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlmodel import Session

from app.core.config import get_settings, validate_settings
from app.cors_util import parse_cors_allow_origins, warn_insecure_cors_if_needed
from app.db.session import get_engine, init_db
from app.routers import analytics, auth, copilot, cv_optimizations, events, forum, integrations, jobs, match, profile, resumes
from app.services.rate_limit import cleanup_rate_limits
from app.services.career_sources import sync_due_career_sources

logger = logging.getLogger("kiwijob.api")


async def _career_sync_loop() -> None:
    settings = get_settings()
    while True:
        try:
            with Session(get_engine()) as session:
                summaries = await sync_due_career_sources(
                    session,
                    limit=settings.career_sync_batch_size,
                    concurrency=settings.career_sync_concurrency,
                )
            if summaries:
                logger.info(
                    json.dumps(
                        {
                            "event": "career_sync_complete",
                            "sources": len(summaries),
                            "failed": sum(1 for summary in summaries if summary.error),
                            "created": sum(summary.created for summary in summaries),
                            "updated": sum(summary.updated for summary in summaries),
                            "deactivated": sum(summary.deactivated for summary in summaries),
                        }
                    )
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Career source synchronization cycle failed")
        await asyncio.sleep(settings.career_sync_interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with Session(get_engine()) as session:
        cleanup_rate_limits(session)
    sync_task = asyncio.create_task(_career_sync_loop()) if get_settings().career_sync_enabled else None
    try:
        yield
    finally:
        if sync_task:
            sync_task.cancel()
            with suppress(asyncio.CancelledError):
                await sync_task


def create_app() -> FastAPI:
    settings = get_settings()
    validate_settings(settings)
    app = FastAPI(title="KiwiJob API", version="0.1.0", lifespan=lifespan)

    @app.middleware("http")
    async def log_request(request: Request, call_next):
        request_id = uuid4().hex
        started = perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                json.dumps(
                    {
                        "event": "request_complete",
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "status": 500,
                        "duration_ms": round((perf_counter() - started) * 1000, 1),
                    }
                )
            )
            raise
        response.headers["X-Request-ID"] = request_id
        logger.info(
            json.dumps(
                {
                    "event": "request_complete",
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": round((perf_counter() - started) * 1000, 1),
                }
            )
        )
        return response

    allow_origins = parse_cors_allow_origins(settings)
    warn_insecure_cors_if_needed(settings, allow_origins)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(profile.router)
    app.include_router(copilot.router)
    app.include_router(cv_optimizations.router)
    app.include_router(forum.router)
    app.include_router(jobs.router)
    app.include_router(events.router)
    app.include_router(integrations.router)
    app.include_router(resumes.router)
    app.include_router(match.router)
    app.include_router(analytics.router)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/ready")
    def ready():
        try:
            with get_engine().connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Database is unavailable") from exc
        return {"status": "ready", "checks": {"database": "ok"}}

    @app.get("/")
    def root():
        return {"status": "ok", "service": "KiwiJob API"}

    return app


app = create_app()
