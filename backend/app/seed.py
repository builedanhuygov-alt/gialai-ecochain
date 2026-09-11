"""Demo seed — Gia Lai hierarchy + demo NDVI data (marked is_demo=True)."""
import json
import os
from datetime import datetime
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.administrative import AdministrativeUnit
from app.models.query_log import AutomationStatus
from app.core.enums import AdministrativeLevel


def _data_path(name: str) -> str:
    return os.path.join(os.path.dirname(__file__), "data", name)


_COMMUNES_CACHE: dict | None = None


def _load_communes() -> dict:
    """134 real communes/wards of merged Gia Lai (ma_xa, ten_xa, MultiPolygon).
    Parsed once per process — the file is ~4MB."""
    global _COMMUNES_CACHE
    if _COMMUNES_CACHE is None:
        with open(_data_path("gialai_communes.geojson"), encoding="utf-8") as f:
            _COMMUNES_CACHE = json.load(f)
    return _COMMUNES_CACHE


def _point_in_ring(lon: float, lat: float, ring) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1 + 1e-12) + x1:
            inside = not inside
    return inside


def _geom_contains(geom: dict, lon: float, lat: float) -> bool:
    polys = [geom["coordinates"]] if geom.get("type") == "Polygon" else geom.get("coordinates", [])
    for poly in polys:
        if poly and _point_in_ring(lon, lat, poly[0]):
            return True
    return False


def seed_real_communes(db: Session | None = None) -> dict:
    """Upsert the 134 REAL communes/wards (is_demo=False) + real province boundary.

    Returns {code: unit_id}. Idempotent (matched by stable code GL-<ma_xa>).
    Demo units (Xa A/B) are left untouched for existing tests/flows.
    """
    from app.models.administrative import AdministrativeUnit as AU
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        prov = db.query(AU).filter_by(code="GL").first()
        if prov is None:
            prov = AU(name="Gia Lai", level=AdministrativeLevel.PROVINCE.value, code="GL", is_demo=False)
            db.add(prov)
            db.flush()
        # real province boundary replaces the hand-drawn rectangle
        try:
            with open(_data_path("gialai_province.geojson"), encoding="utf-8") as f:
                pfc = json.load(f)
            feats = pfc.get("features", [pfc])
            g = feats[0].get("geometry", feats[0])
            prov.set_geometry(g)
        except Exception as exc:
            print(f"[seed] province boundary skipped: {exc}")
        existing = {u.code: u for u in db.query(AU).filter(AU.code.like("GL-%")).all()}
        added = 0
        for feat in _load_communes().get("features", []):
            props = feat.get("properties", {}) or {}
            code = f"GL-{props.get('ma_xa')}"
            if code in existing:
                continue
            u = AU(name=props.get("ten_xa") or code, level=AdministrativeLevel.COMMUNE.value,
                   parent_id=prov.id, code=code, is_demo=False)
            try:
                u.set_geometry(feat["geometry"])
            except Exception:
                pass
            db.add(u)
            existing[code] = u
            added += 1
        # Phường Thống Nhất (ma_xa 137) is missing from the source geojson —
        # seed it geometry-less so search/joins resolve it honestly instead of
        # 404ing. Map shows "134/135 boundaries" until its polygon is sourced.
        if "GL-137" not in existing:
            tn = AU(name="Phường Thống Nhất", level=AdministrativeLevel.COMMUNE.value,
                    parent_id=prov.id, code="GL-137", is_demo=False)
            db.add(tn)
            existing["GL-137"] = tn
            added += 1
        db.flush()
        print(f"[seed] real communes: +{added} new, {len(existing)} total with GL- codes")
        return {code: u.id for code, u in existing.items()}
    finally:
        if close:
            db.close()


