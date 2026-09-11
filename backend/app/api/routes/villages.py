from fastapi import APIRouter, Query
from typing import Optional
import time
from app.services.village_fire import get_villages, check_villages_within_20km, VILLAGES

router = APIRouter(tags=["Villages"])

_COMMUNE_DEMO: dict | None = None


def _commune_demographics() -> dict:
    """Module C — population/area per commune from the REAL merged-Gia Lai
    geojson (dan_so + dtich_km2, 134/134 present → VERIFIED). Cached."""
    global _COMMUNE_DEMO
    if _COMMUNE_DEMO is not None:
        return _COMMUNE_DEMO
    import json as _json
    import os as _os
    path = _os.path.join(_os.path.dirname(__file__), "..", "..", "data",
                         "gialai_communes.geojson")
    out: dict = {}
    try:
        with open(path, encoding="utf-8") as f:
            fc = _json.load(f)
        for feat in fc.get("features", []):
            p = feat.get("properties", {}) or {}
            code = f"GL-{p.get('ma_xa')}"
            try:
                pop = int(str(p.get("dan_so") or "").replace(".", "").replace(",", "").strip())
            except Exception:
                pop = None
            try:
                area = float(str(p.get("dtich_km2") or "").strip())
            except Exception:
                area = None
            out[code] = {"population": pop, "area_km2": area, "name": p.get("ten_xa")}
    except Exception:
        pass
    _COMMUNE_DEMO = out
    return out

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


@router.get("/communities/threatened")
def threatened_communities(lat: float = Query(...), lon: float = Query(...),
                           wind_speed_kmh: float = Query(default=15.0, ge=0),
                           wind_direction_deg: float = Query(default=45.0),
                           slope_deg: float = Query(default=12.0, ge=0)):
    """Module C — commune/village threat layer from spread 1h/3h/6h.

    Band = earliest intersecting step (1h→CRITICAL, 3h→THREATENED, 6h→WATCH,
    else SAFE). Population/area VERIFIED (geojson dan_so); villages are the
    20 reference-sample points → ESTIMATED, never presented as a census.
    No probabilities anywhere.
    """
    from app.services import spread as spread_svc
    from app.services import twin_ops as ops
    sim = spread_svc.simulate(lon, lat, float(wind_speed_kmh),
                              float(wind_direction_deg), float(slope_deg),
                              [1.0, 3.0, 6.0])
    communes = spread_svc.load_commune_shapes()
    demo = _commune_demographics()
    first_hour: dict = {}
    per_step = []
    for s in sim["steps"]:
        aff = spread_svc.affected_communes(s["polygon"]["coordinates"][0], communes)
        per_step.append({"hour": s["hour"],
                         "communes": [c.get("name") for c in aff]})
        for c in aff:
            code = c.get("code")
            if code and code not in first_hour:
                first_hour[code] = s["hour"]
    threatened = []
    for code, hour in sorted(first_hour.items(), key=lambda kv: kv[1]):
        d = demo.get(code, {})
        threatened.append({
            "code": code,
            "commune": d.get("name"),
            "village": None,  # commune-level band; villages listed separately
            "population": d.get("population"),
            "population_status": "VERIFIED" if d.get("population") is not None else "MISSING",
            "area_km2": d.get("area_km2"),
            "first_hour": hour,
            "band": ops.community_band(hour),
        })
    aff_codes = set(first_hour)
    villages = [{**v, "population_status": "ESTIMATED", "band": ops.community_band(
        first_hour.get(v.get("code")))}
        for v in VILLAGES if v.get("code") in aff_codes]
    summary = {b: sum(1 for t in threatened if t["band"] == b)
               for b in ("CRITICAL", "THREATENED", "WATCH", "SAFE")}
    return {
        "fire": {"lon": lon, "lat": lat},
        "spread_model": spread_svc.MODEL,
        "communes": threatened,
        "n_communes": len(threatened),
        "villages": villages,
        "villages_note": "20 reference-sample points (ESTIMATED) — not a village census",
        "summary": summary,
        "band_rule": "earliest intersecting spread step: 1h→CRITICAL, 3h→THREATENED, 6h→WATCH",
    }
