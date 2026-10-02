"""Village reference points + 20km fire notification.

VILLAGES are 20 hand-placed REFERENCE points (origin="reference-sample"),
NOT an exhaustive thôn list — Gia Lai has 1000+ real villages without a
published boundary dataset. Each point is linked to its real containing
commune (verified by point-in-polygon over gialai_communes.geojson), so
alerts join real geography instead of pre-merger district names.
"""
import math
import hashlib
import json
import os
from functools import lru_cache
from typing import List, Dict

# Gia Lai mới: 15,536 km2 — từ biên Campuchia (107.0) đến Biển Đông (109.6), 12.9-15.0N
# BBox chuẩn Google Maps: 107.3,13.0,109.6,15.0 (hiển thị Quy Nhơn ven biển)
GIALAI_BBOX = "107.0,12.9,109.6,15.0"

VILLAGES = [
    {"id": "v1", "commune": "Xã Ia Púch", "code": "GL-100", "village": "Điểm Ia Púch", "coords": [107.65, 13.55], "population": 3200, "origin": "reference-sample"},
    {"id": "v2", "commune": "Xã Ia Băng", "code": "GL-76", "village": "Điểm Ia Băng", "coords": [107.60, 13.52], "population": 2100, "origin": "reference-sample"},
    {"id": "v3", "commune": "Xã Ia Púch", "code": "GL-100", "village": "Thôn 1", "coords": [107.68, 13.58], "population": 800, "origin": "reference-sample"},
    {"id": "v4", "commune": "Phường Pleiku", "code": "GL-126", "village": "Khu vực Pleiku", "coords": [108.00, 13.98], "population": 15000, "origin": "reference-sample"},
    {"id": "v5", "commune": "Xã Krong", "code": "GL-113", "village": "Khu A", "coords": [108.45, 14.25], "population": 500, "origin": "reference-sample"},
    {"id": "v6", "commune": "Xã Krong", "code": "GL-113", "village": "Khu B", "coords": [108.48, 14.28], "population": 450, "origin": "reference-sample"},
    {"id": "v7", "commune": "Phường An Bình", "code": "GL-19", "village": "Phường An Bình", "coords": [108.65, 13.95], "population": 8000, "origin": "reference-sample"},
    {"id": "v8", "commune": "Xã Kim Sơn", "code": "GL-108", "village": "Điểm Kim Sơn", "coords": [108.90, 14.25], "population": 2800, "origin": "reference-sample"},
    {"id": "v9", "commune": "Xã Ân Tường", "code": "GL-32", "village": "Thôn 2", "coords": [108.92, 14.27], "population": 600, "origin": "reference-sample"},
    {"id": "v10", "commune": "Phường Quy Nhơn", "code": "GL-128", "village": "Phường Quy Nhơn", "coords": [109.21, 13.78], "population": 180000, "origin": "reference-sample"},
    {"id": "v11", "commune": "Phường Bình Định", "code": "GL-39", "village": "Phường Bình Định", "coords": [109.01, 13.89], "population": 52000, "origin": "reference-sample"},
    {"id": "v12", "commune": "Xã Phù Mỹ Nam", "code": "GL-122", "village": "Điểm Phù Mỹ Nam", "coords": [109.05, 14.15], "population": 12000, "origin": "reference-sample"},
    {"id": "v13", "commune": "Phường Bồng Sơn", "code": "GL-45", "village": "Phường Bồng Sơn", "coords": [109.02, 14.42], "population": 35000, "origin": "reference-sample"},
    {"id": "v14", "commune": "Xã Xuân An", "code": "GL-150", "village": "Điểm Xuân An", "coords": [109.15, 13.95], "population": 8000, "origin": "reference-sample"},
    {"id": "v15", "commune": "Xã Vĩnh Quang", "code": "GL-146", "village": "Điểm Vĩnh Quang", "coords": [108.80, 14.05], "population": 4000, "origin": "reference-sample"},
    {"id": "v16", "commune": "Xã Ya Hội", "code": "GL-151", "village": "Thôn Trung Tâm", "coords": [108.68, 13.92], "population": 1200, "origin": "reference-sample"},
    {"id": "v17", "commune": "Xã Ia Grai", "code": "GL-82", "village": "Thôn Ia Chía", "coords": [107.85, 13.95], "population": 1500, "origin": "reference-sample"},
    {"id": "v18", "commune": "Xã KDang", "code": "GL-107", "village": "Điểm KDang", "coords": [108.20, 14.02], "population": 3000, "origin": "reference-sample"},
    {"id": "v19", "commune": "Xã Tơ Tung", "code": "GL-138", "village": "Điểm Tơ Tung", "coords": [108.55, 14.10], "population": 2500, "origin": "reference-sample"},
    {"id": "v20", "commune": "Xã Chư Sê", "code": "GL-55", "village": "Điểm Chư Sê", "coords": [108.15, 13.65], "population": 4000, "origin": "reference-sample"},
]

