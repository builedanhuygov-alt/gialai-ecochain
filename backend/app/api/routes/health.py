from fastapi import APIRouter
from app.core.config import get_settings
from app.core.demo_mode import tag_data_origin
from app.services.earth_engine.auth import gee_auth
from app.services.scheduler.scheduler import scheduler_service

router = APIRouter()

@router.get("/health")
def health():
    s = get_settings()
    return {
        "app": s.app_name,
        "env": s.app_env,
        "origin": tag_data_origin(),
        "is_demo": s.is_demo,
        "gee": gee_auth.check_configuration(),
        "scheduler": {
            "enabled": s.scheduler_enabled,
            "available": scheduler_service.is_available(),
            "jobs": scheduler_service.list_jobs(),
        },
    }

@router.get("/automation-status")
def automation_status():
    """Section 16 dashboard payload."""
    from app.database import SessionLocal
    from app.models.query_log import AutomationStatus, EEQueryLog

    db = SessionLocal()
    try:
        items = db.query(AutomationStatus).all()
        last_q = db.query(EEQueryLog).order_by(EEQueryLog.created_at.desc()).first()
        return {
            "agents": [{"agent": a.agent_name, "status": a.status, "last_sync_at": str(a.last_sync_at), "next_sync_at": str(a.next_sync_at), "last_error": a.last_error} for a in items] or [
                {"agent": "ForestGuard", "status": "🟢 Online" if not get_settings().is_demo else "🟡 Demo", "last_sync_at": str(last_q.created_at) if last_q else None, "next_sync_at": None, "last_error": last_q.error_message if last_q and last_q.status == "FAILED" else None},
                {"agent": "Earth Engine", "status": gee_auth.status.value, "last_sync_at": str(last_q.created_at) if last_q else None, "next_sync_at": None},
            ],
            "origin": tag_data_origin(),
        }
    finally:
        db.close()

@router.get("/health/geospatial")
def health_geospatial():
    import os
    s=get_settings()
    gee_cfg=gee_auth.check_configuration()
    gee_live= gee_cfg["status"]=="CONNECTED"
    firms_key = s.firms_map_key or os.getenv("FIRMS_MAP_KEY")
    # weather always LIVE (Open-Meteo no key), POWER always LIVE
    return {
        "gee": {"configured": bool(s.gee_configured), "authenticated": gee_live, "status": "LIVE" if gee_live else "CONFIGURATION_REQUIRED", "detail": gee_cfg},
        "sentinel2": {"status": "LIVE" if gee_live else "DEMO DATA", "dataset":"COPERNICUS/S2_SR_HARMONIZED"},
        "sentinel1": {"status": "LIVE" if gee_live else "DEMO DATA", "dataset":"COPERNICUS/S1_GRD"},
        "landsat8": {"status": "LIVE" if gee_live else "DEMO DATA"},
        "landsat9": {"status": "LIVE" if gee_live else "DEMO DATA"},
        "firms": {"configured": bool(firms_key), "status": "LIVE" if firms_key else "CONFIGURATION_REQUIRED", "satellites": ["MODIS","VIIRS"]},
        "weather": {"status": "LIVE", "provider":"Open-Meteo"},
        "nasa_power": {"status": "LIVE", "provider":"NASA POWER"},
        "dem": {"status": "LIVE" if gee_live else "DEMO DATA", "datasets":["SRTM","NASADEM"]},
        "dynamic_world": {"status": "LIVE" if gee_live else "DEMO DATA"},
        "worldcover": {"status": "LIVE" if gee_live else "DEMO DATA"},
        "copernicus": {"status": "LIVE" if (s.copernicus_client_id and s.copernicus_client_secret) else "CONFIGURATION_REQUIRED"},
    }

@router.post("/gee/authenticate")
def gee_authenticate():
    status = gee_auth.authenticate()
    return {"status": status.value, "detail": gee_auth.check_configuration()}
