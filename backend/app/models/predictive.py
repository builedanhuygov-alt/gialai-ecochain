"""Phase6 predictive models."""
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
class Forecast(Base):
    __tablename__="forecasts"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent: Mapped[str]=mapped_column(String(30), nullable=False)
    risk_type: Mapped[str]=mapped_column(String(30), nullable=False)
    administrative_unit_id: Mapped[str]=mapped_column(String(36), nullable=False)
    horizon: Mapped[str]=mapped_column(String(20), nullable=False) # 24h/3d/7d/30d
    forecast: Mapped[str]=mapped_column(Text, nullable=False) # JSON list
    confidence: Mapped[int]=mapped_column(Integer, default=70)
    model_version: Mapped[str]=mapped_column(String(20), default="v1.0")
    data_state: Mapped[str]=mapped_column(String(20), default="PREDICTED")
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class Simulation(Base):
    __tablename__="simulations"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario: Mapped[str]=mapped_column(String(50), nullable=False) # FIRE/FLOOD etc
    params: Mapped[str]=mapped_column(Text, nullable=True)
    result: Mapped[str]=mapped_column(Text, nullable=True)
    affected_villages: Mapped[int]=mapped_column(Integer, default=0)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class ModelMetric(Base):
    __tablename__="model_metrics"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    model: Mapped[str]=mapped_column(String(30), nullable=False)
    version: Mapped[str]=mapped_column(String(20), nullable=False)
    accuracy: Mapped[float]=mapped_column(Float, default=0.85)
    false_positive: Mapped[float]=mapped_column(Float, default=0.1)
    false_negative: Mapped[float]=mapped_column(Float, default=0.08)
    drift_detected: Mapped[int]=mapped_column(Integer, default=0)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class Contributor(Base):
    __tablename__="contributors"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str]=mapped_column(String(36), unique=True, nullable=False)
    report_count: Mapped[int]=mapped_column(Integer, default=0)
    verified_count: Mapped[int]=mapped_column(Integer, default=0)
    false_rate: Mapped[float]=mapped_column(Float, default=0.0)
    reputation: Mapped[int]=mapped_column(Integer, default=70)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class EarlyWarning(Base):
    __tablename__="early_warnings"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    risk_type: Mapped[str]=mapped_column(String(30), nullable=False)
    administrative_unit_id: Mapped[str]=mapped_column(String(36), nullable=False)
    level: Mapped[str]=mapped_column(String(20), default="WATCH") # NORMAL/WATCH/WARNING/CRITICAL
    message: Mapped[str]=mapped_column(Text, nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
