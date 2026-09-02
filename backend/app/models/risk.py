"""Phase 3 risk / alert / incident / carbon / ranking / achievement models — Sec 59."""
from __future__ import annotations
import uuid
from datetime import datetime, timedelta
from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class RiskSignal(Base):
    __tablename__ = "risk_signals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent: Mapped[str] = mapped_column(String(30), nullable=False)  # ForestGuard/DisasterGuard/CarbonGuard/RiskEngine
    risk_type: Mapped[str] = mapped_column(String(30), nullable=False)  # FIRE/FLOOD/LANDSLIDE/DROUGHT/HEAT/FOREST/CARBON/OVERALL
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-100
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-100 distinct
    level: Mapped[str] = mapped_column(String(20), nullable=False)  # LOW..CRITICAL
    model_version: Mapped[str] = mapped_column(String(20), default="v1.0")
    data_sources: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_quality: Mapped[str] = mapped_column(String(10), default="MEDIUM")  # HIGH/MEDIUM/LOW
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class RiskScore(Base):
    __tablename__ = "risk_scores"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False)
    overall_level: Mapped[str] = mapped_column(String(20), nullable=False)
    breakdown: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON {fire:.., flood:..}
    confidence: Mapped[int] = mapped_column(Integer, default=70)
    model_version: Mapped[str] = mapped_column(String(20), default="v1.0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class RiskHistory(Base):
    __tablename__ = "risk_history"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    risk_type: Mapped[str] = mapped_column(String(30), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=False)  # 2026-09
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    risk_signal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    risk_type: Mapped[str] = mapped_column(String(30), nullable=False)
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    level: Mapped[str] = mapped_column(String(20), default="WARNING")  # INFO/WATCH/WARNING/HIGH/CRITICAL
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")  # PROPOSED/ACTIVE/ACKNOWLEDGED/RESOLVED/EXPIRED/REJECTED
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="NORMAL")
    geometry: Mapped[str | None] = mapped_column(Text, nullable=True)  # GeoJSON
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_version: Mapped[str] = mapped_column(String(20), default="v1.0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    alert_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class IncidentEvidence(Base):
    __tablename__ = "incident_evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id: Mapped[str] = mapped_column(String(36), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(30), nullable=False)  # PHOTO/SATELLITE/WEATHER/COMMUNITY
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent: Mapped[str] = mapped_column(String(30), nullable=False)
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="COMPLETED")
    model_version: Mapped[str] = mapped_column(String(20), default="v1.0")
    input_params: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class AgentResult(Base):
    __tablename__ = "agent_results"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(String(36), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class CarbonRecord(Base):
    __tablename__ = "carbon_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=False)
    forest_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbon_stock_t: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbon_change_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[int] = mapped_column(Integer, default=60)
    model_version: Mapped[str] = mapped_column(String(20), default="v1.0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class CarbonModel(Base):
    __tablename__ = "carbon_models"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    biomass_factor: Mapped[float] = mapped_column(Float, default=150.0)
    carbon_factor: Mapped[float] = mapped_column(Float, default=0.47)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class RankingSnapshot(Base):
    __tablename__ = "ranking_snapshots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ranking_type: Mapped[str] = mapped_column(String(40), nullable=False)  # SAFETY/RESPONSE/FOREST/COMMUNITY/PREPAREDNESS
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=False)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Achievement(Base):
    __tablename__ = "achievements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=False)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class TrustScore(Base):
    __tablename__ = "trust_scores"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    proposal_id: Mapped[str] = mapped_column(String(36), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    breakdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
