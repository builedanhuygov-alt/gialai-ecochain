"""Earth Engine Query Log — Section 15 + lineage."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EEQueryLog(Base):
    __tablename__ = "ee_query_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g. ForestGuard
    dataset: Mapped[str] = mapped_column(String(200), nullable=False)
    geometry_reference: Mapped[str | None] = mapped_column(String(36), nullable=True)  # administrative_unit_id
    geometry_geojson: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    end_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cloud_filter: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DataLineage(Base):
    """Section 14 — trace Verified → Verification → Proposal → AI → Processed → Query → Dataset."""
    __tablename__ = "data_lineage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    verified_data_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    proposal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    ai_result_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    processed_data_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    raw_data_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    query_log_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    dataset: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AutomationStatus(Base):
    """Section 16 — dashboard status for agents / GEE."""
    __tablename__ = "automation_status"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_name: Mapped[str] = mapped_column(String(50), nullable=False)  # ForestGuard, EarthEngine
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="NOT_CONFIGURED")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
