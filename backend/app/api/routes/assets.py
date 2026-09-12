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
from app.models.ops import (ASSET_STATUS, ASSET_TYPES, ROAD_CONDITIONS,
                            SURFACE_TYPES, OperationalAsset)

router = APIRouter(tags=["Assets"])

REGISTRY_TYPES = ("station", "team", "watchtower")  # Module A scope


def _parse_verification_date(raw):
    """YYYY-MM-DD → datetime, None stays None. 400 on garbage."""
    if raw is None or str(raw).strip() == "":
        return None
    try:
        from datetime import datetime as _dt
        return _dt.strptime(str(raw).strip()[:10], "%Y-%m-%d")
    except Exception:
        raise HTTPException(400, "verification_date must be YYYY-MM-DD")


def _enum_or_none(raw, allowed: tuple, field: str):
    if raw is None or str(raw).strip() == "":
        return None
    v = str(raw).strip().upper()
    if v not in allowed:
        raise HTTPException(400, f"{field} must be one of {', '.join(allowed)} (or omitted)")
    return v


# A3 legacy free-text → canonical (documents the migration; rejects unknowns).
_SEASONAL_ALIASES = {
    "DRY_ONLY": "DRY_ONLY", "DRY-ONLY": "DRY_ONLY", "DRY SEASON ONLY": "DRY_ONLY",
    "DRY-SEASON-ONLY": "DRY_ONLY", "DRY": "DRY_ONLY", "MUA KHO": "DRY_ONLY",
    "YEAR_ROUND": "YEAR_ROUND", "YEAR-ROUND": "YEAR_ROUND", "YEAR ROUND": "YEAR_ROUND",
    "QUANH NAM": "YEAR_ROUND", "YEARROUND": "YEAR_ROUND",
}


def _seasonal_or_none(raw):
    if raw is None or str(raw).strip() == "":
        return None
    v = str(raw).strip().upper()
    if v in _SEASONAL_ALIASES:
        return _SEASONAL_ALIASES[v]
    from app.models.ops import SEASONAL_ACCESS
    raise HTTPException(400, f"seasonal_access must be one of {', '.join(SEASONAL_ACCESS)} (or omitted)")


def _nearby_photo_counts(db: Session, points: list) -> dict:
    """Bulk photo proximity (≤1km) for Module E `photos` tier.

    points: [(key, lon, lat)]. Returns {key: count}. PhotoEvidence links to
    proposals, NOT assets — so matches are ESTIMATED, labeled as such.
    """
    try:
        from app.models.community import PhotoEvidence
        photos = db.query(PhotoEvidence).filter(
            PhotoEvidence.location_lat.isnot(None),
            PhotoEvidence.location_lng.isnot(None)).all()
    except Exception:
        return {}
    out = {}
    for key, lon, lat in points:
        n = 0
        for p in photos:
            try:
                if _haversine_km(lon, lat, p.location_lng, p.location_lat) <= 1.0:
                    n += 1
            except Exception:
                continue
        out[key] = n
    return out


def _viewer_for(a: OperationalAsset, nearby_photos: int) -> dict:
    from app.services import twin_ops as ops
    return ops.viewer_fallback(getattr(a, "has_streetview", None), a.viewer_url,
                              nearby_photos, a.longitude, a.latitude,
                              getattr(a, "capture_date", None),
                              getattr(a, "capture_source", None))


def _shape(a: OperationalAsset, nearby_photos: int = 0) -> dict:
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
        "contact": getattr(a, "contact", None),
        "route_type": getattr(a, "route_type", None),
        "road_condition": getattr(a, "road_condition", None),
        # Module A/B/D/E — NULL until surveyed
        "district": getattr(a, "district", None),
        "commune": getattr(a, "commune", None),
        "manager": getattr(a, "manager", None),
        "source": getattr(a, "source", None),
        "contact_person": getattr(a, "contact_person", None),
        "contact_phone": getattr(a, "contact_phone", None),
        "organization": getattr(a, "organization", None),
        "verification_date": (str(getattr(a, "verification_date", None))
                              if getattr(a, "verification_date", None) else None),
        "surface_type": getattr(a, "surface_type", None),
        "max_vehicle_tons": getattr(a, "max_vehicle_tons", None),
        "seasonal_access": getattr(a, "seasonal_access", None),
        "has_streetview": getattr(a, "has_streetview", None),
        # Module 360 (M1): capture metadata — NULL until real media exists
        "preview_image_url": getattr(a, "preview_image_url", None),
        "capture_date": (str(getattr(a, "capture_date", None))
                         if getattr(a, "capture_date", None) else None),
        "capture_source": getattr(a, "capture_source", None),
        "gps_status": "VERIFIED",  # lat/lon NOT NULL by schema
        "viewer": _viewer_for(a, nearby_photos),
        "created_by": a.created_by, "created_at": str(a.created_at),
    }


