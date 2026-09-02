"""Pipeline models — RAW / PROCESSED / AI_RESULT / PROPOSAL / VERIFIED + NDVI."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import DataStage, ProposalStatus
from app.database import Base


class RawData(Base):
    """RAW DATA — data pulled from provider (GEE, weather, etc.) before processing."""
    __tablename__ = "raw_data"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    administrative_unit_id: Mapped[str] = mapped_column(String(36), ForeignKey("administrative_units.id"), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)  # DataSourceType
    source_dataset: Mapped[str | None] = mapped_column(String(200), nullable=True)
    query_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("ee_query_logs.id"), nullable=True)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProcessedData(Base):
    """PROCESSED DATA — data after EE processing (cloud masking, NDVI, etc.)."""
    __tablename__ = "processed_data"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    raw_data_id: Mapped[str] = mapped_column(String(36), ForeignKey("raw_data.id"), nullable=False)
    administrative_unit_id: Mapped[str] = mapped_column(String(36), ForeignKey("administrative_units.id"), nullable=False)
    processing_type: Mapped[str] = mapped_column(String(50), nullable=False, default="NDVI")
    result: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    raw_data: Mapped[RawData] = relationship(RawData)


class AIAnalysisResult(Base):
    """AI RESULT — output of ForestGuard / other agents with confidence."""
    __tablename__ = "ai_analysis_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_name: Mapped[str] = mapped_column(String(50), nullable=False, default="ForestGuard")
    administrative_unit_id: Mapped[str] = mapped_column(String(36), ForeignKey("administrative_units.id"), nullable=False)
    processed_data_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("processed_data.id"), nullable=True)

    # NDVI fields (Section 8)
    ndvi_mean: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_median: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_change: Mapped[float | None] = mapped_column(Float, nullable=True)
    change_percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_anomaly: Mapped[float | None] = mapped_column(Float, nullable=True)
    affected_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    period_start: Mapped[str | None] = mapped_column(String(20), nullable=True)
    period_end: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source_dataset: Mapped[str | None] = mapped_column(String(200), nullable=True)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)  # full JSON

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DataProposal(Base):
    """DATA PROPOSAL — Section 18 governance: AI never writes VERIFIED directly."""
    __tablename__ = "data_proposals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ai_result_id: Mapped[str] = mapped_column(String(36), ForeignKey("ai_analysis_results.id"), nullable=False)
    administrative_unit_id: Mapped[str] = mapped_column(String(36), ForeignKey("administrative_units.id"), nullable=False)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default=ProposalStatus.PENDING.value)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)

    proposed_by: Mapped[str] = mapped_column(String(50), nullable=False, default="ForestGuard")
    # Phase 2 fields (Sec 15)
    agent_id: Mapped[str | None] = mapped_column(String(50), nullable=True)  # e.g. ForestGuard
    data_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(String(300), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0-100
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)  # admin user id
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    ai_result: Mapped[AIAnalysisResult] = relationship(AIAnalysisResult)


class VerifiedData(Base):
    """VERIFIED DATA — only created after ADMIN APPROVE."""
    __tablename__ = "verified_data"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    administrative_unit_id: Mapped[str] = mapped_column(String(36), ForeignKey("administrative_units.id"), nullable=False)
    proposal_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_proposals.id"), nullable=False)
    ai_result_id: Mapped[str] = mapped_column(String(36), ForeignKey("ai_analysis_results.id"), nullable=False)

    data_type: Mapped[str] = mapped_column(String(50), nullable=False, default="FOREST_CHANGE")
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_demo: Mapped[bool] = mapped_column(default=False)

    proposal: Mapped[DataProposal] = relationship(DataProposal)