def seed_historical_fires(code_by_unit: dict | None = None):
    """Vụ cháy thật Hè 2026 (nguồn: Cổng TTĐT tỉnh Gia Lai) — official warnings lịch sử.
    Level là ước tính biên tập theo mô tả (chờ phân loại chính thức của Kiểm lâm).

    Each fire is LINKED to its real commune unit (administrative_unit_id = the
    commune's UUID, resolved by exact commune name or by documented GPS coords
    via point-in-polygon). The join is enforced by FK + verified in tests.
    """
    from app.models.fire import OfficialFireWarning
    from app.models.administrative import AdministrativeUnit as AU
    db: Session = SessionLocal()
    try:
        if code_by_unit is None:
            code_by_unit = seed_real_communes(db)
        by_id = {u.id: u for u in db.query(AU).filter(AU.code.like("GL-%")).all()}
        by_name = {u.name: u for u in by_id.values()}

        def resolve(it: dict) -> str | None:
            if it.get("commune"):
                u = by_name.get(it["commune"])
                return u.id if u else None
            if it.get("lon") is not None:
                for u in by_id.values():
                    g = u.geometry_dict()
                    if g and _geom_contains(g, it["lon"], it["lat"]):
                        return u.id
            return None

        items = [
            dict(uid="phu-my-dong", commune="Xã Phù Mỹ Đông", level="V", source="Dân trí, VOV Tây Nguyên 22/7/2026, Sở NN&MT Gia Lai",
                 issued=datetime(2026, 7, 21, 21, 0),
                 scope="20-21/7/2026 cháy rừng dương (phi lao) phòng hộ ven biển tiểu khu 62, thôn Tân Phụng, xã Phù Mỹ Đông, ~30ha; phát hiện 13h20 20/7, khống chế rồi 23h bùng lại (tàn bay qua băng); 21/7 tổng lực ~500 người: PCCC 100+ CBCS +10 xe, BCHQS tỉnh 115, Quân khu 5, kiểm lâm, dân quân; khoanh vùng + băng trắng (vật liệu khô có tinh dầu, gió đổi hướng); kiểm soát 21h 21/7; đang điều tra nguyên nhân."),
            dict(uid="hoi-son-hoa-hoi", commune="Xã Hội Sơn", level="III", source="Cổng TTĐT tỉnh Gia Lai + Tiền Phong 24/8/2026",
                 issued=datetime(2026, 8, 22, 21, 0),
                 scope="7-8/2026 cháy thực bì + rừng trồng tiểu khu 213 (xã Hội Sơn, Hòa Hội); núi Đầu Voi thôn Cát Lâm xã Hội Sơn khống chế tối 22/8 (đồi cao, hiểm trở, gió lớn); đang thống kê diện tích."),
            dict(uid="hoai-an", commune="Xã Hoài Ân", level="III", source="UBND xã Hoài Ân (Tiền Phong 24/8/2026)",
                 issued=datetime(2026, 8, 24, 12, 0),
                 scope="23-24/8/2026 cháy rừng keo đèo Cây Cốc thôn An Chiểu, xã Hoài Ân; đã khống chế rồi bùng lại trưa 24/8; ~100 người + quân đội; nguyên nhân ban đầu: đốt thực bì; túc trực xử lý phát sinh."),
            dict(uid="vung-chua", lon=109.1956, lat=13.7389, level="IV", source="Báo Gia Lai post596298, Cổng ĐCS Gia Lai, Vietnam.vn",
                 issued=datetime(2026, 8, 27, 12, 0),
                 scope="Cuối 8/2026 cháy thực bì dưới bạch đàn TK330b/330c núi Vũng Chua (13°44'20\"N 109°11'45\"E), P. Ghềnh Ráng; dốc đứng xe CC không vào được; 500+ người + flycam; 4,23ha (đo đạc 30/8)."),
            dict(uid="cat-thanh", lon=109.1792, lat=14.0417, level="V", source="Báo Gia Lai post520560",
                 issued=datetime(2026, 6, 1, 12, 0),
                 scope="Cháy 133ha rừng trồng Núi Lỗ Gáo, Mũi Đá Mỏ, thôn Chánh Thắng, xã Cát Thành (14°02'30\"N 109°10'45\"E); dốc nhiều đá, còn bom mìn sót lại; vùng trọng điểm theo dõi."),
        ]
        by_source = {w.source: w for w in db.query(OfficialFireWarning).all()}
        for it in items:
            unit_id = resolve(it)
            if unit_id is None:
                print(f"[seed] WARNING: no commune found for fire {it['uid']} — keeping legacy slug (UNJOINED)")
                unit_id = it["uid"]
            w = by_source.get(it["source"])
            if w is None:
                db.add(OfficialFireWarning(administrative_unit_id=unit_id, level=it["level"],
                                           source=it["source"], issued_at=it["issued"], scope=it["scope"]))
            else:
                w.administrative_unit_id, w.level, w.issued_at, w.scope = unit_id, it["level"], it["issued"], it["scope"]
        db.commit()
    finally:
        db.close()


