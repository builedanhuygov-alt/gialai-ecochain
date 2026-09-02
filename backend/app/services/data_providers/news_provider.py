from __future__ import annotations
import random
from app.core.enums import DataSourceType
from app.services.data_providers.base import DataProvider, ProviderQuery, ProviderResult

class NewsProvider(DataProvider):
    @property
    def source_type(self) -> DataSourceType:
        return DataSourceType.NEWS
    def fetch(self, query: ProviderQuery) -> ProviderResult:
        return ProviderResult(
            source=DataSourceType.NEWS,
            dataset="NEWS/MOCK",
            data={"articles": [], "note": "Phase 2: plug news/GDELT API"},
            metadata={"provider": "mock"},
        )
