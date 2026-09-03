"""Provider abstraction Sec47,73"""
from abc import ABC, abstractmethod
from typing import Dict, Any

class SatelliteProvider(ABC):
    @abstractmethod
    def get_tile(self, layer:str, params:Dict)->Dict: pass
    @abstractmethod
    def get_metadata(self, params:Dict)->Dict: pass

class FireProvider(ABC):
    @abstractmethod
    def get_hotspots(self, bbox:Dict)->Dict: pass

class WeatherProvider(ABC):
    @abstractmethod
    def get_current(self, lat:float, lon:float)->Dict: pass

class MockSatelliteProvider(SatelliteProvider):
    def get_tile(self, layer, params): return {"status":"DEMO DATA", "tile_url": None}
    def get_metadata(self, params): return {"status":"DEMO DATA"}

class EarthEngineSatelliteProvider(SatelliteProvider):
    def get_tile(self, layer, params):
        from app.services.earth_engine.service import EEQueryParams, get_earth_engine_service
        from app.core.enums import SatelliteSource
        svc=get_earth_engine_service()
        p=EEQueryParams(administrative_unit_id=params.get("id","query"), geometry=params["geometry"], start_date=params["start"], end_date=params["end"], cloud_percentage=params.get("cloud",20), dataset=SatelliteSource.SENTINEL2)
        return svc.get_tile(p, layer)  # type: ignore

class MockFireProvider(FireProvider):
    def get_hotspots(self, bbox): return {"status":"DEMO DATA", "hotspots":[]}
class FirmsFireProvider(FireProvider):
    def get_hotspots(self, bbox):
        from app.services.firms_service import fetch_firms
        import asyncio
        return asyncio.run(fetch_firms(bbox["lat"], bbox["lon"]))

def get_satellite_provider(use_mock:bool=False)->SatelliteProvider:
    if use_mock: return MockSatelliteProvider()
    from app.core.config import get_settings
    from app.services.earth_engine.auth import gee_auth
    from app.core.enums import GEEStatus
    s=get_settings()
    if s.gee_configured and gee_auth.status==GEEStatus.CONNECTED:
        return EarthEngineSatelliteProvider()
    return MockSatelliteProvider()