_REGISTRY_CACHE: list | None = None


def _load_station_registry() -> list:
    """Module A — CSV rows (all gps_status=MISSING by construction: no coords
    columns exist in the file). Header-only until rangers survey real posts."""
    global _REGISTRY_CACHE
    if _REGISTRY_CACHE is not None:
        return _REGISTRY_CACHE
    import csv as _csv
    import os as _os
    path = _os.path.join(_os.path.dirname(__file__), "..", "..", "data",
                         "stations_registry.csv")
    rows = []
    try:
        with open(path, encoding="utf-8-sig") as f:
            for r in _csv.DictReader(f):
                name = (r.get("name") or "").strip()
                if not name:
                    continue
                rows.append({
                    "name": name,
                    "type": (r.get("type") or "station").strip() or "station",
                    "district": (r.get("district") or "").strip() or None,
                    "commune": (r.get("commune") or "").strip() or None,
                    "manager": (r.get("manager") or "").strip() or None,
                    "phone": (r.get("phone") or "").strip() or None,
                    "gps_status": "MISSING",
                    "source": (r.get("source") or "").strip() or None,
                })
    except FileNotFoundError:
        pass
    _REGISTRY_CACHE = rows
    return rows


def _postgis_nearest_ids(db: Session, asset_types: list, lon: float, lat: float,
                         top: int) -> list | None:
    """PostGIS KNN when DATABASE_URL is Postgres+PostGIS, else None → Python fallback.

    Uses expression-based geography distance (no schema change required).
    Migration upgrade (postgis_init.sql): generated `geom` column + GIST index,
    then ORDER BY geom::geography <-> point — same result, index-assisted.
    Returns [(id, dist_km)] or None when unavailable/failed.
    """
    try:
        from app.database import engine as _eng
        url = str(getattr(_eng, "url", ""))
    except Exception:
        return None
    if not url.startswith("postgresql"):
        return None
    try:
        from sqlalchemy import text as _text
        # asyncpg/psycopg2 paramstyle: named params via text()
        placeholders = ",".join(f"'{t}'" for t in asset_types)
        sql = _text(
            "SELECT id, "
            "ST_Distance(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography, "
            "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)/1000.0 AS dist_km "
            f"FROM operational_assets WHERE status = 'active' AND asset_type IN ({placeholders}) "
            "ORDER BY ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography "
            "<-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography LIMIT :top"
        )
        rows = db.execute(sql, {"lon": lon, "lat": lat, "top": top}).fetchall()
        return [(r[0], float(r[1])) for r in rows]
    except Exception:
        return None


def _rank_stations(db: Session, lon: float, lat: float, avg_speed_kmh: float,
                   top: int = 2) -> list:
    """Top-N active stations/teams by distance. PostGIS KNN when available."""
    from app.services import twin_ops as ops
    ranked: list = []
    knn = _postgis_nearest_ids(db, ["station", "team"], lon, lat, top)
    if knn is not None:
        by_id = {a.id: a for a in db.query(OperationalAsset).filter(
            OperationalAsset.id.in_([i for i, _ in knn])).all()}
        for aid, dist in knn:
            a = by_id.get(aid)
            if a is None:
                continue
            out = _shape(a)
            out["distance_km"] = round(dist, 2)
            out["eta_minutes"] = ops.road_eta_minutes(dist, avg_speed_kmh)
            ranked.append(out)
        return ranked
    cands = db.query(OperationalAsset).filter(
        OperationalAsset.status == "active",
        OperationalAsset.asset_type.in_(["station", "team"])).all()
    scored = sorted(((_haversine_km(lon, lat, a.longitude, a.latitude), a) for a in cands),
                    key=lambda t: t[0])[:top]
    for d, a in scored:
        out = _shape(a)
        out["distance_km"] = round(d, 2)
        out["eta_minutes"] = ops.road_eta_minutes(d, avg_speed_kmh)
        ranked.append(out)
    return ranked


