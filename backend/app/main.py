"""ECOGL FastAPI — AI-ready Phase 1 addendum."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.database import init_db
from app.services.scheduler.scheduler import scheduler_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    logger.info("DB initialized")
    # seed demo data if empty
    try:
        from app.seed import seed_demo
        seed_demo()
    except Exception as exc:
        logger.warning("Seed skipped: %s", exc)
    # scheduler (graceful if APScheduler missing)
    try:
        scheduler_service.start()
    except Exception as exc:
        logger.warning("Scheduler start failed: %s", exc)
    yield
    # Shutdown
    try:
        scheduler_service.shutdown()
    except Exception:
        pass


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="ECOGL API",
        description="ECOGL 1.0 — Phase 2 Automated Data Intelligence + ForestGuard",
        version="1.0.0-phase2",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.api.routes.health import router as health_router
    from app.api.routes.administrative import router as admin_router
    from app.api.routes.forest_guard import router as fg_router
    from app.api.routes.forest import router as forest_router
    from app.api.routes.earth_engine import router as ee_router

    app.include_router(health_router, prefix="/api", tags=["Health"])
    app.include_router(admin_router, prefix="/api", tags=["Administrative"])
    app.include_router(fg_router, prefix="/api", tags=["ForestGuard"])
    app.include_router(forest_router, prefix="/api", tags=["Forest"])
    app.include_router(ee_router, prefix="/api", tags=["EarthEngine"])

    @app.get("/")
    def root():
        return {
            "name": "ECOGL",
            "version": "1.0.0-phase2",
            "docs": "/docs",
            "health": "/api/health",
            "earth_engine": "/api/earth-engine/status",
            "forest": "/api/forest/areas",
            "demo_mode": s.is_demo,
            "gee_status": "see /api/earth-engine/status",
        }

    return app


app = create_app()
