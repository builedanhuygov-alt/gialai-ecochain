"""Unified Evidence Pipeline (Module A) — one pipeline for every image source.

Sources: proposal (forest), citizen (reports), incident (galleries), field
(observations). Every record stores: file bytes + thumbnail, sha256 +
perceptual hash, GPS, capture_time, metadata JSON, storage/thumbnail URLs,
verification_status (PENDING/VERIFIED/REJECTED; duplicates flagged, never
silently deleted). No per-module upload logic — routes delegate here.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

EVIDENCE_SOURCES = ("proposal", "citizen", "incident", "field")
VERIFICATION_STATUSES = ("PENDING", "VERIFIED", "REJECTED")


def storage_urls(photo) -> Dict[str, Optional[str]]:
    """Displayable URLs (Module C) — per-source serving routes, never hash-only."""
    pid = getattr(photo, "id", None)
    if getattr(photo, "source", "proposal") == "proposal" and getattr(photo, "proposal_id", None):
        base = f"/api/forest/proposals/{photo.proposal_id}/photos/{pid}/file"
    else:
        base = f"/api/evidence/{pid}/file"
    return {"storage_url": base, "thumbnail_url": base + "?thumb=1"}


def shape(photo) -> Dict[str, Any]:
    """Public evidence shape (gallery + directory + detail share it)."""
    urls = storage_urls(photo)
    lat, lng = getattr(photo, "location_lat", None), getattr(photo, "location_lng", None)
    try:
        meta = json.loads(getattr(photo, "meta", None) or "null")
    except Exception:
        meta = None
    return {
        "id": photo.id,
        "source": getattr(photo, "source", "proposal"),
        "source_id": getattr(photo, "proposal_id", None) or getattr(photo, "report_id", None),
        "proposal_id": getattr(photo, "proposal_id", None),
        "report_id": getattr(photo, "report_id", None),
        "uploader_id": getattr(photo, "uploader_id", None),
        "file_hash": getattr(photo, "file_hash", None),
        "perceptual_hash": getattr(photo, "perceptual_hash", None),
        "is_duplicate": bool(getattr(photo, "is_duplicate", False)),
        "duplicate_of": getattr(photo, "duplicate_of", None),
        "verification_status": getattr(photo, "verification_status", "PENDING"),
        "capture_time": str(getattr(photo, "capture_time", None))
                        if getattr(photo, "capture_time", None) else None,
        "gps": [lat, lng] if lat is not None and lng is not None else None,
        "width": getattr(photo, "width", None),
        "height": getattr(photo, "height", None),
        "metadata": meta,
        **urls,
        "created_at": str(getattr(photo, "created_at", None)),
    }


def _parse_capture_time(raw) -> Optional[datetime]:
    if raw in (None, ""):
        return None
    s = str(raw).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:19], fmt)
        except Exception:
            continue
    raise ValueError("capture_time must be ISO (YYYY-MM-DD[THH:MM[:SS]])")


def save_evidence(db, *, source: str, source_id: str | None, data: bytes,
                  uploader_id: str, lat=None, lng=None,
                  capture_time=None, metadata: dict | None = None,
                  geometry: dict | None = None) -> Dict[str, Any]:
    """Single write path. Raises ValueError (400) / LookupError (404)."""
    from fastapi import HTTPException
    from app.models.community import PhotoEvidence
    from app.services.photo_service import (
        MAX_UPLOAD_BYTES, check_geo_consistency, compute_hash,
        compute_perceptual_hash, is_duplicate, make_variants,
    )
    if source not in EVIDENCE_SOURCES:
        raise HTTPException(400, f"source must be one of {', '.join(EVIDENCE_SOURCES)}")
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 5MB)")
    try:
        full_jpeg, thumb_jpeg, w, h_px = make_variants(data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    digest = compute_hash(data)
    ph = compute_perceptual_hash(data)
    existing = db.query(PhotoEvidence).all()
    dup, dup_of = is_duplicate(
        digest, [e.file_hash for e in existing],
        ph, [e.perceptual_hash for e in existing if e.perceptual_hash])
    geo_check = check_geo_consistency(lat, lng, geometry or {})
    try:
        cap = _parse_capture_time(capture_time)
    except ValueError as e:
        raise HTTPException(400, str(e))
    pid = str(uuid.uuid4())
    photo = PhotoEvidence(
        id=pid,
        proposal_id=source_id if source == "proposal" else None,
        report_id=source_id if source == "citizen" else None,
        source=source,
        uploader_id=uploader_id,
        file_path=f"db://photo_evidences/{pid}",
        file_hash=digest,
        perceptual_hash=ph,
        data=full_jpeg,
        thumb=thumb_jpeg,
        content_type="image/jpeg",
        width=w,
        height=h_px,
        location_lat=lat,
        location_lng=lng,
        is_duplicate=dup,
        duplicate_of=dup_of if dup else None,
        verification_status="PENDING",
        capture_time=cap,
        meta=json.dumps(metadata or {}, ensure_ascii=False) if metadata else None,
        ai_analysis_status="PENDING",
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    out = shape(photo)
    out["geo_check"] = geo_check
    return out


def get_evidence(db, photo_id: str) -> Dict[str, Any] | None:
    from app.models.community import PhotoEvidence
    ph = db.query(PhotoEvidence).filter_by(id=photo_id).first()
    return shape(ph) if ph else None


def delete_evidence(db, photo_id: str) -> bool:
    from app.models.community import PhotoEvidence
    ph = db.query(PhotoEvidence).filter_by(id=photo_id).first()
    if not ph:
        return False
    db.delete(ph)
    db.commit()
    return True


def set_verification(db, photo_id: str, status: str) -> Dict[str, Any] | None:
    """Module H: PENDING → VERIFIED/REJECTED. Unknown status → ValueError."""
    from app.models.community import PhotoEvidence
    if status not in VERIFICATION_STATUSES:
        raise ValueError(f"verification_status must be one of {', '.join(VERIFICATION_STATUSES)}")
    ph = db.query(PhotoEvidence).filter_by(id=photo_id).first()
    if not ph:
        return None
    ph.verification_status = status
    db.commit()
    db.refresh(ph)
    return shape(ph)
