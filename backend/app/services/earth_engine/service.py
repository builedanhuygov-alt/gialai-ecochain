"""EarthEngineService abstraction — mock-ready, Phase 2 plugs real GEE."""

from __future__ import annotations

import abc
import logging
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from app.core.enums import GEEStatus, SatelliteSource
from app.services.earth_engine.auth import gee_auth
from app.services.earth_engine.config import get_dataset_config

logger = logging.getLogger(__name__)


# ── Data structures ──────────────────────────────────────────────────

@dataclass
class EEQueryParams:
    """Geographic query payload — section 7 of spec."""
    administrative_unit_id: str
    geometry: Dict[str, Any]  # GeoJSON
    start_date: str           # ISO date
    end_date: str
    cloud_percentage: int = 20
    dataset: SatelliteSource = SatelliteSource.SENTINEL2
    scale_m: Optional[int] = None


@dataclass
class EEImageryResult:
    query_id: str
    image_count: int
    dataset: str
    processing_time_ms: int
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class NDVIStatistics:
    """Section 8 — NDVI foundation."""
    mean: float
    median: float
    min: float
    max: float
    std_dev: Optional[float] = None
    pixel_count: Optional[int] = None
    # change / anomaly computed by comparing two periods
    change: Optional[float] = None          # mean_after - mean_before
    change_percentage: Optional[float] = None
    anomaly: Optional[float] = None         # vs historical baseline


@dataclass
class ForestChangeResult:
    """Section 9 — ForestChange output."""
    administrative_unit_id: str
    period_start: str
    period_end: str
    ndvi_before: float
    ndvi_after: float
    ndvi_change: float
    change_percentage: float
    affected_area_ha: Optional[float] = None
    confidence: float = 0.0  # 0-1
    source: str = "EARTH_ENGINE"
    source_dataset: str = "COPERNICUS/S2_SR_HARMONIZED"
    processing_time_ms: Optional[int] = None
    status: str = "PROPOSED"


# ── Abstract interface ───────────────────────────────────────────────

class EarthEngineService(abc.ABC):
    """Section 1 — abstraction layer. All GEE logic behind this interface."""

    @abc.abstractmethod
    def authenticate(self) -> GEEStatus:
        ...

    @abc.abstractmethod
    def get_status(self) -> GEEStatus:
        ...

    @abc.abstractmethod
    def get_imagery(self, params: EEQueryParams) -> EEImageryResult:
        ...

    @abc.abstractmethod
    def calculate_ndvi(self, params: EEQueryParams) -> NDVIStatistics:
        ...

    @abc.abstractmethod
    def detect_forest_change(
        self,
        administrative_unit_id: str,
        geometry: Dict[str, Any],
        period_before: tuple[str, str],
        period_after: tuple[str, str],
        dataset: SatelliteSource = SatelliteSource.SENTINEL2,
        cloud_percentage: int = 20,
    ) -> ForestChangeResult:
        ...

    @abc.abstractmethod
    def get_statistics(
        self,
        params: EEQueryParams,
        ndvi_stats: Optional[NDVIStatistics] = None,
    ) -> Dict[str, Any]:
        ...

    # Phase 2 extended interface (Sec 5)
    @abc.abstractmethod
    def get_collection(self, dataset: SatelliteSource) -> str:
        ...

    @abc.abstractmethod
    def get_cloud_filtered_imagery(self, params: EEQueryParams) -> Dict[str, Any]:
        ...

    @abc.abstractmethod
    def calculate_statistics(self, params: EEQueryParams) -> Dict[str, Any]:
        ...

    @abc.abstractmethod
    def get_thumbnail(self, params: EEQueryParams) -> Dict[str, Any]:
        ...


# ── Mock implementation (Phase 1 default) — now delegates to modular mocks ──

