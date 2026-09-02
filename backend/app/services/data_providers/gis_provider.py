from __future__ import annotations
import random
from app.core.enums import DataSourceType
from app.services.data_providers.base import DataProvider, ProviderQuery, ProviderResult

class GISProvider(DataProvider):
    @property
    def source_type(self) -> DataSourceType:
        return DataSourceType.GIS
    def fetch(self, query: ProviderQuery) -> ProviderResult:
        rng = random.Random(hash(query.administrative_unit_id) & 0xFFFFFFFF)
        return ProviderResult(
            source=DataSourceType.GIS,
            dataset="GIS/MOCK",
            data={
                "elevation_m": round(rng.uniform(50, 1200), 1),
                "slope_deg": round(rng.uniform(0, 30), 1),
                "land_cover": rng.choice(["forest", "cropland", "shrub", "urban"]),
            },
            metadata={"provider": "mock"},
        )
