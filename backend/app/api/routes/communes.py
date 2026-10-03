"""Commune single-source API (Module F) — every consumer resolves communes here."""
import unicodedata
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import communes as cs

router = APIRouter(tags=["Communes"])


def _strip_vi(text: str) -> str:
    """Lowercase ASCII fold for Vietnamese (diacritics-insensitive search)."""
    norm = unicodedata.normalize("NFD", text or "")
    out = "".join(ch for ch in norm if unicodedata.category(ch) != "Mn")
    return out.replace("đ", "d").replace("Đ", "D").lower()


@router.get("/search/global")
def search_global(q: str = Query(default=""), limit: int = Query(default=20, ge=1, le=100),
                 db: Session = Depends(get_db)):
    """Real DB lookup across administrative units; diacritics-insensitive."""
    from app.models.administrative import AdministrativeUnit
    needle = _strip_vi(q.strip())
    code_needle = (q or "").strip().lower()
    results = []
    if needle:
        units = db.query(AdministrativeUnit).limit(5000).all()
        for u in units:
            name_hit = needle in _strip_vi(u.name or "")
            code_hit = bool(code_needle) and code_needle in (u.code or "").lower()
            if name_hit or code_hit:
                results.append({"id": u.id, "name": u.name,
                                "level": u.level, "code": u.code,
                                "is_demo": bool(u.is_demo)})
                if len(results) >= limit:
                    break
        results.sort(key=lambda h: (h["is_demo"], h["name"] or ""))
    return {"results": results, "count": len(results)}


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
