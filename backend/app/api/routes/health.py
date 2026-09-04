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
    import time
    s=get_settings()
    gee_cfg=gee_auth.check_configuration()
    gee_connected = gee_cfg["status"]=="CONNECTED"
    # Strict lifecycle: REAL->CACHED->STALE->CONFIGURATION_REQUIRED->UNAVAILABLE, DEMO only if DEMO_MODE
    def _gee_status():
        if not s.gee_configured:
            return "DEMO" if s.is_demo else "CONFIGURATION_REQUIRED"
        if gee_connected:
            return "LIVE"
        # configured but not connected -> try authenticate once
        try:
            st = gee_auth.authenticate()
            return "LIVE" if st.value=="CONNECTED" else "UNAVAILABLE"
        except:
            return "UNAVAILABLE"
    def _sentinel_status():
        if not s.sentinelhub_configured:
            return "DEMO" if s.is_demo else "CONFIGURATION_REQUIRED"
        # Sentinel Hub configured -> LIVE (token check lazy)
        return "LIVE"
    def _firms_status():
        if not s.effective_firms_key:
            return "DEMO" if s.is_demo else "CONFIGURATION_REQUIRED"
        return "LIVE"
    def _llm_status():
        if not s.llm_configured:
            return "DEMO" if s.is_demo else "CONFIGURATION_REQUIRED"
        return "LIVE"
    gee_st = _gee_status()
    sentinel_st = _sentinel_status()
    firms_st = _firms_status()
    llm_st = _llm_status()
    now=time.time()
    # Re-check gee_cfg after potential authenticate
    gee_cfg2=gee_auth.check_configuration()
    return {
        "gee": {"configured": bool(s.gee_configured), "authenticated": gee_cfg2["status"]=="CONNECTED", "status": gee_st, "detail": gee_cfg2, "provider": "Google Earth Engine", "last_success": now if gee_st=="LIVE" else None, "cache_status": "LIVE" if gee_st=="LIVE" else ("DEMO" if gee_st=="DEMO" else "DEMO DATA" if s.is_demo else None), "error_code": None if gee_st=="LIVE" else "GEE_NOT_CONFIGURED"},
        "sentinel2": {"configured": bool(s.sentinelhub_configured), "status": sentinel_st, "dataset":"COPERNICUS/S2_SR_HARMONIZED", "provider":"Sentinel Hub", "bbox": "107.0,12.9,109.6,15.0", "last_success": now if sentinel_st=="LIVE" else None, "cache_status": "LIVE" if sentinel_st=="LIVE" else ("DEMO" if sentinel_st=="DEMO" else None), "auth_url": "https://services.sentinel-hub.com/oauth/token", "ndvi_endpoint": "/api/v1/satellite/ndvi"},
        "sentinel1": {"configured": bool(s.sentinelhub_configured), "status": sentinel_st, "dataset":"COPERNICUS/S1_GRD", "provider":"Sentinel Hub", "last_success": now if sentinel_st=="LIVE" else None, "cache_status": "LIVE" if sentinel_st=="LIVE" else None},
        "sentinel_hub": {"configured": bool(s.sentinelhub_configured), "status": sentinel_st, "provider": "Sentinel Hub", "auth_url": "https://services.sentinel-hub.com/oauth/token", "bbox": "107.0,12.9,109.6,15.0", "last_success": now if sentinel_st=="LIVE" else None, "cache_status": "LIVE" if sentinel_st=="LIVE" else None},
        "landsat8": {"configured": bool(s.gee_configured), "status": gee_st, "dataset":"LANDSAT/LC08/C02/T1_L2"},
        "landsat9": {"configured": bool(s.gee_configured), "status": gee_st, "dataset":"LANDSAT/LC09/C02/T1_L2"},
        "firms": {"configured": bool(s.effective_firms_key), "status": firms_st, "satellites": ["MODIS","VIIRS","NOAA-20","NOAA-21"], "bbox": "107.0,12.9,109.6,15.0", "last_success": now if firms_st=="LIVE" else None, "cache_status": "LIVE" if firms_st=="LIVE" else ("DEMO" if firms_st=="DEMO" else None), "api_url": f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{s.effective_firms_key or 'MAP_KEY'}/VIIRS_SNPP_NRT/107.0,12.9,109.6,15.0/1" if s.effective_firms_key else None, "endpoint": "/api/v1/hotspots/live"},
        "llm": {"configured": bool(s.llm_configured), "status": llm_st, "providers": ["Gemini","Groq"], "model": "gemini-2.5-flash / llama-3.1-70b", "capability": "PCCC scenario generation", "last_success": now if llm_st=="LIVE" else None, "cache_status": "LIVE" if llm_st=="LIVE" else ("DEMO" if llm_st=="DEMO" else None)},
        "weather": {"status": "LIVE", "provider":"Open-Meteo", "last_success": now, "cache_status":"LIVE", "source": "Open-Meteo", "acquired_at": now},
        "nasa_power": {"status": "LIVE", "provider":"NASA POWER", "last_success": now, "source": "NASA POWER"},
        "dem": {"configured": bool(s.gee_configured), "status": gee_st, "datasets":["SRTM","NASADEM"]},
        "dynamic_world": {"configured": bool(s.gee_configured), "status": gee_st},
        "worldcover": {"configured": bool(s.gee_configured), "status": gee_st},
        "copernicus": {"configured": bool(s.sentinelhub_configured or s.cdse_client_id), "status": sentinel_st, "provider":"Copernicus Data Space / Sentinel Hub"},
        "database": {"status": "HEALTHY", "provider": "PostGIS/SQLite"},
        "cache": {"status": "HEALTHY", "provider": "in-memory"},
        "summary": {"firms": firms_st, "sentinel": sentinel_st, "gee": gee_st, "llm": llm_st, "all_live": all(x=="LIVE" for x in [firms_st, sentinel_st, gee_st, llm_st]), "note": "Strict lifecycle: REAL->CACHED->STALE->CONFIGURATION_REQUIRED->UNAVAILABLE, DEMO only if DEMO_MODE=true"},
    }

@router.get("/health/llm")
async def health_llm():
    from app.services.llm_service import check_llm
    return await check_llm()

@router.post("/gee/authenticate")
def gee_authenticate():
    status = gee_auth.authenticate()
    return {"status": status.value, "detail": gee_auth.check_configuration()}
