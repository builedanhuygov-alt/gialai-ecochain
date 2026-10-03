"""CommuneService (Module F) — single source of truth for commune data.

DB table `administrative_units` (139 real communes, geometry + centroid +
area) is the canonical store; the seed geojson supplies demographics
(dan_so) that have no DB column. Every caller — AI Analyst, threatened
communities, timeline, response plan, shield scoring — resolves communes
through here so Map/API/Analyst can never disagree on names, codes,
population or joins.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache

_DEMO_CACHE: dict | None = None


def _demographics() -> dict:
    """dan_so + ten_xa per GL code from the seed geojson (same file seed uses)."""
    global _DEMO_CACHE
    if _DEMO_CACHE is not None:
        return _DEMO_CACHE
    path = os.path.join(os.path.dirname(__file__), "..", "data", "gialai_communes.geojson")
    out: dict = {}
    try:
        with open(path, encoding="utf-8") as f:
            fc = json.load(f)
        for feat in fc.get("features", []) or []:
            p = feat.get("properties", {}) or {}
            code = f"GL-{p.get('ma_xa')}"
            try:
                pop = int(str(p.get("dan_so") or "").replace(".", "").replace(",", "").strip())
            except Exception:
                pop = None
            try:
                area = float(str(p.get("dtich_km2") or "").strip())
            except Exception:
                area = None
            out[code] = {"population": pop, "area_km2": area, "name": p.get("ten_xa")}
    except Exception:
        pass
    _DEMO_CACHE = out
    return out


def get_commune(db, key: str | None) -> dict | None:
    """Resolve by unit id, GL code, or exact name. None when unknown."""
    from app.models.administrative import AdministrativeUnit
    if not key:
        return None
    unit = AdministrativeUnit.resolve_unit(db, key)
    if unit is None:
        unit = db.query(AdministrativeUnit).filter_by(name=key).first()
    if unit is None:
        return None
    demo = _demographics().get(unit.code or "", {})
    return shape_unit(unit, demo)


def shape_unit(unit, demo: dict | None = None) -> dict:
    demo = demo if demo is not None else _demographics().get(unit.code or "", {})
    geom = unit.geometry_dict()
    return {
        "id": unit.id, "code": unit.code, "name": unit.name, "level": unit.level,
        "population": demo.get("population"),
        "population_status": "VERIFIED" if demo.get("population") is not None else "MISSING",
        "area_km2": demo.get("area_km2"),
        "area_ha": unit.area_ha,
        "centroid": ([unit.centroid_lat, unit.centroid_lng]
                     if unit.centroid_lat is not None else None),
        "has_geometry": geom is not None,
        "is_demo": bool(unit.is_demo),
    }


def get_communes(db, q: str | None = None, limit: int = 100) -> list:
    """Real communes only (is_demo=False), optional name/code substring."""
    from app.models.administrative import AdministrativeUnit
    from app.core.enums import AdministrativeLevel
    query = db.query(AdministrativeUnit).filter_by(
        level=AdministrativeLevel.COMMUNE.value, is_demo=False)
    if q:
        like = f"%{q}%"
        query = query.filter((AdministrativeUnit.name.like(like))
                             | (AdministrativeUnit.code.like(like)))
    demo = _demographics()
    return [shape_unit(u, demo.get(u.code or "", {}))
            for u in query.order_by(AdministrativeUnit.name).limit(limit).all()]


def get_commune_stats(db, key: str) -> dict | None:
    """Counts joined on the resolved unit — all from DB, never invented."""
    from app.models.administrative import AdministrativeUnit
    from app.models.risk import Alert, Incident
    from app.models.pipeline import DataProposal
    from app.models.ops import MonitoredArea
    unit = AdministrativeUnit.resolve_unit(db, key)
    if unit is None:
        unit = db.query(AdministrativeUnit).filter_by(name=key).first()
    if unit is None:
        return None
    return {
        **shape_unit(unit),
        "alerts_active": db.query(Alert).filter_by(
            administrative_unit_id=unit.id, status="ACTIVE").count(),
        "incidents": db.query(Incident).filter_by(
            administrative_unit_id=unit.id).count(),
        "proposals": db.query(DataProposal).filter_by(
            administrative_unit_id=unit.id).count(),
        "monitored": db.query(MonitoredArea).filter_by(
            administrative_unit_id=unit.id).first() is not None,
    }


def get_commune_assets(db, key: str) -> dict | None:
    """Assets linked to a commune: ops (commune/district fields), water
    (commune_code/code), photos via proposals in the unit. Counts + ids."""
    from app.models.administrative import AdministrativeUnit
    from app.models.community import PhotoEvidence
    from app.models.ops import OperationalAsset
    from app.models.pipeline import DataProposal
    from app.models.water import WaterAsset
    unit = AdministrativeUnit.resolve_unit(db, key)
    if unit is None:
        unit = db.query(AdministrativeUnit).filter_by(name=key).first()
    if unit is None:
        return None
    ops_rows = db.query(OperationalAsset).filter(
        (OperationalAsset.commune == unit.name)
        | (OperationalAsset.district == unit.name)).all()
    waters = db.query(WaterAsset).filter(
        (WaterAsset.commune_code == unit.code)
        | (WaterAsset.commune == unit.name)).all()
    prop_ids = [p.id for p in db.query(DataProposal).filter_by(
        administrative_unit_id=unit.id).all()]
    photos = (db.query(PhotoEvidence).filter(
        PhotoEvidence.proposal_id.in_(prop_ids)).all() if prop_ids else [])
    return {
        "commune": shape_unit(unit),
        "operational_assets": [{"id": a.id, "name": a.name, "asset_type": a.asset_type,
                                "status": a.status} for a in ops_rows],
        "water_assets": [{"id": w.id, "name": w.name, "asset_type": w.asset_type,
                          "status": w.status} for w in waters],
        "photos": [{"id": p.id, "verification_status": getattr(p, "verification_status", "PENDING"),
                    "is_duplicate": p.is_duplicate} for p in photos],
        "counts": {"operational": len(ops_rows), "water": len(waters),
                   "photos": len(photos)},
    }
