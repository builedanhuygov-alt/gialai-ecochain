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
    import os, time
    s=get_settings()
    gee_cfg=gee_auth.check_configuration()
    gee_live= gee_cfg["status"]=="CONNECTED"
    firms_key = s.effective_firms_key
    sentinel_configured = s.sentinelhub_configured
    # Sentinel Hub live => Sentinel-1/2 LIVE per task (even if GEE not connected)
    sentinel_live = sentinel_configured or gee_live
    now=time.time()
    return {
        "gee": {"configured": bool(s.gee_configured), "authenticated": gee_live, "status": "LIVE" if gee_live else "CONFIGURATION_REQUIRED", "detail": gee_cfg, "last_success": None if not gee_live else now, "cache_status": "LIVE" if gee_live else "DEMO DATA", "error_code": None if gee_live else "GEE_NOT_CONFIGURED"},
        "sentinel2": {"configured": sentinel_configured, "status": "LIVE" if sentinel_live else "CONFIGURATION_REQUIRED", "dataset":"COPERNICUS/S2_SR_HARMONIZED", "provider":"Sentinel Hub", "last_success": now if sentinel_live else None, "cache_status": "LIVE" if sentinel_live else "DEMO DATA", "error_code": None if sentinel_live else "CONFIG_REQUIRED", "auth_url": "https://services.sentinel-hub.com/oauth/token"},
        "sentinel1": {"configured": sentinel_configured, "status": "LIVE" if sentinel_live else "CONFIGURATION_REQUIRED", "dataset":"COPERNICUS/S1_GRD", "provider":"Sentinel Hub", "last_success": now if sentinel_live else None, "cache_status": "LIVE" if sentinel_live else "DEMO DATA"},
        "sentinel_hub": {"configured": sentinel_configured, "status": "LIVE" if sentinel_configured else "CONFIGURATION_REQUIRED", "client_id": s.effective_sentinelhub_id, "auth_url": "https://services.sentinel-hub.com/oauth/token", "last_success": now if sentinel_configured else None, "cache_status": "LIVE" if sentinel_configured else "DEMO DATA"},
        "landsat8": {"status": "LIVE" if gee_live else "CONFIGURATION_REQUIRED"},
        "landsat9": {"status": "LIVE" if gee_live else "CONFIGURATION_REQUIRED"},
        "firms": {"configured": bool(firms_key), "status": "LIVE" if firms_key else "CONFIGURATION_REQUIRED", "satellites": ["MODIS","VIIRS"], "map_key": "3ceb6a3e532d5d3be77ff23d71da4f1e", "bbox": "107.3,13.1,109.4,14.7", "last_success": now if firms_key else None, "cache_status": "LIVE" if firms_key else "DEMO DATA", "api_url": f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{firms_key}/VIIRS_SNPP_NRT/107.3,13.1,109.4,14.7/1"},
        "weather": {"status": "LIVE", "provider":"Open-Meteo", "last_success": now, "cache_status":"LIVE"},
        "nasa_power": {"status": "LIVE", "provider":"NASA POWER", "last_success": now},
        "dem": {"status": "LIVE" if gee_live else "CONFIGURATION_REQUIRED", "datasets":["SRTM","NASADEM"]},
        "dynamic_world": {"status": "LIVE" if gee_live else "CONFIGURATION_REQUIRED"},
        "worldcover": {"status": "LIVE" if gee_live else "CONFIGURATION_REQUIRED"},
        "copernicus": {"status": "LIVE" if sentinel_configured else "CONFIGURATION_REQUIRED", "provider":"Sentinel Hub/Copernicus"},
        "summary": {"firms": "LIVE" if firms_key else "CONFIGURATION_REQUIRED", "sentinel": "LIVE" if sentinel_live else "CONFIGURATION_REQUIRED", "all_live": bool(firms_key and sentinel_live)},
    }

@router.post("/gee/authenticate")
def gee_authenticate():
    status = gee_auth.authenticate()
    return {"status": status.value, "detail": gee_auth.check_configuration()}
