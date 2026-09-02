"""EarthEngineProvider — wraps EarthEngineService to satisfy DataProvider interface."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict

from app.core.enums import DataSourceType, SatelliteSource
from app.services.data_providers.base import DataProvider, ProviderQuery, ProviderResult
from app.services.earth_engine.config import get_dataset_config
from app.services.earth_engine.service import EEQueryParams, get_earth_engine_service

logger = logging.getLogger(__name__)


class EarthEngineProvider(DataProvider):
    @property
    def source_type(self) -> DataSourceType:
        return DataSourceType.EARTH_ENGINE

    def fetch(self, query: ProviderQuery) -> ProviderResult:
        dataset = query.extra.get("dataset", SatelliteSource.SENTINEL2)
        if isinstance(dataset, str):
            try:
                dataset = SatelliteSource(dataset)
            except ValueError:
                dataset = SatelliteSource.SENTINEL2
        cfg = get_dataset_config(dataset)
        cloud_pct = int(query.extra.get("cloud_percentage", 20))

        if not query.geometry:
            raise ValueError("EarthEngineProvider requires geometry")

        ee_params = EEQueryParams(
            administrative_unit_id=query.administrative_unit_id,
            geometry=query.geometry,  # type: ignore
            start_date=query.start_date or "2026-01-01",
            end_date=query.end_date or "2026-09-01",
            cloud_percentage=cloud_pct,
            dataset=dataset,
        )
        svc = get_earth_engine_service()
        result = svc.get_imagery(ee_params)
        ndvi = svc.calculate_ndvi(ee_params)

        return ProviderResult(
            source=DataSourceType.EARTH_ENGINE,
            dataset=cfg.collection_id,
            data={
                "image_count": result.image_count,
                "query_id": result.query_id,
                "ndvi": {
                    "mean": ndvi.mean,
                    "median": ndvi.median,
                    "min": ndvi.min,
                    "max": ndvi.max,
                    "std_dev": ndvi.std_dev,
                },
                "processing_time_ms": result.processing_time_ms,
            },
            metadata={
                "cloud_percentage": cloud_pct,
                "geometry_type": query.geometry.get("type"),
                "dataset_config": {
                    "collection_id": cfg.collection_id,
                    "nir_band": cfg.nir_band,
                    "red_band": cfg.red_band,
                },
            },
        )
