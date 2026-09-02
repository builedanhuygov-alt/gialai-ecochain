from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel, Field
from app.core.enums import ProposalStatus

class MonitorRequest(BaseModel):
    administrative_unit_id: str
    start_date: str = Field(description="ISO date 2026-01-01")
    end_date: str
    cloud_percentage: int = Field(default=20, ge=0, le=100)
    dataset: str = Field(default="SENTINEL2")
    geometry: Optional[dict] = None  # if not supplied, fetch from DB

class ProposalOut(BaseModel):
    id: str
    status: str
    title: str
    administrative_unit_id: str
    class Config:
        from_attributes = True

class ApprovalRequest(BaseModel):
    verified_by: str = "admin"
    reason: Optional[str] = None
