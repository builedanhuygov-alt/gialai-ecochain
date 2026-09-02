"""Digital Twin 5.0 + Scenario + Investment."""
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
class TwinState(Base):
    __tablename__="twin_states"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type: Mapped[str]=mapped_column(String(30), nullable=False) # Province/Forest etc
    entity_id: Mapped[str]=mapped_column(String(36), nullable=False)
    state: Mapped[str]=mapped_column(String(20), nullable=False) # CURRENT/HISTORICAL/FORECAST/SIMULATED/TARGET/ACTUAL Sec3
    payload: Mapped[str]=mapped_column(Text, nullable=True) # JSON
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class Scenario(Base):
    __tablename__="scenarios"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str]=mapped_column(String(100), nullable=False)
    type: Mapped[str]=mapped_column(String(30), default="CLIMATE") # Sec6
    params: Mapped[str]=mapped_column(Text, nullable=True) # JSON rainfall/temp etc
    baseline_id: Mapped[str]=mapped_column(String(36), nullable=True)
    version: Mapped[int]=mapped_column(Integer, default=1) # Sec69
    forked_from: Mapped[str]=mapped_column(String(36), nullable=True)
    changelog: Mapped[str]=mapped_column(Text, nullable=True)
    status: Mapped[str]=mapped_column(String(20), default="DRAFT")
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class ScenarioScore(Base):
    __tablename__="scenario_scores"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_id: Mapped[str]=mapped_column(String(36), nullable=False)
    risk: Mapped[int]=mapped_column(Integer, default=50)
    cost: Mapped[int]=mapped_column(Integer, default=50)
    co2: Mapped[int]=mapped_column(Integer, default=50)
    forest: Mapped[int]=mapped_column(Integer, default=50)
    agriculture: Mapped[int]=mapped_column(Integer, default=50)
    logistics: Mapped[int]=mapped_column(Integer, default=50)
    resilience: Mapped[int]=mapped_column(Integer, default=50)
    eudr: Mapped[int]=mapped_column(Integer, default=50)
    community: Mapped[int]=mapped_column(Integer, default=50)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class InvestmentPlan(Base):
    __tablename__="investment_plans"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    budget: Mapped[int]=mapped_column(Integer, nullable=False)
    allocation: Mapped[str]=mapped_column(Text, nullable=True) # JSON Sec33
    risk_reduction: Mapped[int]=mapped_column(Integer, default=0)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class DataGap(Base):
    __tablename__="data_gaps"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    gap_type: Mapped[str]=mapped_column(String(30), nullable=False) # missing/stale/low coverage
    description: Mapped[str]=mapped_column(Text, nullable=True)
    priority: Mapped[str]=mapped_column(String(20), default="MEDIUM")
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
