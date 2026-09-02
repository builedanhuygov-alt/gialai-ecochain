from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel, Field

class AdministrativeUnitCreate(BaseModel):
    name: str
    level: str  # PROVINCE | COMMUNE | VILLAGE | ...
    parent_id: Optional[str] = None
    code: Optional[str] = None
    geometry: Optional[dict] = None  # GeoJSON
    is_demo: bool = False

class AdministrativeUnitOut(BaseModel):
    id: str
    name: str
    level: str
    parent_id: Optional[str]
    code: Optional[str]
    geometry: Optional[dict] = None
    centroid_lat: Optional[float] = None
    centroid_lng: Optional[float] = None
    area_ha: Optional[float] = None
    is_demo: bool
    class Config:
        from_attributes = True
