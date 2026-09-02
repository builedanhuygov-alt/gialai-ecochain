"""Earth Engine status — Sec 4 health check."""
from fastapi import APIRouter
from datetime import datetime

from app.services.earth_engine.auth import gee_auth
from app.core.config import get_settings

router = APIRouter(prefix="/earth-engine", tags=["EarthEngine"])

@router.get("/status")
def status():
    s = get_settings()
    cfg = gee_auth.check_configuration()
    connected = cfg["status"] == "CONNECTED"
    if not s.gee_configured:
        return {"connected": False, "reason": "NOT_CONFIGURED", "project": s.gee_project_id, "last_test": None, "detail": cfg}
    if connected:
        return {"connected": True, "project": s.gee_project_id, "last_test": datetime.utcnow().isoformat(), "detail": cfg}
    return {"connected": False, "reason": cfg["status"], "project": s.gee_project_id, "last_test": datetime.utcnow().isoformat(), "detail": cfg}
