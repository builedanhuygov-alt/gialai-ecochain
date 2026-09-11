"""Curated real water assets — reservoirs / hydro / irrigation / lakes.

Source: operator-supplied inventory (16 sites, capacities + managers).
Runs on SQLite today (lon/lat floats); backend/postgis_init.sql carries the
matching PostGIS DDL (Point 4326 + GIST + <-> nearest) for production Postgres.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

WATER_TYPES = ("reservoir", "hydro", "irrigation", "lake")
WATER_STATUS = ("verified", "cần xác minh")


class WaterAsset(Base):
    __tablename__ = "water_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(20), nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    commune: Mapped[str | None] = mapped_column(String(100), nullable=True)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    province: Mapped[str] = mapped_column(String(50), default="Gia Lai")
    capacity_m3: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    water_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    manager: Mapped[str | None] = mapped_column(String(255), nullable=True)
    road_access: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="cần xác minh")
    google_maps_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    has_streetview: Mapped[bool] = mapped_column(Boolean, default=False)
    # extension (not in the original spec): resolved commune code for joins
    commune_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
