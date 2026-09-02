from app.services.data_providers.base import DataProvider, ProviderQuery, ProviderResult
from app.services.data_providers.earth_engine_provider import EarthEngineProvider
from app.services.data_providers.weather_provider import WeatherProvider
from app.services.data_providers.gis_provider import GISProvider
from app.services.data_providers.news_provider import NewsProvider
from app.services.data_providers.admin_input_provider import AdminInputProvider

__all__ = [
    "DataProvider",
    "ProviderQuery",
    "ProviderResult",
    "EarthEngineProvider",
    "WeatherProvider",
    "GISProvider",
    "NewsProvider",
    "AdminInputProvider",
]

# Registry for Phase 2 dynamic selection
PROVIDER_REGISTRY: dict[str, type[DataProvider]] = {
    "EARTH_ENGINE": EarthEngineProvider,
    "WEATHER": WeatherProvider,
    "GIS": GISProvider,
    "NEWS": NewsProvider,
    "ADMIN_INPUT": AdminInputProvider,
}

def get_provider(name: str) -> DataProvider:
    cls = PROVIDER_REGISTRY.get(name.upper())
    if not cls:
        raise ValueError(f"Unknown provider: {name}")
    return cls()
