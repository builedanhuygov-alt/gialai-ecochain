"""Demo seed — Gia Lai hierarchy + demo NDVI data (marked is_demo=True)."""
import json
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.administrative import AdministrativeUnit
from app.models.query_log import AutomationStatus
from app.core.enums import AdministrativeLevel


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

        # Automation status seed
        db.add(AutomationStatus(agent_name="ForestGuard", status="ONLINE"))
        db.add(AutomationStatus(agent_name="EarthEngine", status="NOT_CONFIGURED"))

        db.commit()
        print("[seed] Demo hierarchy created: Gia Lai -> Xa A/B -> Thon 1/2")
    finally:
        db.close()