def _route_vertices(geometry_text) -> list:
    """Extract [(lon, lat)] vertices from stored GeoJSON (shared helper)."""
    import json as _json
    try:
        g = _json.loads(geometry_text) if geometry_text else None
    except Exception:
        return []
    if not g:
        return []
    lines = [g["coordinates"]] if g.get("type") == "LineString" else g.get("coordinates", [])
    pts = []
    for line in lines or []:
        for p in line or []:
            try:
                pts.append((float(p[0]), float(p[1])))
            except Exception:
                continue
    return pts


def _route_vertex_distance(geometry_text, lon: float, lat: float):
    """Documented approximation: min haversine to LineString vertices."""
    import json as _json
    try:
        g = _json.loads(geometry_text) if geometry_text else None
    except Exception:
        return None
    if not g:
        return None
    lines = [g["coordinates"]] if g.get("type") == "LineString" else g.get("coordinates", [])
    best = None
    for line in lines:
        for px, py in (line or []):
            try:
                d = _haversine_km(lon, lat, float(px), float(py))
            except Exception:
                continue
            if best is None or d < best:
                best = d
    return best


def _rank_routes(db: Session, lon: float, lat: float, top: int = 2) -> list:
    rows = db.query(OperationalAsset).filter(
        OperationalAsset.asset_type == "route",
        OperationalAsset.status == "active").all()
    scored = []
    for r in rows:
        d = _route_vertex_distance(r.geometry, lon, lat)
        if d is None:
            continue
        scored.append((d, r))
    scored.sort(key=lambda t: t[0])
    out = []
    for d, r in scored[:top]:
        shp = _shape(r)
        out.append({
            "id": r.id, "route_name": r.name, "name": r.name,
            "distance_km": round(d, 2),
            "route_type": getattr(r, "route_type", None),
            "road_condition": getattr(r, "road_condition", None),
            # Module B survey — NULL until surveyed
            "surface_type": getattr(r, "surface_type", None),
            "max_vehicle_tons": getattr(r, "max_vehicle_tons", None),
            "seasonal_access": getattr(r, "seasonal_access", None),
            "source": getattr(r, "source", None),
            "geometry": shp["geometry"],
            "status": r.status,
        })
    return out


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
    rows = q.order_by(OperationalAsset.created_at.desc()).limit(200).all()
    counts = _nearby_photo_counts(db, [(a.id, a.longitude, a.latitude) for a in rows])
    return [_shape(a, counts.get(a.id, 0)) for a in rows]


@router.patch("/assets/{asset_id}")
def patch_asset(asset_id: str, body: dict, db: Session = Depends(get_db),
                user=Depends(get_current_user)):
    """Field-data completion: fill survey/contact/viewer gaps without
    re-entering GPS. Only whitelisted nullable fields are editable."""
    a = db.get(OperationalAsset, asset_id)
    if not a:
        raise HTTPException(404, "Asset not found")
    editable_text = ("note", "contact", "route_type", "district", "commune",
                     "manager", "source", "contact_person", "contact_phone",
                     "organization", "capture_source")
    limits = {"note": 500, "contact": 255, "route_type": 50, "district": 100,
              "commune": 100, "manager": 255, "source": 255,
              "contact_person": 255, "contact_phone": 50, "organization": 255,
              "capture_source": 255}
    for f in editable_text:
        if f in body:
            v = body[f]
            setattr(a, f, (str(v).strip()[:limits[f]] or None) if v not in (None, "") else None)
    if "status" in body:
        s = str(body["status"] or "").lower()
        if s not in ASSET_STATUS:
            raise HTTPException(400, f"status must be one of {', '.join(ASSET_STATUS)}")
        a.status = s
    if "road_condition" in body:
        a.road_condition = _enum_or_none(body["road_condition"], ROAD_CONDITIONS, "road_condition")
    if "surface_type" in body:
        a.surface_type = _enum_or_none(body["surface_type"], SURFACE_TYPES, "surface_type")
    if "seasonal_access" in body:
        a.seasonal_access = _seasonal_or_none(body["seasonal_access"])
    if "max_vehicle_tons" in body:
        v = body["max_vehicle_tons"]
        if v in (None, ""):
            a.max_vehicle_tons = None
        else:
            try:
                a.max_vehicle_tons = float(v)
            except Exception:
                raise HTTPException(400, "max_vehicle_tons must be numeric tons")
            if a.max_vehicle_tons < 0:
                raise HTTPException(400, "max_vehicle_tons must be >= 0")
    if "verification_date" in body:
        a.verification_date = _parse_verification_date(body["verification_date"])
    if "capture_date" in body:
        a.capture_date = _parse_verification_date(body["capture_date"])
    if "preview_image_url" in body:
        pu = body["preview_image_url"]
        pu = str(pu or "").strip()[:500] or None
        if pu and not (pu.startswith("http://") or pu.startswith("https://")):
            raise HTTPException(400, "preview_image_url must be http(s)")
        a.preview_image_url = pu
    if "has_streetview" in body:
        hsv = body["has_streetview"]
        a.has_streetview = None if hsv in (None, "") else bool(hsv)
    if "viewer_url" in body:
        vu = body["viewer_url"]
        vu = str(vu or "").strip()[:500] or None
        if vu and not (vu.startswith("http://") or vu.startswith("https://")):
            raise HTTPException(400, "viewer_url must be http(s)")
        a.viewer_url = vu
    db.commit()
    db.refresh(a)
    return _shape(a)


