"""Field missions — closed field loop (early-warning scope)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

MISSION_STATUSES = ("NEW", "ASSIGNED", "IN_PROGRESS", "DONE")
MISSION_NEXT = {"NEW": ("ASSIGNED",), "ASSIGNED": ("IN_PROGRESS",), "IN_PROGRESS": ("DONE",), "DONE": ()}
MISSION_OUTCOMES = ("CONFIRMED_FIRE", "FALSE_ALARM", "RESOLVED")

# Fixed field procedure (steps, not data — no numbers invented).
FIELD_CHECKLIST = [
    "Đến tọa độ mục tiêu (trong ~1 km)",
    "Chụp ảnh hiện trường kèm GPS + giờ",
    "Xác nhận có/không có cháy",
    "Ghi chú thảm thực bì, gió, dấu vết lửa",
    "Gửi kết quả trong 24 giờ",
]


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    area: Mapped[str] = mapped_column(String(300), nullable=False)
    cell_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_at_creation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="NORMAL")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="NEW")
    assignee: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    checklist: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list of done step indices
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FieldResult(Base):
    __tablename__ = "field_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    mission_id: Mapped[str] = mapped_column(String(36), ForeignKey("missions.id"), nullable=False)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    reporter_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
