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


# ── Mock implementation (Phase 1 default) ────────────────────────────

class MockEarthEngineService(EarthEngineService):
    """Phase 1 mock — deterministic-ish but marked as demo."""

    def authenticate(self) -> GEEStatus:
        return gee_auth.authenticate()

    def get_status(self) -> GEEStatus:
        return gee_auth.status

    def _simulate_latency(self) -> int:
        ms = random.randint(80, 250)
        # keep it small for tests
        time.sleep(0.005)
        return ms

    def get_imagery(self, params: EEQueryParams) -> EEImageryResult:
        cfg = get_dataset_config(params.dataset)
        ms = self._simulate_latency()
        # mock image count based on date range
        try:
            d1 = date.fromisoformat(params.start_date)
            d2 = date.fromisoformat(params.end_date)
            days = max(1, (d2 - d1).days)
        except Exception:
            days = 30
        count = max(1, min(days // 5, 50))
        return EEImageryResult(
            query_id=str(uuid.uuid4()),
            image_count=count,
            dataset=cfg.collection_id,
            processing_time_ms=ms,
            metadata={
                "cloud_percentage": params.cloud_percentage,
                "geometry_type": params.geometry.get("type", "Polygon"),
                "mock": True,
            },
        )

    def calculate_ndvi(self, params: EEQueryParams) -> NDVIStatistics:
        ms = self._simulate_latency()
        # deterministic pseudo-random based on unit + dates
        seed = hash((params.administrative_unit_id, params.start_date, params.end_date)) & 0xFFFFFFFF
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
            change=None,
            anomaly=None,
        )

    def detect_forest_change(
        self,
        administrative_unit_id: str,
        geometry: Dict[str, Any],
        period_before: tuple[str, str],
        period_after: tuple[str, str],
        dataset: SatelliteSource = SatelliteSource.SENTINEL2,
        cloud_percentage: int = 20,
    ) -> ForestChangeResult:
        # reuse calculate_ndvi for before/after
        before = self.calculate_ndvi(
            EEQueryParams(
                administrative_unit_id=administrative_unit_id,
                geometry=geometry,
                start_date=period_before[0],
                end_date=period_before[1],
                cloud_percentage=cloud_percentage,
                dataset=dataset,
            )
        )
        after = self.calculate_ndvi(
            EEQueryParams(
                administrative_unit_id=administrative_unit_id,
                geometry=geometry,
                start_date=period_after[0],
                end_date=period_after[1],
                cloud_percentage=cloud_percentage,
                dataset=dataset,
            )
        )
        cfg = get_dataset_config(dataset)
        change = round(after.mean - before.mean, 4)
        pct = round((change / before.mean * 100) if before.mean else 0, 2)
        # confidence heuristic: larger |change| => higher confidence for demo
        confidence = round(min(0.95, max(0.4, abs(change) * 3 + 0.5)), 2)
        affected = round(abs(change) * 120 + random.Random(hash(administrative_unit_id)).uniform(0, 10), 2)
        return ForestChangeResult(
            administrative_unit_id=administrative_unit_id,
            period_start=period_after[0],
            period_end=period_after[1],
            ndvi_before=before.mean,
            ndvi_after=after.mean,
            ndvi_change=change,
            change_percentage=pct,
            affected_area_ha=affected,
            confidence=confidence,
            source="EARTH_ENGINE",
            source_dataset=cfg.collection_id,
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
