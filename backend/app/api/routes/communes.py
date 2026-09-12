"""Commune single-source API (Module F) — every consumer resolves communes here."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import communes as cs

router = APIRouter(tags=["Communes"])


@router.get("/communes")
def list_communes(q: Optional[str] = Query(default=None),
                  limit: int = Query(default=100, ge=1, le=500),
                  db: Session = Depends(get_db)):
    rows = cs.get_communes(db, q=q, limit=limit)
    return {"communes": rows, "count": len(rows),
            "source": "administrative_units (DB) + dan_so (seed geojson)"}


@router.get("/communes/{key}")
def commune_detail(key: str, db: Session = Depends(get_db)):
    out = cs.get_commune(db, key)
    if not out:
        raise HTTPException(404, "Commune not found (id, GL-code, or exact name)")
    return out


@router.get("/communes/{key}/stats")
def commune_stats(key: str, db: Session = Depends(get_db)):
    out = cs.get_commune_stats(db, key)
    if not out:
        raise HTTPException(404, "Commune not found")
    return out


@router.get("/communes/{key}/assets")
def commune_assets(key: str, db: Session = Depends(get_db)):
    out = cs.get_commune_assets(db, key)
    if not out:
        raise HTTPException(404, "Commune not found")
    return out
