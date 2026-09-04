"""Village/Commune delineation + 20km fire notification — Gia Lai mới (sáp nhập Bình Định 2025)"""
import math
from typing import List, Dict

# Gia Lai mới: 15,536 km2, 58 xã/phường — từ biên Campuchia (107.0) đến Biển Đông (109.6), 12.9-15.0N
# BBox chuẩn Google Maps: 107.3,13.0,109.6,15.0 (hiển thị Quy Nhơn ven biển)
GIALAI_BBOX = "107.0,12.9,109.6,15.0"

VILLAGES = [
    # Tây Nguyên — Huyện Chư Prông (biên Campuchia)
    {"id": "v1", "commune": "Huyện Chư Prông", "village": "Xã Ia Mơr", "coords": [107.65, 13.55], "population": 3200},
    {"id": "v2", "commune": "Huyện Chư Prông", "village": "Xã Ia Băng", "coords": [107.60, 13.52], "population": 2100},
    {"id": "v3", "commune": "Huyện Chư Prông", "village": "Thôn 1", "coords": [107.68, 13.58], "population": 800},
    # Pleiku trung tâm tỉnh
    {"id": "v4", "commune": "TP Pleiku", "village": "Phường Diên Hồng", "coords": [108.00, 13.98], "population": 15000},
    {"id": "v5", "commune": "Vườn Quốc gia Kon Ka Kinh", "village": "Khu A", "coords": [108.45, 14.25], "population": 500},
    {"id": "v6", "commune": "Vườn Quốc gia Kon Ka Kinh", "village": "Khu B", "coords": [108.48, 14.28], "population": 450},
    # An Khê — cửa ngõ Tây Nguyên
    {"id": "v7", "commune": "TX An Khê", "village": "Phường An Bình", "coords": [108.65, 13.95], "population": 8000},
    {"id": "v8", "commune": "Huyện Krông Chro", "village": "Xã Đak Sơmei", "coords": [108.90, 14.25], "population": 2800},
    {"id": "v9", "commune": "Huyện Krông Chro", "village": "Thôn 2", "coords": [108.92, 14.27], "population": 600},
    # Đông — ven biển Bình Định cũ (nay thuộc Gia Lai)
    {"id": "v10", "commune": "TP Quy Nhơn", "village": "Phường Quy Nhơn", "coords": [109.21, 13.78], "population": 180000},
    {"id": "v11", "commune": "TX An Nhơn", "village": "Phường Bình Định", "coords": [109.01, 13.89], "population": 52000},
    {"id": "v12", "commune": "Huyện Phù Mỹ", "village": "Xã Mỹ Thọ", "coords": [109.05, 14.15], "population": 12000},
    {"id": "v13", "commune": "Huyện Hoài Nhơn", "village": "Phường Bồng Sơn", "coords": [109.02, 14.42], "population": 35000},
    {"id": "v14", "commune": "Huyện Tuy Phước", "village": "Xã Phước Sơn", "coords": [109.15, 13.95], "population": 8000},
    {"id": "v15", "commune": "Huyện Vĩnh Thạnh", "village": "Xã Vĩnh Thịnh", "coords": [108.80, 14.05], "population": 4000},
    # Trung tâm
    {"id": "v16", "commune": "Xã Hội Sơn", "village": "Thôn Trung Tâm", "coords": [108.68, 13.92], "population": 1200},
    {"id": "v17", "commune": "Xã Ia Grai", "village": "Thôn Ia Chía", "coords": [107.85, 13.95], "population": 1500},
    {"id": "v18", "commune": "Huyện Mang Yang", "village": "Xã Đak Trôi", "coords": [108.20, 14.02], "population": 3000},
    {"id": "v19", "commune": "Huyện Kbang", "village": "Xã Kông Bờ La", "coords": [108.55, 14.10], "population": 2500},
    {"id": "v20", "commune": "Huyện Phú Thiện", "village": "Xã Ia Sol", "coords": [108.15, 13.65], "population": 4000},
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