def haversine(lon1, lat1, lon2, lat2):
    R=6371
    dlat=math.radians(lat2-lat1)
    dlon=math.radians(lon2-lon1)
    a=math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    c=2*math.asin(math.sqrt(a))
    return R*c


def _positions(node):
    if isinstance(node, (list, tuple)) and len(node) >= 2 and all(
        isinstance(value, (int, float)) for value in node[:2]
    ):
        yield float(node[0]), float(node[1])
    elif isinstance(node, (list, tuple)):
        for child in node:
            yield from _positions(child)


def _point_on_segment(lon, lat, start, end):
    x1, y1 = start[:2]
    x2, y2 = end[:2]
    cross = (lon - x1) * (y2 - y1) - (lat - y1) * (x2 - x1)
    if abs(cross) > 1e-10:
        return False
    return min(x1, x2) - 1e-10 <= lon <= max(x1, x2) + 1e-10 and min(y1, y2) - 1e-10 <= lat <= max(y1, y2) + 1e-10


def _point_in_ring(lon, lat, ring):
    inside = False
    for index, start in enumerate(ring):
        end = ring[(index + 1) % len(ring)]
        if _point_on_segment(lon, lat, start, end):
            return True
        x1, y1 = start[:2]
        x2, y2 = end[:2]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _polygon_contains(lon, lat, polygon):
    if not polygon or not _point_in_ring(lon, lat, polygon[0]):
        return False
    return not any(_point_in_ring(lon, lat, ring) for ring in polygon[1:])


@lru_cache(maxsize=1)
def _commune_boundary_index():
    from app.services.spread import load_commune_shapes

    index = []
    for commune in load_commune_shapes():
        geometry = commune.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        positions = list(_positions(coordinates))
        if not positions:
            continue
        index.append((
            min(point[0] for point in positions), max(point[0] for point in positions),
            min(point[1] for point in positions), max(point[1] for point in positions),
            commune, geometry,
        ))
    return index


@lru_cache(maxsize=1)
def _province_boundary():
    path = os.path.join(os.path.dirname(__file__), "..", "data", "gialai_province.geojson")
    try:
        with open(path, encoding="utf-8") as source:
            collection = json.load(source)
        feature = (collection.get("features") or [])[0]
        return feature.get("properties", {}).get("name"), feature.get("geometry")
    except (OSError, ValueError, IndexError, AttributeError):
        return None, None


def _geometry_contains(lon, lat, geometry):
    if not geometry:
        return False
    coordinates = geometry.get("coordinates") or []
    polygons = [coordinates] if geometry.get("type") == "Polygon" else coordinates
    return any(_polygon_contains(lon, lat, polygon) for polygon in polygons)


@lru_cache(maxsize=4096)
def resolve_commune_by_boundary(lon: float, lat: float):
    """Return a commune only when the FIRMS point falls inside its cached polygon."""
    for min_lon, max_lon, min_lat, max_lat, commune, geometry in _commune_boundary_index():
        if not (min_lon <= lon <= max_lon and min_lat <= lat <= max_lat):
            continue
        coordinates = geometry.get("coordinates") or []
        polygons = [coordinates] if geometry.get("type") == "Polygon" else coordinates
        if any(_polygon_contains(lon, lat, polygon) for polygon in polygons):
            return {"code": commune.get("code"), "commune": commune.get("name")}
    return None


@lru_cache(maxsize=4096)
def resolve_admin_location(lon: float, lat: float):
    commune = resolve_commune_by_boundary(lon, lat)
    province_name, province_geometry = _province_boundary()
    inside_province = _geometry_contains(lon, lat, province_geometry)
    return {
        "province": province_name if inside_province else None,
        "province_verified_by_boundary": inside_province,
        "district": None,
        "commune": commune["commune"] if commune else None,
        "verified_by_boundary": commune is not None,
        "commune_code": commune["code"] if commune else None,
    }


def hotspot_identity(fire: Dict, lat: float, lon: float) -> str:
    hotspot_id = fire.get("id") or fire.get("hotspot_id")
    if hotspot_id:
        return str(hotspot_id)
    identity = f"{lat:.6f}:{lon:.6f}:{fire.get('acq_date') or ''}:{fire.get('acq_time') or ''}"
    return "firms-" + hashlib.sha1(identity.encode()).hexdigest()[:16]


