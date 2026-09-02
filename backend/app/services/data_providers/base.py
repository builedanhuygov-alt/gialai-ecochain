"""DataProvider abstraction — Section 2."""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.enums import DataSourceType


@dataclass
class ProviderQuery:
    administrative_unit_id: str
    geometry: Dict[str, Any] | None = None
    start_date: str | None = None
    end_date: str | None = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderResult:
    source: DataSourceType
    dataset: str | None = None
    data: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    fetched_at: datetime = field(default_factory=datetime.utcnow)
    is_demo: bool = False


class DataProvider(abc.ABC):
    """Interface — Phase 2 can swap providers without touching core."""

    @property
    @abc.abstractmethod
    def source_type(self) -> DataSourceType:
        ...

    @abc.abstractmethod
    def fetch(self, query: ProviderQuery) -> ProviderResult:
        """Fetch raw data for a query. Should not crash on external failure."""
        ...

    def health_check(self) -> Dict[str, Any]:
        return {"source": self.source_type.value, "status": "OK"}