@router.get("/assets/{asset_id}/viewer")
def asset_viewer(asset_id: str, db: Session = Depends(get_db)):
    """Module E — full viewer chain for one asset (photos proximity checked)."""
    a = db.get(OperationalAsset, asset_id)
    if not a:
        raise HTTPException(404, "Asset not found")
    counts = _nearby_photo_counts(db, [(a.id, a.longitude, a.latitude)])
    return {"id": a.id, "name": a.name, "asset_type": a.asset_type,
            "updated_at": str(getattr(a, "updated_at", None)),
            **_viewer_for(a, counts.get(a.id, 0))}


@router.get("/assets/{asset_id}/detail")
def asset_detail(asset_id: str, db: Session = Depends(get_db)):
    """Module 360 (M3) — single-asset payload for /viewer/:assetId page."""
    a = db.get(OperationalAsset, asset_id)
    if a:
        counts = _nearby_photo_counts(db, [(a.id, a.longitude, a.latitude)])
        out = _shape(a, counts.get(a.id, 0))
        out["kind"] = "operational"
        return out
    from app.models.water import WaterAsset
    from app.api.routes.water import _shape as _wshape, _photo_counts as _wphotos
    w = db.get(WaterAsset, asset_id)
    if w:
        counts = _wphotos(db, [(w.id, w.longitude, w.latitude)])
        out = _wshape(w, counts.get(w.id, 0))
        out["kind"] = "water"
        return out
    raise HTTPException(404, "Asset not found")


@router.get("/stations/registry")
def stations_registry(db: Session = Depends(get_db)):
    """Module A — unified registry: DB rows (gps VERIFIED) + CSV rows
    (gps MISSING). Never invents GPS: CSV has no coordinate columns."""
    csv_rows = _load_station_registry()
    db_rows = db.query(OperationalAsset).filter(
        OperationalAsset.asset_type.in_(list(REGISTRY_TYPES))).all()
    out = [{
        "name": a.name, "type": a.asset_type,
        "district": getattr(a, "district", None), "commune": getattr(a, "commune", None),
        "manager": getattr(a, "manager", None),
        "phone": getattr(a, "contact_phone", None) or getattr(a, "contact", None),
        "gps_status": "VERIFIED",
        "source": getattr(a, "source", None) or (f"DB:{a.created_by}" if a.created_by else "DB"),
    } for a in sorted(db_rows, key=lambda x: x.name)]
    out += csv_rows
    return {
        "stations": out,
        "total": len(out),
        "verified_gps": len(db_rows),
        "missing_gps": len(csv_rows),
        "note": "CSV rows are MISSING GPS by construction — survey GPS before ops use",
    }


