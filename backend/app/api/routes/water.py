"""Curated water assets (16 real reservoirs/hydro/lakes) + spec scoring."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.water import WATER_STATUS, WATER_TYPES, WaterAsset

router = APIRouter(tags=["Water"])


def _shape(w: WaterAsset) -> dict:
    return {
        "id": w.id, "name": w.name, "asset_type": w.asset_type,
        "longitude": w.longitude, "latitude": w.latitude,
        "commune": w.commune, "district": w.district, "province": w.province,
        "capacity_m3": w.capacity_m3, "water_area_ha": w.water_area_ha,
        "manager": w.manager, "road_access": w.road_access, "status": w.status,
        "google_maps_url": w.google_maps_url, "has_streetview": w.has_streetview,
        "commune_code": w.commune_code, "created_at": str(w.created_at),
    }


@router.get("/water/assets")
def list_water_assets(asset_type: Optional[str] = Query(default=None),
                      status: Optional[str] = Query(default=None),
                      db: Session = Depends(get_db)):
    q = db.query(WaterAsset)
    if asset_type:
        if asset_type not in WATER_TYPES:
            raise HTTPException(400, f"Unknown asset_type (one of {', '.join(WATER_TYPES)})")
        q = q.filter(WaterAsset.asset_type == asset_type)
    if status:
        q = q.filter(WaterAsset.status == status)
    rows = q.order_by(WaterAsset.name).all()
    return {"assets": [_shape(w) for w in rows], "count": len(rows)}


@router.get("/water/nearest")
def nearest_water(lat: float = Query(...), lon: float = Query(...),
                  top: int = Query(default=3, ge=1, le=10),
                  avg_speed_kmh: float = Query(default=30.0, gt=0),
                  wind_direction_deg: float = Query(default=45.0),
                  db: Session = Depends(get_db)):
    """Spec ranking: score 40/30/20/10 → A/B/C + road ETA (1.3 factor)."""
    from app.services import twin_ops as ops
    waters = db.query(WaterAsset).all()
    if not waters:
        return {"ranked": [], "note": "Chưa có dữ liệu hồ chứa — chạy seed."}
    out = ops.score_water_spec(lon, lat, wind_direction_deg, [
        {"id": w.id, "name": w.name, "asset_type": w.asset_type,
         "longitude": w.longitude, "latitude": w.latitude,
         "capacity_m3": w.capacity_m3, "road_access": w.road_access,
         "status": w.status, "manager": w.manager}
        for w in waters])
    for s in out["ranked"]:
        s["eta_minutes"] = ops.road_eta_minutes(s["distance_km"], avg_speed_kmh)
    out["ranked"] = out["ranked"][:top]
    out["eta_assumption"] = f"đường chim bay ×{ops.ROAD_FACTOR} @ {avg_speed_kmh}km/h (chưa có mạng đường + pgRouting)"
    return out
