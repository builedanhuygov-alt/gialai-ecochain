"""Operational assets — ranger-entered command-center objects.

No external dataset required: towers, cameras, water tanks, trucks, pumps
and teams are created through the Admin page (or API) with operator GPS.
The map renders them; the AI brief measures nearest-water/station from them.
"""
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_role
from app.database import get_db
from app.models.ops import ASSET_STATUS, ASSET_TYPES, OperationalAsset

router = APIRouter(tags=["Assets"])


def _shape(a: OperationalAsset) -> dict:
    import json as _json
    try:
        geom = _json.loads(a.geometry) if a.geometry else None
    except Exception:
        geom = None
    return {
        "id": a.id, "asset_type": a.asset_type, "name": a.name,
        "latitude": a.latitude, "longitude": a.longitude, "status": a.status,
        "capacity_liters": a.capacity_liters, "coverage_radius_m": a.coverage_radius_m,
        "note": a.note, "viewer_url": a.viewer_url, "geometry": geom,
        "created_by": a.created_by, "created_at": str(a.created_at),
    }


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


@router.get("/assets")
def list_assets(asset_type: Optional[str] = Query(default=None),
                status: Optional[str] = Query(default=None),
                db: Session = Depends(get_db)):
    q = db.query(OperationalAsset)
    if asset_type:
        if asset_type not in ASSET_TYPES:
            raise HTTPException(400, f"Unknown asset_type (one of {', '.join(ASSET_TYPES)})")
        q = q.filter(OperationalAsset.asset_type == asset_type)
    if status:
        q = q.filter(OperationalAsset.status == status)
    return [_shape(a) for a in q.order_by(OperationalAsset.created_at.desc()).limit(200).all()]


@router.post("/assets")
def create_asset(body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    atype = str(body.get("asset_type") or "").lower()
    if atype not in ASSET_TYPES:
        raise HTTPException(400, f"asset_type must be one of {', '.join(ASSET_TYPES)}")
    try:
        lat = float(body["latitude"])
        lon = float(body["longitude"])
    except Exception:
        raise HTTPException(400, "latitude/longitude required and numeric")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "coordinates out of range")
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    status = str(body.get("status") or "active").lower()
    if status not in ASSET_STATUS:
        raise HTTPException(400, f"status must be one of {', '.join(ASSET_STATUS)}")
    geometry = body.get("geometry")
    if geometry is not None:
        import json as _json
        if isinstance(geometry, dict):
            if geometry.get("type") not in ("LineString", "Polygon", "MultiLineString"):
                raise HTTPException(400, "geometry must be GeoJSON LineString/Polygon")
            geometry = _json.dumps(geometry)
        elif isinstance(geometry, str):
            try:
                g = _json.loads(geometry)
                if g.get("type") not in ("LineString", "Polygon", "MultiLineString"):
                    raise HTTPException(400, "geometry must be GeoJSON LineString/Polygon")
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(400, "geometry must be valid GeoJSON")
        else:
            raise HTTPException(400, "geometry must be valid GeoJSON")
    viewer_url = str(body.get("viewer_url") or "").strip()[:500] or None
    if viewer_url and not (viewer_url.startswith("http://") or viewer_url.startswith("https://")):
        raise HTTPException(400, "viewer_url must be http(s)")
    a = OperationalAsset(
        asset_type=atype, name=name, latitude=lat, longitude=lon, status=status,
        capacity_liters=body.get("capacity_liters"), coverage_radius_m=body.get("coverage_radius_m"),
        note=(str(body.get("note") or "")[:500] or None), viewer_url=viewer_url,
        geometry=geometry, created_by=user.username,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _shape(a)


@router.get("/assets/nearest")
def nearest_asset(lat: float = Query(...), lon: float = Query(...),
                  asset_type: Optional[str] = Query(default=None),
                  db: Session = Depends(get_db)):
    """Nearest active asset to a point — powers 'nguồn nước gần nhất'."""
    q = db.query(OperationalAsset).filter(OperationalAsset.status == "active")
    if asset_type:
        q = q.filter(OperationalAsset.asset_type == asset_type)
    best, best_d = None, None
    for a in q.all():
        d = _haversine_km(lon, lat, a.longitude, a.latitude)
        if best_d is None or d < best_d:
            best, best_d = a, d
    if best is None:
        return {"asset": None, "distance_km": None,
                "note": "Chưa có tài sản loại này — nhập GPS trên trang Quản trị"}
    out = _shape(best)
    out["distance_km"] = round(best_d, 2)
    return {"asset": out, "distance_km": round(best_d, 2)}


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str, db: Session = Depends(get_db), admin=Depends(require_role("admin"))):
    a = db.get(OperationalAsset, asset_id)
    if not a:
        raise HTTPException(404, "Asset not found")
    db.delete(a)
    db.commit()
    return {"id": asset_id, "status": "DELETED"}
