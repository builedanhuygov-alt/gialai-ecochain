"""NDVI module — NDVI = (NIR - RED)/(NIR+RED), B8/B4 for Sentinel-2."""
from __future__ import annotations

import random
from typing import Any

from app.core.enums import SatelliteSource
from app.services.earth_engine.config import get_dataset_config


# expose formula constants for provenance
NDVI_FORMULA = "NDVI = (NIR - RED) / (NIR + RED)"
BAND_MAP = {
    SatelliteSource.SENTINEL2: {"nir": "B8", "red": "B4"},
    SatelliteSource.LANDSAT8: {"nir": "SR_B5", "red": "SR_B4"},
    SatelliteSource.LANDSAT9: {"nir": "SR_B5", "red": "SR_B4"},
}


def calculate_ndvi_mock(params):
    """Deterministic mock — seeded by unit+date."""
    from app.services.earth_engine.service import NDVIStatistics

    seed = hash((params.administrative_unit_id, params.start_date, params.end_date, params.dataset.value)) & 0xFFFFFFFF
    rng = random.Random(seed)
    mean = round(rng.uniform(0.25, 0.85), 4)
    median = round(mean + rng.uniform(-0.03, 0.03), 4)
    mn = round(rng.uniform(0.05, mean - 0.05), 4)
    mx = round(rng.uniform(mean + 0.05, 0.98), 4)
    std = round(rng.uniform(0.05, 0.15), 4)
    return NDVIStatistics(
        mean=mean,
        median=median,
        min=mn,
        max=mx,
        std_dev=std,
        pixel_count=rng.randint(5000, 50000),
    )


def get_bands(dataset: SatelliteSource) -> dict:
    return BAND_MAP.get(dataset, {"nir": "B8", "red": "B4"})


# Real GEE stub
def calculate_ndvi_gee(params):  # pragma: no cover
    # collection.map(lambda img: img.normalizedDifference([nir, red]).rename('NDVI'))
    # .median().reduceRegion(...)
    raise NotImplementedError("ndvi.calculate_ndvi_gee — requires ee")
