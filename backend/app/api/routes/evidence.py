"""Unified evidence endpoints (Modules A–D, H).

POST /api/evidence serves every source (proposal/citizen/incident/field);
per-source shortcuts remain for backward compat. Verification is admin-only.
Gallery links photos to incidents explicitly — never by proximity guess.
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_role
from app.database import get_db
from app.services import evidence as ev

router = APIRouter(tags=["Evidence"])


@router.post("/evidence")
def upload_evidence(file: UploadFile = File(...),
                    source: str = Form(...),
                    source_id: Optional[str] = Form(None),
                    uploader_id: str = Form(...),
                    lat: Optional[float] = Form(None),
                    lng: Optional[float] = Form(None),
                    capture_time: Optional[str] = Form(None),
                    db: Session = Depends(get_db)):
    """Multipart upload for citizen/incident/field (proposals keep their route)."""
    data = file.file.read()
    try:
        lat_f = float(lat) if lat not in (None, "") else None
        lng_f = float(lng) if lng not in (None, "") else None
    except Exception:
        raise HTTPException(400, "lat/lng must be numeric")
    if lat_f is not None and not (-90 <= lat_f <= 90 and -180 <= lng_f <= 180):
        raise HTTPException(400, "coordinates out of range")
    return ev.save_evidence(db, source=source, source_id=source_id, data=data,
                            uploader_id=uploader_id, lat=lat_f, lng=lng_f,
                            capture_time=capture_time)


@router.get("/evidence/{photo_id}")
def evidence_detail(photo_id: str, db: Session = Depends(get_db)):
    out = ev.get_evidence(db, photo_id)
    if not out:
        raise HTTPException(404, "Evidence not found")
    return out


@router.get("/evidence/{photo_id}/file")
def evidence_file(photo_id: str, thumb: int = 0, db: Session = Depends(get_db)):
    """Generic byte serving for non-proposal sources (Module C display)."""
    from app.models.community import PhotoEvidence
    ph = db.query(PhotoEvidence).filter_by(id=photo_id).first()
    if not ph:
        raise HTTPException(404, "Evidence not found")
    blob = ph.thumb if thumb and ph.thumb else ph.data
    if not blob:
        raise HTTPException(404, "Evidence bytes unavailable (legacy record)")
    return Response(content=bytes(blob), media_type=ph.content_type or "image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


@router.delete("/evidence/{photo_id}")
def evidence_delete(photo_id: str, db: Session = Depends(get_db),
                    admin=Depends(require_role("admin"))):
    if not ev.delete_evidence(db, photo_id):
        raise HTTPException(404, "Evidence not found")
    return {"id": photo_id, "status": "DELETED"}


@router.patch("/evidence/{photo_id}/verify")
def evidence_verify(photo_id: str, body: dict, db: Session = Depends(get_db),
                    admin=Depends(require_role("admin"))):
    """Module H: PENDING → VERIFIED/REJECTED (admin only)."""
    try:
        out = ev.set_verification(db, photo_id, str(body.get("verification_status") or "").upper())
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not out:
        raise HTTPException(404, "Evidence not found")
    return out


@router.get("/evidence")
def evidence_list(source: Optional[str] = Query(default=None),
                  verification_status: Optional[str] = Query(default=None),
                  limit: int = Query(default=50, ge=1, le=200),
                  db: Session = Depends(get_db)):
    from app.models.community import PhotoEvidence
    q = db.query(PhotoEvidence)
    if source:
        if source not in ev.EVIDENCE_SOURCES:
            raise HTTPException(400, f"source must be one of {', '.join(ev.EVIDENCE_SOURCES)}")
        q = q.filter(PhotoEvidence.source == source)
    if verification_status:
        vs = verification_status.upper()
        if vs not in ev.VERIFICATION_STATUSES:
            raise HTTPException(400, f"verification_status must be one of {', '.join(ev.VERIFICATION_STATUSES)}")
        q = q.filter(PhotoEvidence.verification_status == vs)
    rows = q.order_by(PhotoEvidence.created_at.desc()).limit(limit).all()
    return {"evidence": [ev.shape(r) for r in rows], "count": len(rows)}


@router.post("/incidents/{incident_id}/evidence")
def incident_link_evidence(incident_id: str, body: dict, db: Session = Depends(get_db),
                           user=Depends(get_current_user)):
    """Module D: explicitly link a photo to an incident (no proximity guess)."""
    from app.models.risk import Incident, IncidentEvidence
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    photo_id = body.get("photo_id")
    if not photo_id or not ev.get_evidence(db, photo_id):
        raise HTTPException(404, "Evidence not found")
    row = IncidentEvidence(incident_id=incident_id, evidence_type="PHOTO",
                           payload=f'{{"photo_id": "{photo_id}"}}')
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"incident_id": incident_id, "photo_id": photo_id, "evidence_id": row.id}


@router.get("/incidents/{incident_id}/gallery")
def incident_gallery(incident_id: str, db: Session = Depends(get_db)):
    """Module D: incident timeline photos + metadata + verification status."""
    import json as _json
    from app.models.risk import Incident, IncidentEvidence
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    items = []
    for row in db.query(IncidentEvidence).filter_by(incident_id=incident_id).all():
        if row.evidence_type != "PHOTO":
            items.append({"id": row.id, "evidence_type": row.evidence_type,
                          "payload": row.payload, "created_at": str(row.created_at)})
            continue
        try:
            pid = (_json.loads(row.payload or "{}") or {}).get("photo_id")
        except Exception:
            pid = None
        photo = ev.get_evidence(db, pid) if pid else None
        items.append({"id": row.id, "evidence_type": "PHOTO",
                      "photo": photo,  # null when bytes/record missing — honest
                      "created_at": str(row.created_at)})
    items.sort(key=lambda x: x["created_at"])
    return {"incident_id": incident_id, "title": inc.title, "status": inc.status,
            "photos": items, "count": len(items)}
