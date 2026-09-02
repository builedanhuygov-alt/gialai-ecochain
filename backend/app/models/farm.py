"""Phase 4 Farm/Plot/Lot/Supply-chain models."""
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Farmer(Base):
    __tablename__ = "farmers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)  # private
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Farm(Base):
    __tablename__ = "farms"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    farm_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(String(36), nullable=True)  # farmer.id
    owner_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    geometry: Mapped[str | None] = mapped_column(Text, nullable=True)  # GeoJSON polygon
    crop_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    production_period: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    data_quality: Mapped[str] = mapped_column(String(20), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Plot(Base):
    __tablename__ = "plots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    farm_id: Mapped[str] = mapped_column(String(36), nullable=False)
    geometry: Mapped[str] = mapped_column(Text, nullable=False)  # Polygon GeoJSON
    area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    crop_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    forest_overlap_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    forest_risk: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="VERIFIED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class ProcessingFacility(Base):
    __tablename__ = "processing_facilities"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    geometry: Mapped[str | None] = mapped_column(Text, nullable=True)
    capacity_t: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class ProductionLot(Base):
    __tablename__ = "production_lots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lot_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)  # GL-2026-00001
    farm_id: Mapped[str] = mapped_column(String(36), nullable=False)
    plot_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    facility_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    crop_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    harvest_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    quantity_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    traceability_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    eudr_status: Mapped[str] = mapped_column(String(20), default="REVIEW_REQUIRED")
    data_quality: Mapped[str] = mapped_column(String(20), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

# Logistics network Sec19
class CollectionPoint(Base):
    __tablename__ = "collection_points"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    geometry: Mapped[str | None] = mapped_column(Text, nullable=True)
    capacity_t: Mapped[float | None] = mapped_column(Float, nullable=True)
    operating_status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Warehouse(Base):
    __tablename__ = "warehouses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    geometry: Mapped[str | None] = mapped_column(Text, nullable=True)
    capacity_t: Mapped[float | None] = mapped_column(Float, nullable=True)
    operating_status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plate: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(String(30), default="TRUCK")
    capacity_kg: Mapped[float] = mapped_column(Float, default=5000)
    fuel_type: Mapped[str] = mapped_column(String(20), default="DIESEL")
    emission_factor: Mapped[float] = mapped_column(Float, default=0.12)  # kg CO2e per km
    operating_status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Route(Base):
    __tablename__ = "routes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    origin: Mapped[str] = mapped_column(String(200), nullable=False)
    destination: Mapped[str] = mapped_column(String(200), nullable=False)
    waypoints: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    time_min: Mapped[int] = mapped_column(Integer, default=60)
    risk_level: Mapped[str] = mapped_column(String(20), default="LOW")
    geometry: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Trip(Base):
    __tablename__ = "trips"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    route_id: Mapped[str] = mapped_column(String(36), nullable=False)
    vehicle_id: Mapped[str] = mapped_column(String(36), nullable=False)
    lot_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    load_kg: Mapped[float] = mapped_column(Float, default=0)
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    emission_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    methodology: Mapped[str] = mapped_column(String(50), default="GREEN_LOGISTICS_V1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

# Extended carbon inventory Sec15 + methodology Sec16 already in risk.py CarbonRecord/CarbonModel; add EUDR-specific inventory if needed
class CarbonInventory(Base):
    __tablename__ = "carbon_inventory"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)  # FARM/PLOT/LOT/TRIP
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    carbon_stock: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbon_change: Mapped[float | None] = mapped_column(Float, nullable=True)
    emission: Mapped[float | None] = mapped_column(Float, nullable=True)
    removal: Mapped[float | None] = mapped_column(Float, nullable=True)
    methodology: Mapped[str] = mapped_column(String(50), default="FOREST_BIOMASS_V1")
    confidence: Mapped[int] = mapped_column(Integer, default=60)
    model_version: Mapped[str] = mapped_column(String(20), default="v1.0")
    verification_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