def nearest_village_reference(lon: float, lat: float):
    distance, village = min(
        ((haversine(v["coords"][0], v["coords"][1], lon, lat), v) for v in VILLAGES),
        key=lambda pair: pair[0],
    )
    if distance > 20:
        return None
    return {
        "name": village["village"],
        "commune": village["commune"],
        "coordinates": list(village["coords"]),
        "distance_km": round(distance, 1),
        "origin": village.get("origin", "reference-sample"),
    }


def fire_event_contract(fire: Dict, lat: float, lon: float, source_status: str,
                        location: Dict, village_reference: Dict | None) -> Dict:
    acq_date = fire.get("acq_date")
    acq_time = fire.get("acq_time")
    timeline = []
    if isinstance(acq_date, str) and isinstance(acq_time, str) and len(acq_time) == 4 and acq_time.isdigit():
        timeline.append({
            "time": f"{acq_date}T{acq_time[:2]}:{acq_time[2:]}:00Z",
            "event": "NASA FIRMS phát hiện điểm nhiệt",
            "source": "NASA FIRMS",
        })
    hotspot_id = hotspot_identity(fire, lat, lon)
    return {
        "event_id": hotspot_id,
        "hotspot_id": hotspot_id,
        "status": "NGHI_NGO",
        "detection": {
            "source": "NASA FIRMS",
            "source_status": source_status,
            "latitude": lat,
            "longitude": lon,
            "acq_date": acq_date,
            "acq_time": acq_time,
            "confidence": fire.get("confidence"),
            "satellite": fire.get("satellite"),
            "instrument": fire.get("instrument"),
        },
        "location": location,
        "village_reference": village_reference,
        "evidence": {
            "firms": source_status in ("LIVE", "CACHED", "STALE"),
            "sentinel2": None,
            "sentinel1": None,
            "weather": None,
            "field_photo": None,
            "community_report": None,
        },
        "ai_analysis": None,
        "verification": {"verified": False, "verified_by": None, "verified_at": None, "method": None},
        "timeline": timeline,
    }


def attach_admin_locations(fires: List[Dict], source_status: str | None) -> List[Dict]:
    if source_status not in ("LIVE", "CACHED", "STALE"):
        return [dict(fire) for fire in fires]
    out = []
    for fire in fires:
        try:
            lat = float(fire.get("latitude", fire.get("lat")))
            lon = float(fire.get("longitude", fire.get("lon")))
            if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
                continue
        except (TypeError, ValueError):
            continue
        location = resolve_admin_location(lon, lat)
        village_reference = nearest_village_reference(lon, lat)
        event = fire_event_contract(fire, lat, lon, source_status, location, village_reference)
        out.append({
            **fire,
            "hotspot_id": hotspot_identity(fire, lat, lon),
            "location": location,
            "village_reference": village_reference,
            "event": event,
        })
    return out


def check_villages_within_20km(fires: List[Dict], source_status: str | None = None) -> List[Dict]:
    if source_status is not None and source_status not in ("LIVE", "CACHED", "STALE"):
        return []
    alerts = []
    for fire in fires:
        if fire.get("suspect_artificial"):
            continue
        try:
            flat = float(fire.get("latitude", fire.get("lat")))
            flon = float(fire.get("longitude", fire.get("lon")))
            if not (math.isfinite(flat) and math.isfinite(flon) and -90 <= flat <= 90 and -180 <= flon <= 180):
                continue
        except (TypeError, ValueError):
            continue

        village_reference = nearest_village_reference(flon, flat)
        if village_reference is None:
            continue

        hotspot_id = hotspot_identity(fire, flat, flon)
        location = resolve_admin_location(flon, flat)
        distance = village_reference["distance_km"]
        acq_date = fire.get("acq_date")
        acq_time = fire.get("acq_time")
        event = fire_event_contract(fire, flat, flon, source_status or "UNKNOWN", location, village_reference)
        alerts.append({
            "event": event,
            "hotspot_id": hotspot_id,
            "latitude": flat,
            "longitude": flon,
            "fire_coords": [flon, flat],
            "village_reference": village_reference,
            "location": location,
            "source_details": {"provider": "NASA FIRMS", "status": source_status},
            # Legacy fields remain for API compatibility. `commune` is now
            # polygon-resolved; `village` explicitly refers to a sample point.
            "village": village_reference["name"],
            "commune": location["commune"],
            "village_coords": village_reference["coordinates"],
            "distance_km": round(distance, 1),
            "acq_date": acq_date,
            "acq_time": acq_time,
            "confidence": fire.get("confidence"),
            "level": "CẢNH BÁO" if distance <= 5 else "THEO DÕI",
        })
    return alerts

def get_villages():
    return VILLAGES