class MockEarthEngineService(EarthEngineService):
    """Phase 1 mock — deterministic-ish but marked as demo. Delegates to imagery/ndvi/change_detection."""

    def authenticate(self) -> GEEStatus:
        return gee_auth.authenticate()

    def get_status(self) -> GEEStatus:
        return gee_auth.status

    def _simulate_latency(self) -> int:
        ms = random.randint(80, 250)
        time.sleep(0.005)
        return ms

    # facade delegates
    def get_collection(self, dataset: SatelliteSource) -> str:
        from app.services.earth_engine.imagery import get_collection
        return get_collection(dataset)

    def get_imagery(self, params: EEQueryParams) -> EEImageryResult:
        from app.services.earth_engine.imagery import get_imagery_mock
        ms = self._simulate_latency()
        data = get_imagery_mock(params)
        return EEImageryResult(
            query_id=data["query_id"],
            image_count=data["image_count"],
            dataset=data["dataset"],
            processing_time_ms=ms,
            metadata=data["metadata"],
        )

    def get_cloud_filtered_imagery(self, params: EEQueryParams) -> Dict[str, Any]:
        from app.services.earth_engine.imagery import get_imagery_mock, get_cloud_filtered_imagery_mock
        raw = get_imagery_mock(params)
        filtered = get_cloud_filtered_imagery_mock(params, raw["image_count"])
        filtered["dataset"] = raw["dataset"]
        filtered["query_id"] = raw["query_id"]
        # Sec 7: NO_VALID_IMAGE handling
        if filtered["status"] == "NO_VALID_IMAGE":
            filtered["processing_time_ms"] = self._simulate_latency()
        return filtered

    def calculate_ndvi(self, params: EEQueryParams) -> NDVIStatistics:
        from app.services.earth_engine.ndvi import calculate_ndvi_mock
        self._simulate_latency()
        return calculate_ndvi_mock(params)

    def calculate_statistics(self, params: EEQueryParams) -> Dict[str, Any]:
        from app.services.earth_engine.imagery import calculate_statistics_mock
        ndvi = self.calculate_ndvi(params)
        stats = calculate_statistics_mock(ndvi)
        cfg = get_dataset_config(params.dataset)
        return {"dataset": cfg.collection_id, "period": f"{params.start_date} → {params.end_date}", "statistics": stats, "mock": True}

    def get_thumbnail(self, params: EEQueryParams) -> Dict[str, Any]:
        from app.services.earth_engine.imagery import get_thumbnail_mock
        self._simulate_latency()
        return get_thumbnail_mock(params)

    def detect_forest_change(
        self,
        administrative_unit_id: str,
        geometry: Dict[str, Any],
        period_before: tuple[str, str],
        period_after: tuple[str, str],
        dataset: SatelliteSource = SatelliteSource.SENTINEL2,
        cloud_percentage: int = 20,
    ) -> ForestChangeResult:
        from app.services.earth_engine.change_detection import detect_change_mock
        self._simulate_latency()
        # need total_area from geometry approx
        total_area = None
        try:
            coords = geometry.get("coordinates", [[[0, 0]]])[0] if geometry.get("type") == "Polygon" else []
            if coords:
                xs = [c[0] for c in coords]
                ys = [c[1] for c in coords]
                total_area = abs((max(xs) - min(xs)) * (max(ys) - min(ys)) * 1236400)
        except Exception:
            total_area = None
        data = detect_change_mock(administrative_unit_id, geometry, period_before, period_after, dataset, cloud_percentage, total_area)
        return ForestChangeResult(
            administrative_unit_id=administrative_unit_id,
            period_start=data["period_start"],
            period_end=data["period_end"],
            ndvi_before=data["ndvi_before"],
            ndvi_after=data["ndvi_after"],
            ndvi_change=data["ndvi_change"],
            change_percentage=data["change_percentage"],
            affected_area_ha=data["affected_area_ha"],
            confidence=data["confidence"] / 100.0,  # legacy 0-1
            source="EARTH_ENGINE",
            source_dataset=data["source_dataset"],
            processing_time_ms=random.randint(200, 600),
            status="PROPOSED",
        )

    def get_statistics(
        self,
        params: EEQueryParams,
        ndvi_stats: Optional[NDVIStatistics] = None,
    ) -> Dict[str, Any]:
        stats = ndvi_stats or self.calculate_ndvi(params)
        cfg = get_dataset_config(params.dataset)
        return {
            "administrative_unit_id": params.administrative_unit_id,
            "dataset": cfg.collection_id,
            "period": f"{params.start_date} → {params.end_date}",
            "ndvi": {
                "mean": stats.mean,
                "median": stats.median,
                "min": stats.min,
                "max": stats.max,
                "std_dev": stats.std_dev,
                "change": stats.change,
                "anomaly": stats.anomaly,
            },
            "mock": True,
        }


