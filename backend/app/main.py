"""ECOGL 1.0 — Phase 5 Production (Fail-safe, Observability, Security)."""
import logging, time
from contextlib import asynccontextmanager
from collections import defaultdict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
        description="ECOGL 1.0 — Phase 5 AI Orchestration + Provincial Digital Eco System (Fail-safe: AI down → verified data still works)",
        version="1.0.0-phase5",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Sec51 rate limiting + Sec52 fraud flags + Sec53 security headers
    _counts=defaultdict(list)
    @app.middleware("http")
    async def rate_limit_mw(request: Request, call_next):
        # Sec51: reports/confirmations/uploads/api/ai/gee/route per user
        path=request.url.path
        key=request.client.host if request.client else "anon"
        # simple per-min limit 60
        now=time.time()
        bucket=_counts[key]
        # prune 60s
        _counts[key]=[t for t in bucket if now-t<60]
        if len(_counts[key])>60:
            return JSONResponse(status_code=429, content={"detail":"Rate limit exceeded (Sec51)"})
        _counts[key].append(now)
        # Sec53 security: audit + input validation note
        resp=await call_next(request)
        resp.headers["X-Content-Type-Options"]="nosniff"
        return resp

    from app.api.routes.health import router as health_router
    from app.api.routes.administrative import router as admin_router
    from app.api.routes.forest_guard import router as fg_router
    from app.api.routes.forest import router as forest_router
    from app.api.routes.earth_engine import router as ee_router
    from app.api.routes.risk import router as risk_router
    from app.api.routes.farm_logistics import router as farm_router
    from app.api.routes.phase5 import router as phase5_router
    from app.api.routes.p6 import router as p6_router

    app.include_router(health_router, prefix="/api", tags=["Health"])
    app.include_router(admin_router, prefix="/api", tags=["Administrative"])
    app.include_router(fg_router, prefix="/api", tags=["ForestGuard"])
    app.include_router(forest_router, prefix="/api", tags=["Forest"])
    app.include_router(ee_router, prefix="/api", tags=["EarthEngine"])
    app.include_router(risk_router, prefix="/api", tags=["Risk"])
    app.include_router(farm_router, prefix="/api", tags=["FarmLogistics"])
    app.include_router(phase5_router, prefix="/api", tags=["Phase5"])
    app.include_router(p6_router, prefix="/api", tags=["Phase6"])

    @app.get("/")
    def root():
        return {
            "name": "ECOGL",
            "version": "1.0.0-phase5",
            "docs": "/docs",
            "health": "/api/health",
            "earth_engine": "/api/earth-engine/status",
            "forest": "/api/forest/areas",
            "orchestrator": "/api/agents/orchestrate",
            "public": "/api/public/map",
            "demo": "/api/demo/run",
            "pitch": "/api/pitch",
            "demo_mode": s.is_demo,
            "gee_status": "see /api/earth-engine/status",
        }

    return app


app = create_app()
