import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.administrative import AdministrativeUnit
from app.schemas.administrative import AdministrativeUnitCreate

router = APIRouter()

@router.post("/administrative-units", status_code=201)
def create_unit(payload: AdministrativeUnitCreate, db: Session = Depends(get_db)):
    unit = AdministrativeUnit(
        name=payload.name,
        level=payload.level.upper(),
        parent_id=payload.parent_id,
        code=payload.code,
        is_demo=payload.is_demo,
    )
    if payload.geometry:
        try:
            unit.set_geometry(payload.geometry)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid geometry: {exc}")
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return {"id": unit.id, "name": unit.name, "level": unit.level, "is_demo": unit.is_demo}

@router.get("/administrative-units")
def list_units(level: str | None = None, parent_id: str | None = None, db: Session = Depends(get_db)):
    q = db.query(AdministrativeUnit)
    if level:
        q = q.filter(AdministrativeUnit.level == level.upper())
    if parent_id:
        q = q.filter(AdministrativeUnit.parent_id == parent_id)
    units = q.all()
    return [
        {"id": u.id, "name": u.name, "level": u.level, "parent_id": u.parent_id, "geometry": u.geometry_dict(), "is_demo": u.is_demo}
        for u in units
    ]

@router.get("/administrative-units/{unit_id}")
def get_unit(unit_id: str, db: Session = Depends(get_db)):
    u = db.get(AdministrativeUnit, unit_id)
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": u.id, "name": u.name, "level": u.level, "parent_id": u.parent_id, "geometry": u.geometry_dict(), "centroid": [u.centroid_lng, u.centroid_lat], "is_demo": u.is_demo}

@router.get("/administrative-units/{unit_id}/hierarchy")
def hierarchy(unit_id: str, db: Session = Depends(get_db)):
    """Return ancestors → self → descendants (Gia Lai → Xã → Thôn)."""
    u = db.get(AdministrativeUnit, unit_id)
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    ancestors = []
    cur = u
    while cur.parent_id:
        p = db.get(AdministrativeUnit, cur.parent_id)
        if not p:
            break
        ancestors.insert(0, {"id": p.id, "name": p.name, "level": p.level})
        cur = p
    children = db.query(AdministrativeUnit).filter(AdministrativeUnit.parent_id == unit_id).all()
    return {
        "unit": {"id": u.id, "name": u.name, "level": u.level},
        "ancestors": ancestors,
        "children": [{"id": c.id, "name": c.name, "level": c.level} for c in children],
    }