@router.get("/assets/contacts")
def assets_contacts(db: Session = Depends(get_db)):
    """Module D — contact directory across water + stations/towers/routes.
    contact_status: VERIFIED (dated) / PARTIAL (undated) / MISSING (empty)."""
    from app.services import twin_ops as ops
    from app.models.water import WaterAsset
    directory = []
    for w in db.query(WaterAsset).all():
        directory.append({
            "kind": "water", "id": w.id, "name": w.name,
            "contact_person": getattr(w, "contact_person", None),
            "contact_phone": getattr(w, "contact_phone", None),
            "organization": w.manager,
            "verification_date": (str(getattr(w, "verification_date", None))
                                  if getattr(w, "verification_date", None) else None),
            "contact_status": ops.contact_status(
                getattr(w, "contact_person", None), getattr(w, "contact_phone", None),
                w.manager, getattr(w, "verification_date", None)),
        })
    for a in db.query(OperationalAsset).filter(
            OperationalAsset.asset_type.in_(["station", "team", "watchtower", "route"])).all():
        directory.append({
            "kind": a.asset_type, "id": a.id, "name": a.name,
            "contact_person": getattr(a, "contact_person", None),
            "contact_phone": getattr(a, "contact_phone", None) or getattr(a, "contact", None),
            "organization": getattr(a, "organization", None),
            "verification_date": (str(getattr(a, "verification_date", None))
                                  if getattr(a, "verification_date", None) else None),
            "contact_status": ops.contact_status(
                getattr(a, "contact_person", None),
                getattr(a, "contact_phone", None) or getattr(a, "contact", None),
                getattr(a, "organization", None),
                getattr(a, "verification_date", None)),
        })
    # Registry CSV rows (hotline phones, MISSING GPS): usable contacts even
    # before GPS survey. contact_status PARTIAL (phone, no verification date).
    for r in _load_station_registry():
        directory.append({
            "kind": r.get("type") or "station", "id": None, "name": r["name"],
            "contact_person": r.get("manager"),
            "contact_phone": r.get("phone"),
            "organization": None,
            "verification_date": None,
            "contact_status": ("PARTIAL" if r.get("phone") else "MISSING"),
            "gps_status": "MISSING",
            "source": r.get("source"),
        })
    summary = {s: sum(1 for d in directory if d["contact_status"] == s)
               for s in ("VERIFIED", "PARTIAL", "MISSING")}
    return {"directory": sorted(directory, key=lambda d: d["name"]),
            "total": len(directory), "summary": summary}


@router.get("/ops/gaps")
def ops_gaps(db: Session = Depends(get_db)):
    """Module F — live data-gap audit (powers docs/OPERATIONAL_GAPS.md)."""
    from app.core.time import utcnow
    from app.models.water import WaterAsset
    waters = db.query(WaterAsset).all()
    stations = db.query(OperationalAsset).filter(
        OperationalAsset.asset_type.in_(list(REGISTRY_TYPES))).all()
    routes = db.query(OperationalAsset).filter(
        OperationalAsset.asset_type == "route").all()
    csv_missing = len(_load_station_registry())
    photo_pts = ([(w.id, w.longitude, w.latitude) for w in waters]
                 + [(a.id, a.longitude, a.latitude)
                    for a in db.query(OperationalAsset).all()])
    photo_counts = _nearby_photo_counts(db, photo_pts)

    def _viewer_tier_water(w) -> str:
        from app.services import twin_ops as ops
        return ops.viewer_fallback(w.has_streetview, w.google_maps_url,
                                   photo_counts.get(w.id, 0),
                                   w.longitude, w.latitude)["viewer_type"]

    def _viewer_tier_ops(a) -> str:
        from app.services import twin_ops as ops
        return ops.viewer_fallback(getattr(a, "has_streetview", None), a.viewer_url,
                                   photo_counts.get(a.id, 0),
                                   a.longitude, a.latitude)["viewer_type"]

    viewer_counts: dict = {}
    for w in waters:
        t = _viewer_tier_water(w)
        viewer_counts[t] = viewer_counts.get(t, 0) + 1
    for a in db.query(OperationalAsset).all():
        t = _viewer_tier_ops(a)
        viewer_counts[t] = viewer_counts.get(t, 0) + 1
    missing_contact_water = [w.name for w in waters
                             if not getattr(w, "contact_phone", None)]
    missing_contact_st = [a.name for a in stations
                          if not (getattr(a, "contact_phone", None) or getattr(a, "contact", None))]
    routes_no_geom = [r.name for r in routes if not r.geometry]
    routes_no_cond = [r.name for r in routes if not getattr(r, "road_condition", None)]
    return {
        "generated_at": utcnow().isoformat(),
        "water": {"total": len(waters),
                  "verified": sum(1 for w in waters if w.status == "verified"),
                  "missing_contact": missing_contact_water},
        "stations": {"verified_gps": len(stations), "missing_gps": csv_missing,
                     "missing_contact": missing_contact_st},
        "routes": {"total": len(routes),
                   "missing_geometry": routes_no_geom,
                   "missing_road_condition": routes_no_cond,
                   "missing_surface": [r.name for r in routes
                                       if not getattr(r, "surface_type", None)]},
        "viewers": viewer_counts,
        "communities": {"communes_with_population": "134/134 (dan_so, VERIFIED)",
                        "villages_reference": "20 points (reference-sample, ESTIMATED)"},
    }