DEMO_GEOMETRIES = {
    "province_gia_lai": {
        "type": "Polygon",
        "coordinates": [[[108.0, 13.5], [108.8, 13.5], [108.8, 14.3], [108.0, 14.3], [108.0, 13.5]]],
    },
    "commune_a": {
        "type": "Polygon",
        "coordinates": [[[108.1, 13.7], [108.4, 13.7], [108.4, 13.9], [108.1, 13.9], [108.1, 13.7]]],
    },
    "village_1": {
        "type": "Polygon",
        "coordinates": [[[108.12, 13.72], [108.22, 13.72], [108.22, 13.8], [108.12, 13.8], [108.12, 13.72]]],
    },
    "village_2": {
        "type": "Polygon",
        "coordinates": [[[108.25, 13.72], [108.35, 13.72], [108.35, 13.8], [108.25, 13.8], [108.25, 13.72]]],
    },
    "commune_b": {
        "type": "Polygon",
        "coordinates": [[[108.45, 13.7], [108.75, 13.7], [108.75, 13.9], [108.45, 13.9], [108.45, 13.7]]],
    },
}


def seed_demo():
    db: Session = SessionLocal()
    try:
        if db.query(AdministrativeUnit).first():
            # units exist — still ensure fires are linked (idempotent)
            try:
                seed_historical_fires()
                seed_water_assets(db)
                db.commit()
            except Exception as exc:
                print(f"[seed] historical fires skipped: {exc}")
            return  # already seeded
        province = AdministrativeUnit(name="Gia Lai", level=AdministrativeLevel.PROVINCE.value, code="GL", is_demo=True)
        province.set_geometry(DEMO_GEOMETRIES["province_gia_lai"])
        db.add(province)
        db.flush()

        commune_a = AdministrativeUnit(name="Xã A (Demo)", level=AdministrativeLevel.COMMUNE.value, parent_id=province.id, code="GL-XA-A", is_demo=True)
        commune_a.set_geometry(DEMO_GEOMETRIES["commune_a"])
        db.add(commune_a)
        db.flush()

        v1 = AdministrativeUnit(name="Thôn 1 (Demo)", level=AdministrativeLevel.VILLAGE.value, parent_id=commune_a.id, code="GL-XA-A-T1", is_demo=True)
        v1.set_geometry(DEMO_GEOMETRIES["village_1"])
        db.add(v1)

        v2 = AdministrativeUnit(name="Thôn 2 (Demo)", level=AdministrativeLevel.VILLAGE.value, parent_id=commune_a.id, code="GL-XA-A-T2", is_demo=True)
        v2.set_geometry(DEMO_GEOMETRIES["village_2"])
        db.add(v2)

        commune_b = AdministrativeUnit(name="Xã B (Demo)", level=AdministrativeLevel.COMMUNE.value, parent_id=province.id, code="GL-XA-B", is_demo=True)
        commune_b.set_geometry(DEMO_GEOMETRIES["commune_b"])
        db.add(commune_b)
        db.flush()  # ensure IDs for monitored areas

        # Automation status seed
        db.add(AutomationStatus(agent_name="ForestGuard", status="ONLINE"))
        db.add(AutomationStatus(agent_name="EarthEngine", status="NOT_CONFIGURED"))

        # Monitored areas — Sec 29 priority
        from app.models.ops import MonitoredArea
        db.add(MonitoredArea(administrative_unit_id=commune_a.id, is_priority=True, priority_reason="Demo high priority — fire history"))
        db.add(MonitoredArea(administrative_unit_id=v1.id, is_priority=False))
        db.add(MonitoredArea(administrative_unit_id=v2.id, is_priority=False))
        db.add(MonitoredArea(administrative_unit_id=commune_b.id, is_priority=False))

        db.commit()
        print("[seed] Demo hierarchy created: Gia Lai -> Xa A/B -> Thon 1/2 (with monitored areas)")
        # real communes + link historical fires to them (idempotent)
        try:
            seed_real_communes(db)
            db.commit()
            seed_historical_fires()
            seed_water_assets(db)
            db.commit()
        except Exception as exc:
            print(f"[seed] real communes/fires skipped: {exc}")
    finally:
        db.close()


