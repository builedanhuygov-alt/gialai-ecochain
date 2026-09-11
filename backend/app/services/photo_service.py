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


MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def make_variants(data: bytes, max_full: int = 1600, max_thumb: int = 320) -> tuple[bytes, bytes, int, int]:
    """Validate + normalize an upload into (full_jpeg, thumb_jpeg, w, h).

    Raises ValueError when the bytes are not a decodable image. Pillow is a
    hard dependency (see requirements.txt); the import stays local so unit
    tests can still exercise hash logic without it.
    """
    try:
        from PIL import Image, ImageOps
    except Exception as exc:
        raise ValueError(f"image library unavailable: {exc}")
    import io
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
        img = Image.open(io.BytesIO(data))
    except Exception:
        raise ValueError("not a decodable image")
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size

    def _dump(im, quality: int) -> bytes:
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()

    full = img.copy()
    full.thumbnail((max_full, max_full))
    thumb = img.copy()
    thumb.thumbnail((max_thumb, max_thumb))
    return _dump(full, 82), _dump(thumb, 70), w, h


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
