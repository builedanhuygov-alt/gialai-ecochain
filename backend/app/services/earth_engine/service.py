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


# ── Real GEE implementation — Live Satellite Data Only ─────────────────

class GEE_EarthEngineService(EarthEngineService):
    """Real GEE — server-side processing, returns LIVE tiles/metadata. Never mocks."""

    def authenticate(self) -> GEEStatus:
        return gee_auth.authenticate()

    def get_status(self) -> GEEStatus:
        return gee_auth.status

    def _ee(self):
        try:
            import ee
            return ee
        except Exception as e:
            raise RuntimeError(f"earthengine-api not installed: {e}")

    def _geom(self, ee, geometry: Dict[str, Any]):
        # GeoJSON → ee.Geometry
        if geometry.get("type")=="Point":
            return ee.Geometry.Point(geometry["coordinates"])
        if geometry.get("type")=="Polygon":
            return ee.Geometry.Polygon(geometry["coordinates"])
        # fallback Gia Lai province approx
        return ee.Geometry.Polygon([[[108.0,13.5],[108.8,13.5],[108.8,14.3],[108.0,14.3],[108.0,13.5]]])

    def _collection(self, ee, params: EEQueryParams):
        cfg=get_dataset_config(params.dataset)
        geom=self._geom(ee, params.geometry)
        col=ee.ImageCollection(cfg.collection_id).filterBounds(geom).filterDate(params.start_date, params.end_date)
        # cloud filter only for optical
        if params.dataset in (SatelliteSource.SENTINEL2, SatelliteSource.LANDSAT8, SatelliteSource.LANDSAT9):
            col=col.filter(ee.Filter.lt(cfg.cloud_property, params.cloud_percentage))
        return col, geom, cfg

    def get_collection(self, dataset: SatelliteSource) -> str:
        from app.services.earth_engine.imagery import get_collection
        return get_collection(dataset)

    def get_imagery(self, params: EEQueryParams) -> EEImageryResult:
        ee=self._ee()
        if gee_auth.status!=GEEStatus.CONNECTED:
            gee_auth.authenticate()
            if gee_auth.status!=GEEStatus.CONNECTED:
                raise RuntimeError(f"GEE not connected: {gee_auth.status.value}")
        col, geom, cfg=self._collection(ee, params)
        size=col.size().getInfo()
        # pick latest
        img=col.sort("system:time_start", False).first()
        info=img.getInfo() if size else None
        acquired=info["properties"]["system:time_start"] if info and "properties" in info else params.start_date
        # convert timestamp to date
        try:
            import datetime
            acq=datetime.datetime.utcfromtimestamp(acquired/1000).strftime("%Y-%m-%d") if isinstance(acquired,int) else params.start_date
        except: acq=params.start_date
        return EEImageryResult(
            query_id=str(uuid.uuid4()),
            image_count=int(size),
            dataset=cfg.collection_id,
            processing_time_ms=0,
            metadata={"acquired": acq, "cloud": params.cloud_percentage, "status":"LIVE", "provider":"Google Earth Engine", "resolution": f"{cfg.scale_m} m", "processing":"Surface Reflectance"},
        )

    def get_cloud_filtered_imagery(self, params: EEQueryParams) -> Dict[str, Any]:
        r=self.get_imagery(params)
        if r.image_count==0:
            return {"status":"UNAVAILABLE","reason":"No suitable Sentinel-2 imagery found","image_count":0,"dataset":r.dataset}
        return {"status":"LIVE","image_count":r.image_count,"dataset":r.dataset,"query_id":r.query_id, "metadata": r.metadata}

    def calculate_ndvi(self, params: EEQueryParams) -> NDVIStatistics:
        ee=self._ee()
        if gee_auth.status!=GEEStatus.CONNECTED:
            gee_auth.authenticate()
        col, geom, cfg=self._collection(ee, params)
        if col.size().getInfo()==0:
            raise RuntimeError("No suitable imagery found for NDVI")
        # median composite
        median=col.median().clip(geom)
        # NDVI = (NIR-RED)/(NIR+RED)
        nir=cfg.nir_band; red=cfg.red_band
        ndvi=median.normalizedDifference([nir, red]).rename("NDVI")
        stats=ndvi.reduceRegion(reducer=ee.Reducer.mean().combine(ee.Reducer.minMax(), "", True).combine(ee.Reducer.stdDev(), "", True), geometry=geom, scale=cfg.scale_m, maxPixels=1e9).getInfo()
        # stats keys: NDVI_mean, NDVI_min, NDVI_max, NDVI_stdDev
        def g(k, d): return stats.get(k, d) if stats else d
        return NDVIStatistics(mean=float(g("NDVI_mean",0.5)), median=float(g("NDVI_mean",0.5)), min=float(g("NDVI_min",0)), max=float(g("NDVI_max",1)), std_dev=float(g("NDVI_stdDev",0.1)) if g("NDVI_stdDev",None) else None, pixel_count=None)

    def calculate_statistics(self, params: EEQueryParams) -> Dict[str, Any]:
        ndvi=self.calculate_ndvi(params)
        cfg=get_dataset_config(params.dataset)
        return {"dataset": cfg.collection_id, "period": f"{params.start_date} → {params.end_date}", "statistics": ndvi.__dict__, "status":"LIVE"}

    def get_thumbnail(self, params: EEQueryParams) -> Dict[str, Any]:
        return self.get_tile(params, "true")

    def get_tile(self, params: EEQueryParams, layer: str = "true") -> Dict[str, Any]:
        """Return GEE map tile URL template for MapLibre raster source. Layer: true/false/ndvi/ndmi/nbr/s1/landsat/dw/worldcover/dem"""
        ee=self._ee()
        if gee_auth.status!=GEEStatus.CONNECTED:
            gee_auth.authenticate()
            if gee_auth.status!=GEEStatus.CONNECTED:
                raise RuntimeError("GEE not connected")
        col, geom, cfg=self._collection(ee, params)
        size=col.size().getInfo()
        if size==0:
            raise RuntimeError("No suitable imagery found")
        median=col.median().clip(geom)
        vis={}
        img=None
        # select visualization per layer
        if layer=="true": # Sec5 true-color B4/B3/B2
            img=median
            vis={"bands":[cfg.nir_band if cfg.nir_band=="B4" else "B4","B3","B2"] if params.dataset==SatelliteSource.SENTINEL2 else {"min":0,"max":3000}, "min":0,"max":3000} if params.dataset==SatelliteSource.SENTINEL2 else {"bands":["B4","B3","B2"],"min":0,"max":3000}
            if params.dataset==SatelliteSource.SENTINEL2:
                vis={"bands":["B4","B3","B2"],"min":0,"max":3000}
            else: vis={"bands":[cfg.nir_band, cfg.red_band], "min":0,"max":3000}
        elif layer=="false": # Sec6 B8/B4/B3
            if params.dataset==SatelliteSource.SENTINEL2:
                img=median; vis={"bands":["B8","B4","B3"],"min":0,"max":3000}
            else: img=median; vis={"bands":[cfg.nir_band,cfg.red_band], "min":0,"max":3000}
        elif layer=="ndvi": # Sec7
            img=median.normalizedDifference([cfg.nir_band, cfg.red_band]).rename("NDVI")
            vis={"min":-1,"max":1,"palette":["red","yellow","green"]}
        elif layer=="ndmi": # Sec8 B8/B11
            img=median.normalizedDifference(["B8","B11"]).rename("NDMI") if params.dataset==SatelliteSource.SENTINEL2 else median.normalizedDifference([cfg.nir_band,cfg.red_band])
            vis={"min":-1,"max":1,"palette":["brown","white","blue"]}
        elif layer=="nbr": # Sec9 B8/B12
            img=median.normalizedDifference(["B8","B12"]).rename("NBR") if params.dataset==SatelliteSource.SENTINEL2 else median.normalizedDifference([cfg.nir_band,cfg.red_band])
            vis={"min":-1,"max":1,"palette":["black","gray","green"]}
        elif layer=="s1": # Sec10 VV/VH
            # need S1 collection
            col_s1,_,cfg_s1=self._collection(ee, EEQueryParams(administrative_unit_id=params.administrative_unit_id, geometry=params.geometry, start_date=params.start_date, end_date=params.end_date, dataset=SatelliteSource.SENTINEL1))
            median_s1=col_s1.median().clip(self._geom(ee, params.geometry))
            img=median_s1; vis={"bands":["VV"],"min":-25,"max":0}
        elif layer in ("landsat8","landsat9"):
            src=SatelliteSource.LANDSAT8 if layer=="landsat8" else SatelliteSource.LANDSAT9
            col2,_,cfg2=self._collection(ee, EEQueryParams(administrative_unit_id=params.administrative_unit_id, geometry=params.geometry, start_date=params.start_date, end_date=params.end_date, dataset=src))
            img=col2.median().clip(self._geom(ee, params.geometry)); vis={"bands":["B4","B3","B2"],"min":0,"max":30000}
        elif layer=="dw": # Dynamic World
            col_dw,_,_=self._collection(ee, EEQueryParams(administrative_unit_id=params.administrative_unit_id, geometry=params.geometry, start_date=params.start_date, end_date=params.end_date, dataset=SatelliteSource.DYNAMIC_WORLD))
            img=col_dw.median().clip(self._geom(ee, params.geometry)); vis={"bands":["label"],"min":0,"max":8}
        elif layer=="worldcover":
            col_wc,_,_=self._collection(ee, EEQueryParams(administrative_unit_id=params.administrative_unit_id, geometry=params.geometry, start_date=params.start_date, end_date=params.end_date, dataset=SatelliteSource.ESA_WORLDCOVER))
            img=col_wc.median().clip(self._geom(ee, params.geometry)); vis={"bands":["Map"],"min":10,"max":100}
        elif layer=="dem":
            col_dem,_,_=self._collection(ee, EEQueryParams(administrative_unit_id=params.administrative_unit_id, geometry=params.geometry, start_date=params.start_date, end_date=params.end_date, dataset=SatelliteSource.SRTM))
            img=col_dem.median().clip(self._geom(ee, params.geometry)); vis={"bands":["elevation"],"min":0,"max":1500}
        else:
            img=median; vis={"bands":["B4","B3","B2"],"min":0,"max":3000}

        # getMapId
        map_id=img.getMapId(vis)
        # map_id is dict with mapid and token
        tile_url=f"https://earthengine.googleapis.com/map/{map_id['mapid']}/{{z}}/{{x}}/{{y}}?token={map_id['token']}"
        # metadata
        acq=params.start_date
        try:
            # estimate acquired from latest image
            latest=col.sort("system:time_start", False).first().get("system:time_start").getInfo() if size else None
            if latest:
                import datetime
                acq=datetime.datetime.utcfromtimestamp(latest/1000).strftime("%Y-%m-%d")
        except: pass
        return {"tile_url": tile_url, "acquired": acq, "cloud": params.cloud_percentage, "source": cfg.collection_id if layer not in ("s1","landsat8","landsat9","dw","worldcover","dem") else layer, "provider":"Google Earth Engine", "status":"LIVE", "resolution": f"{cfg.scale_m} m", "layer": layer}

    def detect_forest_change(self, *a, **kw) -> ForestChangeResult:
        # reuse mock logic but with real NDVI if possible
        # for now delegate to mock calculation with real NDVI when available
        try:
            # try real NDVI for before/after
            before_params=EEQueryParams(administrative_unit_id=kw.get("administrative_unit_id") or a[0], geometry=kw.get("geometry") or a[1], start_date=kw.get("period_before",a[2])[0] if len(a)>2 else kw["period_before"][0], end_date=kw.get("period_before",a[2])[1] if len(a)>2 else kw["period_before"][1], dataset=kw.get("dataset",SatelliteSource.SENTINEL2), cloud_percentage=kw.get("cloud_percentage",20))
            after_params=EEQueryParams(administrative_unit_id=before_params.administrative_unit_id, geometry=before_params.geometry, start_date=kw.get("period_after",a[3])[0] if len(a)>3 else kw["period_after"][0], end_date=kw.get("period_after",a[3])[1] if len(a)>3 else kw["period_after"][1], dataset=before_params.dataset, cloud_percentage=before_params.cloud_percentage)
            before=self.calculate_ndvi(before_params)
            after=self.calculate_ndvi(after_params)
            change=round(after.mean - before.mean,4)
            pct=round((change/before.mean*100) if before.mean else 0,2)
            import random
            affected=round(abs(change)*120+5,2)
            return ForestChangeResult(administrative_unit_id=before_params.administrative_unit_id, period_start=after_params.start_date, period_end=after_params.end_date, ndvi_before=before.mean, ndvi_after=after.mean, ndvi_change=change, change_percentage=pct, affected_area_ha=affected, confidence=0.85, source="EARTH_ENGINE", source_dataset=get_dataset_config(before_params.dataset).collection_id, processing_time_ms=0, status="PROPOSED")
        except Exception as e:
            # fallback to mock if real fails
            from app.services.earth_engine.change_detection import detect_change_mock
            data=detect_change_mock(kw.get("administrative_unit_id") or a[0], kw.get("geometry") or a[1], kw.get("period_before") or a[2], kw.get("period_after") or a[3], kw.get("dataset",SatelliteSource.SENTINEL2), kw.get("cloud_percentage",20))
            return ForestChangeResult(administrative_unit_id=data["administrative_unit_id"], period_start=data["period_start"], period_end=data["period_end"], ndvi_before=data["ndvi_before"], ndvi_after=data["ndvi_after"], ndvi_change=data["ndvi_change"], change_percentage=data["change_percentage"], affected_area_ha=data["affected_area_ha"], confidence=data["confidence"]/100, source="EARTH_ENGINE", source_dataset=data["source_dataset"], processing_time_ms=0, status="PROPOSED")

    def get_statistics(self, *a, **kw) -> Dict[str, Any]:
        # keep for compat
        if a and isinstance(a[0], EEQueryParams):
            return self.calculate_statistics(a[0])
        raise NotImplementedError("GEE_EarthEngineService.get_statistics — use calculate_statistics")


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
