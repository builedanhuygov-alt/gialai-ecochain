from __future__ import annotations
from app.core.enums import DataSourceType
from app.services.data_providers.base import DataProvider, ProviderQuery, ProviderResult

class AdminInputProvider(DataProvider):
    """Manual input / upload provider — Phase 1 legacy ingestion path."""
    @property
    def source_type(self) -> DataSourceType:
        return DataSourceType.ADMIN_INPUT
    def fetch(self, query: ProviderQuery) -> ProviderResult:
        # Admin already supplied payload via query.extra
        payload = query.extra.get("payload", {})
        return ProviderResult(
            source=DataSourceType.ADMIN_INPUT,
            dataset="ADMIN/MANUAL",
            data=payload if isinstance(payload, dict) else {"value": payload},
            metadata={"provider": "admin_input"},
        )
