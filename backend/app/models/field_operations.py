"""Durable field verification work items and evidence metadata."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


FIELD_TASK_STATUSES = ("PENDING", "IN_PROGRESS", "VERIFIED", "REJECTED")


class OperationalWorkItem(Base):
    """A field acceptance item imported from the canonical CSV worklists."""

    __tablename__ = "operational_work_items"
    __table_args__ = (UniqueConstraint("task_id", name="uq_operational_work_item_task_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(String(40), nullable=False)
    campaign: Mapped[str | None] = mapped_column(String(30), nullable=True)
    phase: Mapped[str] = mapped_column(String(30), nullable=False)
    target_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target: Mapped[str] = mapped_column(String(500), nullable=False)
    required_fields: Mapped[str] = mapped_column(Text, nullable=False)
    acceptance: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="P1")
    verified_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    verification_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    evidence_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())