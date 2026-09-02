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
    """Sec 5 — extended interface."""

    @property
    def source_type(self) -> DataSourceType:
        return DataSourceType.EARTH_ENGINE

    # Sec 5 interface
    def get_collection(self, dataset: SatelliteSource | str = SatelliteSource.SENTINEL2) -> str:
        if isinstance(dataset, str):
            try:
                dataset = SatelliteSource(dataset)
            except ValueError:
                dataset = SatelliteSource.SENTINEL2
        return get_earth_engine_service().get_collection(dataset)  # type: ignore

    def get_imagery(self, query: ProviderQuery) -> Dict[str, Any]:
        params = self._to_params(query)
        svc = get_earth_engine_service()
        r = svc.get_imagery(params)
        return {"query_id": r.query_id, "image_count": r.image_count, "dataset": r.dataset, "metadata": r.metadata}

    def get_cloud_filtered_imagery(self, query: ProviderQuery) -> Dict[str, Any]:
        params = self._to_params(query)
        return get_earth_engine_service().get_cloud_filtered_imagery(params)

    def calculate_statistics(self, query: ProviderQuery) -> Dict[str, Any]:
        params = self._to_params(query)
        return get_earth_engine_service().calculate_statistics(params)

    def calculate_ndvi(self, query: ProviderQuery) -> Dict[str, Any]:
        params = self._to_params(query)
        ndvi = get_earth_engine_service().calculate_ndvi(params)
        return ndvi.__dict__

    def get_thumbnail(self, query: ProviderQuery) -> Dict[str, Any]:
        params = self._to_params(query)
        return get_earth_engine_service().get_thumbnail(params)

    def detect_change(self, administrative_unit_id: str, geometry: Dict[str, Any],
                      baseline: tuple[str, str], current: tuple[str, str],
                      dataset: SatelliteSource | str = SatelliteSource.SENTINEL2,
                      cloud_percentage: int = 20) -> Dict[str, Any]:
        if isinstance(dataset, str):
            try:
                dataset = SatelliteSource(dataset)
            except ValueError:
                dataset = SatelliteSource.SENTINEL2
        svc = get_earth_engine_service()
        r = svc.detect_forest_change(administrative_unit_id, geometry, baseline, current, dataset, cloud_percentage)
        # convert 0-1 confidence to 0-100 + keep legacy
        return {
            "ndvi_before": r.ndvi_before, "ndvi_after": r.ndvi_after,
            "ndvi_change": r.ndvi_change, "change_percentage": r.change_percentage,
            "affected_area_ha": r.affected_area_ha, "confidence": int(r.confidence * 100),
            "source_dataset": r.source_dataset,
        }

    def _to_params(self, query: ProviderQuery):
        dataset = query.extra.get("dataset", SatelliteSource.SENTINEL2)
        if isinstance(dataset, str):
            try:
                dataset = SatelliteSource(dataset)
            except ValueError:
                dataset = SatelliteSource.SENTINEL2
        cloud_pct = int(query.extra.get("cloud_percentage", 20))
        if not query.geometry:
            raise ValueError("EarthEngineProvider requires geometry")
        return EEQueryParams(
            administrative_unit_id=query.administrative_unit_id,
            geometry=query.geometry,  # type: ignore
            start_date=query.start_date or "2026-01-01",
            end_date=query.end_date or "2026-09-01",
            cloud_percentage=cloud_pct,
            dataset=dataset,
        )

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
