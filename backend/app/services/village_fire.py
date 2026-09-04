"""Village/Commune delineation + 20km fire notification"""
import math
from typing import List, Dict

# Gia Lai villages/communes with real coordinates (approx)
VILLAGES = [
    {"id": "v1", "commune": "Huyện Chư Prông", "village": "Xã Ia Mơr", "coords": [107.65, 13.55], "population": 3200},
    {"id": "v2", "commune": "Huyện Chư Prông", "village": "Thôn 1", "coords": [107.68, 13.58], "population": 800},
    {"id": "v3", "commune": "Vườn Quốc gia Kon Ka Kinh", "village": "Khu A", "coords": [108.45, 14.25], "population": 500},
    {"id": "v4", "commune": "Vườn Quốc gia Kon Ka Kinh", "village": "Khu B", "coords": [108.48, 14.28], "population": 450},
    {"id": "v5", "commune": "Huyện Krông Chro", "village": "Xã Đak Sơmei", "coords": [108.90, 14.25], "population": 2800},
    {"id": "v6", "commune": "Huyện Krông Chro", "village": "Thôn 2", "coords": [108.92, 14.27], "population": 600},
    {"id": "v7", "commune": "Xã Hội Sơn", "village": "Thôn Trung Tâm", "coords": [108.68, 13.92], "population": 1200},
    {"id": "v8", "commune": "Xã Ia Grai", "village": "Thôn Ia Chía", "coords": [107.85, 13.95], "population": 1500},
    {"id": "v9", "commune": "Huyện Chư Prông", "village": "Xã Ia Băng", "coords": [107.60, 13.52], "population": 2100},
    {"id": "v10", "commune": "Xã A", "village": "Thôn 2", "coords": [107.70, 13.60], "population": 900},
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
