"""Fire warning 5-level official vs AI prediction."""
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class OfficialFireWarning(Base):
    __tablename__="official_fire_warnings"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    administrative_unit_id: Mapped[str]=mapped_column(String(36), nullable=False)
    level: Mapped[str]=mapped_column(String(5), nullable=False) # I-V
    source: Mapped[str]=mapped_column(String(100), default="Cơ quan có thẩm quyền")
    issued_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
    valid_from: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
    valid_to: Mapped[datetime]=mapped_column(DateTime(timezone=True), nullable=True)
    scope: Mapped[str]=mapped_column(Text, nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())

class AIFirePrediction(Base):
    __tablename__="ai_fire_predictions"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    administrative_unit_id: Mapped[str]=mapped_column(String(36), nullable=False)
    risk_score: Mapped[int]=mapped_column(Integer, nullable=False) # 0-100
    warning_level: Mapped[str]=mapped_column(String(5), nullable=False) # I-V AI
    confidence: Mapped[int]=mapped_column(Integer, nullable=False)
    horizon: Mapped[str]=mapped_column(String(20), default="24h") # 6h/12h/24h/48h/72h
    factors: Mapped[str]=mapped_column(Text, nullable=True) # JSON
    forecast: Mapped[str]=mapped_column(Text, nullable=True) # JSON
    evidence: Mapped[str]=mapped_column(Text, nullable=True) # JSON
    model_version: Mapped[str]=mapped_column(String(20), default="v1.0")
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
