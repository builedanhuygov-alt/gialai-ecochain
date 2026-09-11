"""Curated water assets (16 real reservoirs/hydro/lakes) + spec scoring."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import get_current_user
from app.models.water import WATER_STATUS, WATER_TYPES, WaterAsset

router = APIRouter(tags=["Water"])


def _shape(w: WaterAsset, nearby_photos: int = 0) -> dict:
    from app.services import twin_ops as ops
    return {
        "id": w.id, "name": w.name, "asset_type": w.asset_type,
        "longitude": w.longitude, "latitude": w.latitude,
        "commune": w.commune, "district": w.district, "province": w.province,
        "capacity_m3": w.capacity_m3, "water_area_ha": w.water_area_ha,
        "manager": w.manager, "road_access": w.road_access, "status": w.status,
        "google_maps_url": w.google_maps_url, "has_streetview": w.has_streetview,
        "commune_code": w.commune_code,
        # Module D — NULL until surveyed
        "contact_person": getattr(w, "contact_person", None),
        "contact_phone": getattr(w, "contact_phone", None),
        "verification_date": (str(getattr(w, "verification_date", None))
                              if getattr(w, "verification_date", None) else None),
        "source": getattr(w, "source", None),
        # Module 360 (M1) — capture metadata, NULL until real media exists
        "preview_image_url": getattr(w, "preview_image_url", None),
        "capture_date": (str(getattr(w, "capture_date", None))
                         if getattr(w, "capture_date", None) else None),
        "capture_source": getattr(w, "capture_source", None),
        "gps_status": "VERIFIED",
        # Module 360 — chain computed, never stored
        "viewer": ops.viewer_fallback(w.has_streetview, w.google_maps_url,
                                      nearby_photos, w.longitude, w.latitude,
                                      getattr(w, "capture_date", None),
                                      getattr(w, "capture_source", None)),
        "created_at": str(w.created_at),
    }


def _photo_counts(db: Session, points: list) -> dict:
    try:
        from app.models.community import PhotoEvidence
        photos = db.query(PhotoEvidence).filter(
            PhotoEvidence.location_lat.isnot(None),
            PhotoEvidence.location_lng.isnot(None)).all()
    except Exception:
        return {}
    from app.services.twin_ops import haversine_km
    out = {}
    for key, lon, lat in points:
        n = 0
        for p in photos:
            try:
                if haversine_km(lon, lat, p.location_lng, p.location_lat) <= 1.0:
                    n += 1
            except Exception:
                continue
        out[key] = n
    return out


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
    counts = _photo_counts(db, [(w.id, w.longitude, w.latitude) for w in rows])
    return {"assets": [_shape(w, counts.get(w.id, 0)) for w in rows], "count": len(rows)}


@router.patch("/water/assets/{water_id}/contact")
def patch_water_contact(water_id: str, body: dict, db: Session = Depends(get_db),
                        user=Depends(get_current_user)):
    """Module D — fill water contact gaps (any logged-in ranger)."""
    w = db.get(WaterAsset, water_id)
    if not w:
        raise HTTPException(404, "Water asset not found")
    if "contact_person" in body:
        v = body["contact_person"]
        w.contact_person = (str(v).strip()[:255] or None) if v not in (None, "") else None
    if "contact_phone" in body:
        v = body["contact_phone"]
        w.contact_phone = (str(v).strip()[:50] or None) if v not in (None, "") else None
    if "source" in body:
        v = body["source"]
        w.source = (str(v).strip()[:255] or None) if v not in (None, "") else None
    if "verification_date" in body:
        raw = body["verification_date"]
        if raw in (None, ""):
            w.verification_date = None
        else:
            try:
                from datetime import datetime as _dt
                w.verification_date = _dt.strptime(str(raw).strip()[:10], "%Y-%m-%d")
            except Exception:
                raise HTTPException(400, "verification_date must be YYYY-MM-DD")
    db.commit()
    db.refresh(w)
    return _shape(w)


@router.patch("/water/assets/{water_id}/viewer")
def patch_water_viewer(water_id: str, body: dict, db: Session = Depends(get_db),
                       user=Depends(get_current_user)):
    """Module 360 (M5) — fill viewer metadata gaps (any logged-in ranger)."""
    w = db.get(WaterAsset, water_id)
    if not w:
        raise HTTPException(404, "Water asset not found")
    if "preview_image_url" in body:
        pu = body["preview_image_url"]
        pu = str(pu or "").strip()[:500] or None
        if pu and not (pu.startswith("http://") or pu.startswith("https://")):
            raise HTTPException(400, "preview_image_url must be http(s)")
        w.preview_image_url = pu
    if "capture_date" in body:
        raw = body["capture_date"]
        if raw in (None, ""):
            w.capture_date = None
        else:
            try:
                from datetime import datetime as _dt
                w.capture_date = _dt.strptime(str(raw).strip()[:10], "%Y-%m-%d")
            except Exception:
                raise HTTPException(400, "capture_date must be YYYY-MM-DD")
    if "capture_source" in body:
        v = body["capture_source"]
        w.capture_source = (str(v).strip()[:255] or None) if v not in (None, "") else None
    db.commit()
    db.refresh(w)
    return _shape(w)


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


@router.get("/water/threatened")
def threatened_water(lat: float = Query(...), lon: float = Query(...),
                     wind_speed_kmh: float = Query(default=15.0, ge=0),
                     wind_direction_deg: float = Query(default=45.0),
                     slope_deg: float = Query(default=12.0, ge=0),
                     db: Session = Depends(get_db)):
    """Threatened Water Assets: spread 1h/3h/6h ∩ water_assets.

    Band per asset = more severe of (polygon containment, ETA thresholds):
    CRITICAL (<1h), THREATENED (<3h), WATCH (<6h), else SAFE.
    Powers Command Center protection priority (which reservoirs need guarding).
    """
    from app.services import spread as spread_svc
    from app.services import twin_ops as ops
    sim = spread_svc.simulate(lon, lat, float(wind_speed_kmh),
                              float(wind_direction_deg), float(slope_deg),
                              [1.0, 3.0, 6.0])
    ros = sim["steps"][0]["ros_kmh"] if sim["steps"] else 0.3
    waters = [{"id": w.id, "name": w.name, "asset_type": w.asset_type,
               "longitude": w.longitude, "latitude": w.latitude,
               "capacity_m3": w.capacity_m3, "road_access": w.road_access,
               "status": w.status, "manager": w.manager}
              for w in db.query(WaterAsset).all()]
    threats = ops.assess_water_threat(lon, lat, ros, waters, sim["steps"])
    summary = {b: sum(1 for t in threats if t["band"] == b)
               for b in ("CRITICAL", "THREATENED", "WATCH", "SAFE")}
    return {
        "fire": {"lon": lon, "lat": lat},
        "ros_kmh": ros,
        "spread_model": spread_svc.MODEL,
        "inputs": {"wind_speed_kmh": wind_speed_kmh,
                   "wind_direction_deg": wind_direction_deg % 360,
                   "slope_deg": slope_deg},
        "threats": threats,
        "summary": summary,
        "band_rule": "CRITICAL<1h, THREATENED<3h, WATCH<6h (polygon ∩ + ETA/dist÷ROS))",
    }
