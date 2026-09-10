"""Village reference points + 20km fire notification.

VILLAGES are 20 hand-placed REFERENCE points (origin="reference-sample"),
NOT an exhaustive thôn list — Gia Lai has 1000+ real villages without a
published boundary dataset. Each point is linked to its real containing
commune (verified by point-in-polygon over gialai_communes.geojson), so
alerts join real geography instead of pre-merger district names.
"""
import math
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

def check_villages_within_20km(fires: List[Dict]) -> List[Dict]:
    alerts=[]
    for v in VILLAGES:
        vlon, vlat = v["coords"]
        for f in fires:
            # Artificial-heat suspects (runways, industrial zones) never
            # raise village alerts — they are flagged, not trusted.
            if f.get("suspect_artificial"):
                continue
            flon = f.get("longitude") or f.get("lon") or 108.3
            flat = f.get("latitude") or f.get("lat") or 13.9
            dist = haversine(vlon, vlat, flon, flat)
            if dist <= 20:
                alerts.append({
                    "village": v["village"],
                    "commune": v["commune"],
                    "village_coords": v["coords"],
                    "fire_coords": [flon, flat],
                    "distance_km": round(dist,1),
                    "acq_date": f.get("acq_date"),
                    "confidence": f.get("confidence"),
                    "level": "CẢNH BÁO" if dist <= 5 else "THEO DÕI",
                })
                break
    return alerts

def get_villages():
    return VILLAGES
