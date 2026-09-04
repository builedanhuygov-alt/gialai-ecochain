"""Demo seed — Gia Lai hierarchy + demo NDVI data (marked is_demo=True)."""
import json
from datetime import datetime
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.administrative import AdministrativeUnit
from app.models.query_log import AutomationStatus
from app.core.enums import AdministrativeLevel


def seed_historical_fires():
    """Vụ cháy thật Hè 2026 (nguồn: Cổng TTĐT tỉnh Gia Lai) — official warnings lịch sử.
    Level là ước tính biên tập theo mô tả (chờ phân loại chính thức của Kiểm lâm)."""
    from app.models.fire import OfficialFireWarning
    db: Session = SessionLocal()
    try:
        existing = {w.administrative_unit_id for w in db.query(OfficialFireWarning).all()}
        items = [
            dict(uid="phu-my-dong", level="V", source="Cổng TTĐT tỉnh Gia Lai",
                 issued=datetime(2026, 7, 21, 20, 30),
                 scope="21/7/2026 cháy rừng dương thôn Tân Phụng, xã Phù Mỹ Đông; nắng nóng kéo dài + gió mạnh, lan nhanh; 378 CBCS (Bộ CHQS tỉnh, Ban CHQS xã, Đồn BP Mỹ An, Trung đoàn 739, Lữ đoàn PB 572, 18 kiểm lâm, 6 xe chữa cháy); khống chế 20h30 cùng ngày."),
            dict(uid="hoi-son-hoa-hoi", level="III", source="Cổng TTĐT tỉnh Gia Lai",
                 issued=datetime(2026, 8, 15, 12, 0),
                 scope="7-8/2026 cháy thực bì + rừng trồng sản xuất tiểu khu 213, xã Hội Sơn và Hòa Hội; lực lượng chức năng dập khẩn trương, ngăn lan rộng."),
        ]
        for it in items:
            if it["uid"] in existing:
                continue
            db.add(OfficialFireWarning(administrative_unit_id=it["uid"], level=it["level"],
                                       source=it["source"], issued_at=it["issued"], scope=it["scope"]))
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
    try:
        seed_historical_fires()
    except Exception as exc:
        print(f"[seed] historical fires skipped: {exc}")
    db: Session = SessionLocal()
    try:
        if db.query(AdministrativeUnit).first():
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
    finally:
        db.close()
