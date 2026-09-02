"""WeatherProvider stub — Phase 2 plugs real API (OpenWeather, etc.)."""
from __future__ import annotations

import random
from app.core.enums import DataSourceType
from app.services.data_providers.base import DataProvider, ProviderQuery, ProviderResult


class WeatherProvider(DataProvider):
    @property
    def source_type(self) -> DataSourceType:
        return DataSourceType.WEATHER

    def fetch(self, query: ProviderQuery) -> ProviderResult:
        seed = hash(query.administrative_unit_id) & 0xFFFFFFFF
        rng = random.Random(seed)
        return ProviderResult(
            source=DataSourceType.WEATHER,
            dataset="WEATHER/MOCK",
            data={
                "temperature_c": round(rng.uniform(22, 34), 1),
                "humidity_pct": round(rng.uniform(55, 95), 1),
                "rainfall_mm": round(rng.uniform(0, 80), 1),
                "period": f"{query.start_date} → {query.end_date}",
            },
            metadata={"provider": "mock", "note": "Phase 2: replace with real weather API"},
        )
