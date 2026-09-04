from fastapi import APIRouter, Query
from typing import Optional
import time
from app.services.village_fire import get_villages, check_villages_within_20km, VILLAGES

router = APIRouter(tags=["Villages"])

@router.get("/villages")
def list_villages(commune: Optional[str] = Query(default=None)):
    if commune:
        return [v for v in VILLAGES if v["commune"]==commune]
    return VILLAGES

@router.get("/villages/fire-alert")
async def villages_fire_alert():
    from app.services.firms_service import fetch_firms_gialai
    data = await fetch_firms_gialai(day_range=1)
    fires = data.get("fires", [])
    alerts = check_villages_within_20km(fires)
    return {
        "status": data.get("status"),
        "source": "NASA FIRMS + Village delineation",
        "timestamp": time.time(),
        "villages_total": len(VILLAGES),
        "fires": len(fires),
        "alerts": alerts,
        "alert_count": len(alerts),
        "radius_km": 20,
        "bbox": "107.3,13.1,109.4,14.7",
    }

@router.get("/villages/communes")
def list_communes():
    communes = {}
    for v in VILLAGES:
        communes.setdefault(v["commune"], []).append(v["village"])
    return communes
