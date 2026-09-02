"""Data Fabric Sec2-9."""
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
class DataSource(Base):
    __tablename__="data_sources"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str]=mapped_column(String(100), nullable=False)
    provider: Mapped[str]=mapped_column(String(100), nullable=False)
    type: Mapped[str]=mapped_column(String(30), nullable=False)
    coverage: Mapped[str]=mapped_column(String(100), nullable=True)
    update_frequency: Mapped[str]=mapped_column(String(30), default="daily")
    reliability: Mapped[float]=mapped_column(Float, default=80)
    license: Mapped[str]=mapped_column(String(50), default="open")
    status: Mapped[str]=mapped_column(String(20), default="active")
    last_update: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class DataProvenanceRecord(Base):
    __tablename__="data_provenance"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source: Mapped[str]=mapped_column(String(100), nullable=False)
    timestamp: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
    collector: Mapped[str]=mapped_column(String(50), nullable=True)
    processor: Mapped[str]=mapped_column(String(50), nullable=True)
    model: Mapped[str]=mapped_column(String(30), nullable=True)
    verification: Mapped[str]=mapped_column(String(20), default="AI_DETECTED")
    version: Mapped[str]=mapped_column(String(20), default="v1.0")
class DataLineageRecord(Base):
    __tablename__="data_lineage_v2"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    recommendation_id: Mapped[str]=mapped_column(String(36), nullable=True)
    chain: Mapped[str]=mapped_column(Text, nullable=True) # JSON
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class DataQualityRecord(Base):
    __tablename__="data_quality"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset: Mapped[str]=mapped_column(String(100), nullable=False)
    completeness: Mapped[int]=mapped_column(Integer, default=80)
    freshness: Mapped[int]=mapped_column(Integer, default=80)
    accuracy: Mapped[int]=mapped_column(Integer, default=80)
    consistency: Mapped[int]=mapped_column(Integer, default=80)
    coverage: Mapped[int]=mapped_column(Integer, default=80)
    reliability: Mapped[int]=mapped_column(Integer, default=80)
    verification: Mapped[int]=mapped_column(Integer, default=70)
    score: Mapped[int]=mapped_column(Integer, default=80)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class DataConflictRecord(Base):
    __tablename__="data_conflicts"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_a: Mapped[str]=mapped_column(String(100), nullable=False)
    source_b: Mapped[str]=mapped_column(String(100), nullable=False)
    description: Mapped[str]=mapped_column(Text, nullable=True)
    resolution: Mapped[str]=mapped_column(String(50), default="pending")
    reliability_a: Mapped[float]=mapped_column(Float, default=80)
    reliability_b: Mapped[float]=mapped_column(Float, default=70)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
