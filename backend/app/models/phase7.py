"""Phase7 autonomous models."""
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, Float, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
class Plan(Base):
    __tablename__="plans"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    goal: Mapped[str]=mapped_column(Text, nullable=False)
    goal_type: Mapped[str]=mapped_column(String(30), default="ENVIRONMENTAL_PROTECTION")
    created_by: Mapped[str]=mapped_column(String(50), default="admin")
    priority: Mapped[str]=mapped_column(String(20), default="MEDIUM")
    scope: Mapped[str]=mapped_column(Text, nullable=True) # JSON
    agents: Mapped[str]=mapped_column(Text, nullable=True) # JSON list
    constraints: Mapped[str]=mapped_column(Text, nullable=True)
    assumptions: Mapped[str]=mapped_column(Text, nullable=True)
    simulation_results: Mapped[str]=mapped_column(Text, nullable=True)
    recommendations: Mapped[str]=mapped_column(Text, nullable=True)
    approval_status: Mapped[str]=mapped_column(String(20), default="PENDING_APPROVAL") # PENDING_APPROVAL/APPROVED/REJECTED
    execution_status: Mapped[str]=mapped_column(String(20), default="QUEUED") # QUEUED/RUNNING/COMPLETED/FAILED
    trace_id: Mapped[str]=mapped_column(String(30), default=lambda: f"TRACE-{uuid.uuid4().hex[:8].upper()}")
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class PlanTask(Base):
    __tablename__="plan_tasks"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id: Mapped[str]=mapped_column(String(36), nullable=False)
    name: Mapped[str]=mapped_column(String(150), nullable=False)
    agent: Mapped[str]=mapped_column(String(30), nullable=True)
    dependencies: Mapped[str]=mapped_column(Text, nullable=True) # JSON list ids
    status: Mapped[str]=mapped_column(String(20), default="PENDING")
    result: Mapped[str]=mapped_column(Text, nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class Mission(Base):
    __tablename__="missions"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    goal: Mapped[str]=mapped_column(Text, nullable=False)
    scope: Mapped[str]=mapped_column(String(200), nullable=True)
    deadline: Mapped[str]=mapped_column(String(20), nullable=True)
    kpis: Mapped[str]=mapped_column(Text, nullable=True)
    agents: Mapped[str]=mapped_column(Text, nullable=True)
    resources: Mapped[str]=mapped_column(Text, nullable=True)
    status: Mapped[str]=mapped_column(String(20), default="ACTIVE")
    trace_id: Mapped[str]=mapped_column(String(30), default=lambda: f"TRACE-{uuid.uuid4().hex[:8].upper()}")
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class LearningRecord(Base):
    __tablename__="learning_records"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    prediction: Mapped[str]=mapped_column(Text, nullable=True)
    action: Mapped[str]=mapped_column(Text, nullable=True)
    outcome: Mapped[str]=mapped_column(Text, nullable=True)
    prediction_correct: Mapped[int]=mapped_column(Integer, default=0)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class Approval(Base):
    __tablename__="approvals"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id: Mapped[str]=mapped_column(String(36), nullable=False)
    action: Mapped[str]=mapped_column(String(30), nullable=False) # CREATE_OFFICIAL_ALERT etc Sec29
    status: Mapped[str]=mapped_column(String(20), default="PENDING")
    approved_by: Mapped[str]=mapped_column(String(50), nullable=True)
    reason: Mapped[str]=mapped_column(Text, nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class ModelRegistryEntry(Base):
    __tablename__="model_registry"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    model: Mapped[str]=mapped_column(String(30), nullable=False)
    version: Mapped[str]=mapped_column(String(20), nullable=False)
    training_data: Mapped[str]=mapped_column(Text, nullable=True)
    metrics: Mapped[str]=mapped_column(Text, nullable=True)
    deployment_status: Mapped[str]=mapped_column(String(20), default="STAGING")
    approved_by: Mapped[str]=mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
class AgentConflictRecord(Base):
    __tablename__="agent_conflicts"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agents: Mapped[str]=mapped_column(Text, nullable=False)
    claims: Mapped[str]=mapped_column(Text, nullable=True)
    severity: Mapped[str]=mapped_column(String(20), default="MEDIUM")
    resolution: Mapped[str]=mapped_column(Text, nullable=True)
    resolved_by: Mapped[str]=mapped_column(String(50), nullable=True)
    status: Mapped[str]=mapped_column(String(20), default="OPEN")
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), server_default=func.now())
