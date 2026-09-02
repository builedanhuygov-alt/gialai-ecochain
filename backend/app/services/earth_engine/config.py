"""Dataset configuration layer — no dataset IDs hard-coded in business logic."""
from dataclasses import dataclass
from typing import Dict

from app.core.enums import SatelliteSource


@dataclass(frozen=True)
class DatasetConfig:
    collection_id: str
    description: str
    nir_band: str
    red_band: str
    scale_m: int
    cloud_property: str = "CLOUDY_PIXEL_PERCENTAGE"


# Single source of truth for satellite collections.
# Phase 2 can swap dataset by editing this file only. Phase8 extends to S1/SRTM/DynamicWorld/WorldCover
DATASETS: Dict[SatelliteSource, DatasetConfig] = {
    SatelliteSource.SENTINEL2: DatasetConfig(
        collection_id="COPERNICUS/S2_SR_HARMONIZED",
        description="Sentinel-2 Surface Reflectance Harmonized",
        nir_band="B8",
        red_band="B4",
        scale_m=10,
        cloud_property="CLOUDY_PIXEL_PERCENTAGE",
    ),
    SatelliteSource.SENTINEL1: DatasetConfig(
        collection_id="COPERNICUS/S1_GRD",
        description="Sentinel-1 SAR GRD",
        nir_band="VV",
        red_band="VH",
        scale_m=10,
    ),
    SatelliteSource.LANDSAT8: DatasetConfig(
        collection_id="LANDSAT/LC08/C02/T1_L2",
        description="Landsat 8 Collection 2 Tier 1 Level 2",
        nir_band="SR_B5",
        red_band="SR_B4",
        scale_m=30,
        cloud_property="CLOUD_COVER",
    ),
    SatelliteSource.LANDSAT9: DatasetConfig(
        collection_id="LANDSAT/LC09/C02/T1_L2",
        description="Landsat 9 Collection 2 Tier 1 Level 2",
        nir_band="SR_B5",
        red_band="SR_B4",
        scale_m=30,
        cloud_property="CLOUD_COVER",
    ),
    SatelliteSource.SRTM: DatasetConfig(
        collection_id="USGS/SRTMGL1_003",
        description="SRTM DEM 30m",
        nir_band="elevation",
        red_band="slope",
        scale_m=30,
    ),
    SatelliteSource.NASADEM: DatasetConfig(
        collection_id="NASA/NASADEM_HGT/001",
        description="NASADEM HGT",
        nir_band="elevation",
        red_band="elevation",
        scale_m=30,
    ),
    SatelliteSource.DYNAMIC_WORLD: DatasetConfig(
        collection_id="GOOGLE/DYNAMICWORLD/V1",
        description="Dynamic World V1",
        nir_band="label",
        red_band="label",
        scale_m=10,
    ),
    SatelliteSource.ESA_WORLDCOVER: DatasetConfig(
        collection_id="ESA/WorldCover/v200",
        description="ESA WorldCover v200",
        nir_band="Map",
        red_band="Map",
        scale_m=10,
    ),
}


def get_dataset_config(source: SatelliteSource) -> DatasetConfig:
    if source not in DATASETS:
        raise ValueError(f"Unsupported satellite source: {source}")
    return DATASETS[source]