@router.get("/ops/consistency")
def ops_consistency(db: Session = Depends(get_db)):
    """Module G — do Map/API/Analyst/threats/plan share one commune source?

    Every check resolves join keys against administrative_units (the single
    source). Mismatches are listed explicitly, never papered over.
    """
    from app.core.time import utcnow
    from app.models.administrative import AdministrativeUnit
    from app.models.fire import OfficialFireWarning
    from app.models.pipeline import DataProposal
    from app.models.risk import Alert, Incident
    from app.models.water import WaterAsset
    from app.services.village_fire import VILLAGES

    def _resolve(key):
        return AdministrativeUnit.resolve_unit(db, key) is not None

    checks = []
    waters = db.query(WaterAsset).all()
    bad_water = [w.name for w in waters
                 if w.commune_code and not _resolve(w.commune_code)]
    checks.append({"name": "water.commune_code → units",
                   "ok": not bad_water, "mismatches": bad_water})
    bad_vill = [v["id"] for v in VILLAGES if not _resolve(v.get("code"))]
    checks.append({"name": "villages.code → units",
                   "ok": not bad_vill, "mismatches": bad_vill})
    bad_alerts = [a.id for a in db.query(Alert).all()
                  if not _resolve(a.administrative_unit_id)]
    checks.append({"name": "alerts.administrative_unit_id → units",
                   "ok": not bad_alerts, "mismatches": bad_alerts})
    bad_props = [p.id for p in db.query(DataProposal).all()
                 if not _resolve(p.administrative_unit_id)]
    checks.append({"name": "proposals.administrative_unit_id → units",
                   "ok": not bad_props, "mismatches": bad_props})
    bad_inc = [i.id for i in db.query(Incident).all()
               if not _resolve(i.administrative_unit_id)]
    checks.append({"name": "incidents.administrative_unit_id → units",
                   "ok": not bad_inc, "mismatches": bad_inc})
    bad_warn = [w.id for w in db.query(OfficialFireWarning).all()
                if not _resolve(w.administrative_unit_id)]
    checks.append({"name": "fire_warnings.administrative_unit_id → units",
                   "ok": not bad_warn, "mismatches": bad_warn})
    no_geom = [u.code or u.id for u in db.query(AdministrativeUnit).filter_by(
        is_demo=False).all() if not u.geometry_geojson]
    checks.append({"name": "communes with real boundaries",
                   "ok": not no_geom, "mismatches": no_geom})
    return {"generated_at": utcnow().isoformat(), "checks": checks,
            "mismatches_total": sum(len(c["mismatches"]) for c in checks),
            "all_consistent": all(c["ok"] for c in checks)}


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
    # M1/M2 tactical fields — free-text, NULL until rangers supply real values.
    contact = str(body.get("contact") or "").strip()[:255] or None
    route_type = str(body.get("route_type") or "").strip()[:50] or None
    # Module B — canonical enums, NULL until surveyed (no silent normalization).
    road_condition = _enum_or_none(body.get("road_condition"), ROAD_CONDITIONS, "road_condition")
    surface_type = _enum_or_none(body.get("surface_type"), SURFACE_TYPES, "surface_type")
    try:
        max_tons = float(body["max_vehicle_tons"]) if body.get("max_vehicle_tons") not in (None, "") else None
    except Exception:
        raise HTTPException(400, "max_vehicle_tons must be numeric tons")
    if max_tons is not None and max_tons < 0:
        raise HTTPException(400, "max_vehicle_tons must be >= 0")
    # Module A/D/E — all NULL until surveyed.
    district = str(body.get("district") or "").strip()[:100] or None
    commune = str(body.get("commune") or "").strip()[:100] or None
    manager = str(body.get("manager") or "").strip()[:255] or None
    source = str(body.get("source") or "").strip()[:255] or None
    contact_person = str(body.get("contact_person") or "").strip()[:255] or None
    contact_phone = str(body.get("contact_phone") or "").strip()[:50] or None
    organization = str(body.get("organization") or "").strip()[:255] or None
    verification_date = _parse_verification_date(body.get("verification_date"))
    seasonal_access = _seasonal_or_none(body.get("seasonal_access"))
    hsv = body.get("has_streetview")
    has_streetview = None if hsv in (None, "") else bool(hsv)
    # Module 360 (M1/M5) — preview + capture metadata, NULL until real media.
    preview_image_url = str(body.get("preview_image_url") or "").strip()[:500] or None
    if preview_image_url and not (preview_image_url.startswith("http://") or preview_image_url.startswith("https://")):
        raise HTTPException(400, "preview_image_url must be http(s)")
    capture_date = _parse_verification_date(body.get("capture_date"))
    capture_source = str(body.get("capture_source") or "").strip()[:255] or None
    a = OperationalAsset(
        asset_type=atype, name=name, latitude=lat, longitude=lon, status=status,
        capacity_liters=body.get("capacity_liters"), coverage_radius_m=body.get("coverage_radius_m"),
        note=(str(body.get("note") or "")[:500] or None), viewer_url=viewer_url,
        geometry=geometry, created_by=user.username,
        contact=contact, route_type=route_type, road_condition=road_condition,
        district=district, commune=commune, manager=manager, source=source,
        contact_person=contact_person, contact_phone=contact_phone,
        organization=organization, verification_date=verification_date,
        surface_type=surface_type, max_vehicle_tons=max_tons,
        seasonal_access=seasonal_access, has_streetview=has_streetview,
        preview_image_url=preview_image_url, capture_date=capture_date,
        capture_source=capture_source,
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


@router.get("/assets/nearest-station")
def nearest_station(lat: float = Query(...), lon: float = Query(...),
                    avg_speed_kmh: float = Query(default=30.0, gt=0),
                    db: Session = Depends(get_db)):
    """Nearest active station/team + road ETA. Honest empty when none exist —
    the 17 posts must be entered (Admin) before this returns data."""
    from app.services import twin_ops as ops
    ranked = _rank_stations(db, lon, lat, avg_speed_kmh, top=1)
    if not ranked:
        return {"asset": None, "distance_km": None, "eta_minutes": None,
                "note": "Chưa có trạm/tổ nào — nhập GPS trên trang Quản trị"}
    best = ranked[0]
    return {"asset": best, "distance_km": best["distance_km"],
            "eta_minutes": best["eta_minutes"],
            "eta_assumption": f"đường chim bay ×{ops.ROAD_FACTOR} @ {avg_speed_kmh}km/h"}


@router.get("/stations/nearest")
def stations_nearest(lat: float = Query(...), lon: float = Query(...),
                     avg_speed_kmh: float = Query(default=30.0, gt=0),
                     db: Session = Depends(get_db)):
    """MODULE 1 — spec contract. contact is NULL until rangers enter it;
    operational_status mirrors asset status (no invented readiness)."""
    from app.services import twin_ops as ops
    ranked = _rank_stations(db, lon, lat, avg_speed_kmh, top=1)
    if not ranked:
        return {"station_name": None, "station_type": None, "distance_km": None,
                "eta_minutes": None, "contact": None, "operational_status": None,
                "note": "Chưa có trạm/tổ nào — nhập GPS trên trang Quản trị"}
    b = ranked[0]
    return {
        "station_name": b["name"], "station_type": b["asset_type"],
        "distance_km": b["distance_km"], "eta_minutes": b["eta_minutes"],
        "contact": b.get("contact"),
        "operational_status": b.get("status"),
        "eta_assumption": f"đường chim bay ×{ops.ROAD_FACTOR} @ {avg_speed_kmh}km/h (PostGIS KNN khi có Postgres, fallback haversine trên SQLite)",
    }


@router.get("/assets/nearest-route")
def nearest_route(lat: float = Query(...), lon: float = Query(...),
                  db: Session = Depends(get_db)):
    """Nearest active access route (LineString vertex distance, documented)."""
    ranked = _rank_routes(db, lon, lat, top=1)
    if not ranked:
        return {"asset": None, "distance_km": None,
                "note": "Chưa có tuyến tiếp cận nào — nhập GeoJSON LineString trên trang Quản trị"}
    best = ranked[0]
    return {"asset": {"id": best["id"], "name": best["route_name"],
                      "distance_km": best["distance_km"],
                      "route_type": best["route_type"],
                      "road_condition": best["road_condition"],
                      "geometry": best["geometry"]},
            "distance_km": best["distance_km"]}


@router.get("/routes/nearest")
def routes_nearest(lat: float = Query(...), lon: float = Query(...),
                   db: Session = Depends(get_db)):
    """MODULE 2 — spec contract. road_condition/route_type NULL until surveyed.
    pgRouting fastest/safest/backup are DESIGNED but BLOCKED (no road network
    dataset) — this endpoint returns the documented vertex-distance nearest
    only, never fake turn-by-turn."""
    ranked = _rank_routes(db, lon, lat, top=1)
    if not ranked:
        return {"route_name": None, "distance_km": None, "route_type": None,
                "road_condition": None, "geometry": None,
                "note": "Chưa có tuyến tiếp cận nào — nhập GeoJSON LineString trên trang Quản trị",
                "pgrouting": "BLOCKED — chưa có road network + Postgres/pgRouting; ETA đường chim bay, không trả fastest/safest/backup giả"}
    b = ranked[0]
    return {**b, "pgrouting": "BLOCKED — chưa có road network + Postgres/pgRouting"}


@router.get("/assets/threatened")
def threatened_assets(lat: float = Query(...), lon: float = Query(...),
                      wind_speed_kmh: float = Query(default=15.0, ge=0),
                      wind_direction_deg: float = Query(default=45.0),
                      slope_deg: float = Query(default=12.0, ge=0),
                      db: Session = Depends(get_db)):
    """MODULE 3 — unified threat engine: spread 1h/3h/6h ∩ water + stations/
    towers + communes. Band = severe(polygon containment, ETA/dist÷ROS)."""
    from app.services import spread as spread_svc
    from app.services import twin_ops as ops
    sim = spread_svc.simulate(lon, lat, float(wind_speed_kmh),
                              float(wind_direction_deg), float(slope_deg),
                              [1.0, 3.0, 6.0])
    ros = sim["steps"][0]["ros_kmh"] if sim["steps"] else 0.3
    op_rows = [{"id": a.id, "name": a.name, "asset_type": a.asset_type,
                "status": a.status, "latitude": a.latitude, "longitude": a.longitude}
               for a in db.query(OperationalAsset).all()]
    op_threats = ops.assess_asset_threat(lon, lat, ros, op_rows)
    from app.models.water import WaterAsset
    w_rows = [{"id": w.id, "name": w.name, "asset_type": w.asset_type,
               "longitude": w.longitude, "latitude": w.latitude,
               "capacity_m3": w.capacity_m3, "road_access": w.road_access,
               "status": w.status, "manager": w.manager}
              for w in db.query(WaterAsset).all()]
    w_threats = ops.assess_water_threat(lon, lat, ros, w_rows, sim["steps"])
    communes = spread_svc.load_commune_shapes()
    per_step = []
    for s in sim["steps"]:
        aff = spread_svc.affected_communes(s["polygon"]["coordinates"][0], communes)
        per_step.append({"hour": s["hour"], "affected_communes": aff,
                         "n_communes": len(aff)})
    all_threats = op_threats + w_threats
    summary = {b: sum(1 for t in all_threats if t["band"] == b)
               for b in ("CRITICAL", "THREATENED", "WATCH", "SAFE")}
    return {
        "fire": {"lon": lon, "lat": lat}, "ros_kmh": ros,
        "spread_model": spread_svc.MODEL,
        "operational_threats": op_threats, "water_threats": w_threats,
        "communes_per_step": per_step,
        "summary": summary,
        "band_rule": "CRITICAL<1h, THREATENED<3h, WATCH<6h (polygon ∩ lấy nặng hơn + ETA=dist/ROS))",
    }


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str, db: Session = Depends(get_db), admin=Depends(require_role("admin"))):
    a = db.get(OperationalAsset, asset_id)
    if not a:
        raise HTTPException(404, "Asset not found")
    db.delete(a)
    db.commit()
    return {"id": asset_id, "status": "DELETED"}
