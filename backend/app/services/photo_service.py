"""Photo evidence — hash, duplicate detection, geo/time consistency."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any, Dict, Optional


def compute_hash(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()


def compute_perceptual_hash(file_bytes: bytes) -> str:
    """Simplified pHash mock — in prod use `imagehash` library."""
    # Use first 16 bytes of sha256 as mock pHash
    return hashlib.sha256(b"phash:" + file_bytes).hexdigest()[:16]


def is_duplicate(new_hash: str, existing_hashes: list[str], phash: Optional[str] = None, existing_phashes: Optional[list[str]] = None) -> tuple[bool, str | None]:
    if new_hash in existing_hashes:
        return True, new_hash
    if phash and existing_phashes and phash in existing_phashes:
        return True, phash
    return False, None


def check_geo_consistency(
    photo_lat: Optional[float],
    photo_lng: Optional[float],
    geometry: Dict[str, Any],
) -> Dict[str, Any]:
    """Sec 23 — report/admin geometry vs proposal geometry."""
    if photo_lat is None or photo_lng is None:
        return {"ok": True, "flag": None, "note": "No GPS — treated as neutral"}
    try:
        coords = geometry.get("coordinates", [[[0, 0]]])[0] if geometry.get("type") == "Polygon" else []
        if not coords:
            return {"ok": True, "flag": None}
        xs = [c[0] for c in coords]; ys = [c[1] for c in coords]
        inside = min(xs) <= photo_lng <= max(xs) and min(ys) <= photo_lat <= max(ys)
        if not inside:
            return {"ok": False, "flag": "LOCATION_MISMATCH", "note": "Photo outside administrative geometry"}
        return {"ok": True, "flag": None}
    except Exception as exc:
        return {"ok": False, "flag": "LOCATION_MISMATCH", "note": str(exc)}


def check_time_consistency(
    photo_time: Optional[datetime],
    upload_time: datetime,
    satellite_acquisition: Optional[datetime] = None,
    max_skew_hours: int = 72,
) -> Dict[str, Any]:
    """Sec 24 — report/upload/satellite times."""
    if photo_time is None:
        return {"ok": True, "flag": None}
    skew = abs((upload_time - photo_time).total_seconds()) / 3600
    if skew > max_skew_hours:
        return {"ok": False, "flag": "TIME_MISMATCH", "skew_hours": skew}
    if satellite_acquisition:
        sat_skew = abs((photo_time - satellite_acquisition).total_seconds()) / 3600
        if sat_skew > 30 * 24:  # photo >30 days from imagery
            return {"ok": False, "flag": "TIME_MISMATCH", "note": "Photo far from satellite date", "skew_hours": sat_skew}
    return {"ok": True, "flag": None, "skew_hours": skew}