# ── Real GEE implementation (Phase 2 stub) ───────────────────────────

class GEE_EarthEngineService(EarthEngineService):
    """
    Real GEE implementation skeleton.
    Phase 2 fills in EE calls (ee.ImageCollection, ndvi = (NIR-RED)/(NIR+RED), etc.)
    WITHOUT changing the interface contract.
    """

    def authenticate(self) -> GEEStatus:
        return gee_auth.authenticate()

    def get_status(self) -> GEEStatus:
        return gee_auth.status

    def get_imagery(self, params: EEQueryParams) -> EEImageryResult:
        # TODO Phase 2:
        #   ee.Geometry(params.geometry)
        #   ee.ImageCollection(cfg.collection_id)
        #     .filterBounds(geom).filterDate(start,end)
        #     .filter(ee.Filter.lt(cfg.cloud_property, params.cloud_percentage))
        #   return size, metadata
        raise NotImplementedError("GEE_EarthEngineService.get_imagery — Phase 2")

    def calculate_ndvi(self, params: EEQueryParams) -> NDVIStatistics:
        # TODO Phase 2:
        #   collection.map(lambda img: img.normalizedDifference([nir, red]).rename('NDVI'))
        #   .median().reduceRegion(ee.Reducer.mean/median/minMax...)
        raise NotImplementedError("GEE_EarthEngineService.calculate_ndvi — Phase 2")

    def detect_forest_change(self, *a, **kw) -> ForestChangeResult:
        raise NotImplementedError("GEE_EarthEngineService.detect_forest_change — Phase 2")

    def get_collection(self, dataset: SatelliteSource) -> str:
        from app.services.earth_engine.imagery import get_collection
        return get_collection(dataset)

    def get_cloud_filtered_imagery(self, params: EEQueryParams) -> Dict[str, Any]:
        raise NotImplementedError("GEE_EarthEngineService.get_cloud_filtered_imagery — Phase 2")

    def calculate_statistics(self, params: EEQueryParams) -> Dict[str, Any]:
        raise NotImplementedError("GEE_EarthEngineService.calculate_statistics — Phase 2")

    def get_thumbnail(self, params: EEQueryParams) -> Dict[str, Any]:
        raise NotImplementedError("GEE_EarthEngineService.get_thumbnail — Phase 2")

    def get_statistics(self, *a, **kw) -> Dict[str, Any]:
        raise NotImplementedError("GEE_EarthEngineService.get_statistics — Phase 2")


# ── Factory ──────────────────────────────────────────────────────────

def get_earth_engine_service(use_mock: Optional[bool] = None) -> EarthEngineService:
    """
    Phase 1 default = mock. Phase 2: when GEE is configured and use_mock is False,
    return real implementation.
    """
    from app.core.config import get_settings

    s = get_settings()
    if use_mock is True:
        return MockEarthEngineService()
    if use_mock is False and s.gee_configured:
        return GEE_EarthEngineService()
    # auto: mock when not configured, real when configured and not in demo
    if s.gee_configured and not s.is_demo:
        try:
            # only return real if auth succeeds
            if gee_auth.status == GEEStatus.CONNECTED:
                return GEE_EarthEngineService()
        except Exception:
            pass
    return MockEarthEngineService()