# 16 real water assets (operator inventory). google_maps_url values from the
# source sheet were all dead goo.gl links (Google shut goo.gl down) — stored
# as NULL rather than shipping known-dead links. has_streetview kept as given.
WATER_ASSETS = [
    # name, type, lon, lat, commune, district, capacity_m3, area_ha, manager, road, streetview, status
    ("Ayun Hạ", "reservoir", 108.2430, 13.5650, "Phú Thiện", "Phú Thiện", 253000000, 3700.0, "Cty TNHH MTV Khai thác CTTL", True, False, "verified"),
    ("Ia Mơr", "reservoir", 107.6500, 13.2500, "Ia Mơr", "Chư Prông", 177000000, 2800.0, "Ban QLDA Thủy lợi 8", True, False, "verified"),
    ("Biển Hồ (T'Nưng)", "lake", 108.0000, 14.0530, "Biển Hồ", "Pleiku", 40000000, 228.0, "UBND TP Pleiku", True, True, "verified"),
    ("Ia Ring (Vòng Ia)", "irrigation", 108.1060, 13.7220, "Ia Tiêm", "Chư Sê", 10000000, 70.0, "Chi cục Thủy lợi", True, False, "verified"),
    ("An Khê", "hydro", 108.6650, 13.9850, "Cửu An", "An Khê", 5600000, 361.0, "EVN", True, False, "verified"),
    ("Ka Nak", "hydro", 108.5630, 14.2380, "TT Kbang", "Kbang", 313000000, 1431.0, "EVN", True, False, "verified"),
    ("Plei Krông", "hydro", 107.8680, 14.4080, "Sa Bình", "Sa Thầy", 1040000000, 5300.0, "EVN", True, True, "verified"),
    ("Ialy", "hydro", 107.8280, 14.2250, "Ialy", "Chư Păh", 1037000000, 6450.0, "EVN", True, True, "verified"),
    ("Định Bình", "reservoir", 108.7900, 14.0320, "Vĩnh Hảo", "Vĩnh Thạnh", 226000000, 1200.0, "Ban QLDA Thủy lợi 7", True, False, "verified"),
    ("Hội Sơn", "reservoir", 109.0200, 14.0620, "Cát Sơn", "Phù Cát", 44000000, 450.0, "Chi cục Thủy lợi", True, False, "verified"),
    ("Thuận Ninh", "reservoir", 108.8350, 13.9100, "Bình Tân", "Tây Sơn", 35000000, 380.0, "Chi cục Thủy lợi", True, False, "verified"),
    ("Vạn Hội", "reservoir", 108.9720, 14.2880, "Ân Tín", "Hoài Ân", 14000000, 150.0, "Chi cục Thủy lợi", True, False, "verified"),
    ("Đồng Mít", "reservoir", 108.8750, 14.3980, "An Dũng", "An Lão", 90000000, 500.0, "Ban QLDA Thủy lợi 8", True, False, "verified"),
    ("Núi Một", "reservoir", 108.9650, 13.8400, "Nhơn Tân", "An Nhơn", 110000000, 1200.0, "Chi cục Thủy lợi", True, False, "verified"),
    ("Hồ Bầu Cạn", "lake", 107.9250, 13.8010, "Bàu Cạn", "Chư Prông", None, None, "UBND Xã Bàu Cạn", True, False, "cần xác minh"),
    ("Hồ Ia Hrung", "lake", 107.8810, 13.9920, "Ia Hrung", "Ia Grai", None, None, "UBND Xã Ia Hrung", False, False, "cần xác minh"),
]


def seed_water_assets(db: Session | None = None) -> int:
    """Upsert the 16 curated water assets; resolve commune_code by polygon."""
    from app.models.water import WaterAsset
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        existing = {w.name: w for w in db.query(WaterAsset).all()}
        units = [(u.code, u.geometry_dict()) for u in
                 db.query(AdministrativeUnit).filter_by(level=AdministrativeLevel.COMMUNE.value).all()]
        n = 0
        for (name, atype, lon, lat, commune, district, cap, area, manager, road, sv, status) in WATER_ASSETS:
            code = None
            for ucode, geom in units:
                try:
                    if geom and _geom_contains(geom, lon, lat):
                        code = ucode
                        break
                except Exception:
                    continue
            w = existing.get(name)
            if w is None:
                db.add(WaterAsset(name=name, asset_type=atype, longitude=lon, latitude=lat,
                                  commune=commune, district=district, province="Gia Lai",
                                  capacity_m3=cap, water_area_ha=area, manager=manager,
                                  road_access=bool(road), status=status,
                                  google_maps_url=None, has_streetview=bool(sv),
                                  commune_code=code))
                n += 1
            else:
                w.commune_code = w.commune_code or code
        db.flush()
        print(f"[seed] water assets: +{n} new")
        return n
    finally:
        if close:
            db.close()
