"""Imagery module — collection / cloud filtering / statistics."""
from __future__ import annotations

import random
import uuid
from datetime import date
from typing import Any, Dict

from app.services.earth_engine.config import get_dataset_config
from app.core.enums import SatelliteSource


def get_collection(dataset: SatelliteSource) -> str:
    """Return collection id — never hard-code elsewhere."""
    return get_dataset_config(dataset).collection_id


def get_imagery_mock(params) -> Dict[str, Any]:
    """Mock imagery result — deterministic by unit+date."""
    cfg = get_dataset_config(params.dataset)
    try:
        d1 = date.fromisoformat(params.start_date)
        d2 = date.fromisoformat(params.end_date)
        days = max(1, (d2 - d1).days)
    except Exception:
        days = 30
    count = max(1, min(days // 5, 50))
    # inject cloud-filter effect: high cloud threshold reduces usable images slightly
    if params.cloud_percentage < 5:
        count = max(0, count - 1)
    return {
        "query_id": str(uuid.uuid4()),
        "image_count": count,
        "dataset": cfg.collection_id,
        "metadata": {
            "cloud_percentage": params.cloud_percentage,
            "geometry_type": params.geometry.get("type", "Polygon"),
            "mock": True,
        },
    }


def get_cloud_filtered_imagery_mock(params, image_count: int) -> Dict[str, Any]:
    """Phase 2: if image_count==0 => NO_VALID_IMAGE."""
    if image_count == 0:
        return {"status": "NO_VALID_IMAGE", "reason": "No images satisfy cloud filter", "image_count": 0}
    return {"status": "OK", "image_count": image_count}


def calculate_statistics_mock(ndvi_stats) -> Dict[str, Any]:
    return {
        "mean": ndvi_stats.mean,
        "median": ndvi_stats.median,
        "min": ndvi_stats.min,
        "max": ndvi_stats.max,
        "std_dev": ndvi_stats.std_dev,
        "pixel_count": ndvi_stats.pixel_count,
    }


def get_thumbnail_mock(params, ndvi_stats=None) -> Dict[str, Any]:
    """Return a mock thumbnail URL / token — real GEE would call getThumbUrl."""
    return {
        "thumbnail_url": f"mock://thumbnail/{params.administrative_unit_id}/{params.start_date}_{params.end_date}",
        "dataset": get_collection(params.dataset),
        "note": "Potential vegetation change — requires verification (mock)",
    }


# ── Real GEE stubs (Phase 2 fills) ──────────────────────────────────
def get_imagery_gee(params):  # pragma: no cover
    raise NotImplementedError("imagery.get_imagery_gee — requires ee + credentials")

def get_cloud_filtered_imagery_gee(params):  # pragma: no cover
    raise NotImplementedError

def calculate_statistics_gee(params, ndvi_image):  # pragma: no cover
    raise NotImplementedError

def get_thumbnail_gee(params):  # pragma: no cover
    raise NotImplementedError
