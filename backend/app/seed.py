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
        except Exception as exc:
            print(f"[seed] real communes/fires skipped: {exc}")
    finally:
        db.close()
