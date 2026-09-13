"""Community verification models — Sec 16-24."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CommunityConfirmation(Base):
    """Sec 17 — one user confirms a proposal once, not own report."""
    __tablename__ = "community_confirmations"
    __table_args__ = (UniqueConstraint("proposal_id", "user_id", name="uq_proposal_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    proposal_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_proposals.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False)  # true=confirm, false=reject
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PhotoEvidence(Base):
    """Sec 21-22 — field report photo + hash + checks."""

    __tablename__ = "photo_evidences"

    # Unified evidence pipeline (Module A): source ∈ proposal/citizen/
    # incident/field. proposal_id/report_id kept for backward compat and
    # mirror source_id when source matches.
    EVIDENCE_SOURCES = ("proposal", "citizen", "incident", "field")
    VERIFICATION_STATUSES = ("PENDING", "VERIFIED", "REJECTED")

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    proposal_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("data_proposals.id"), nullable=True)
    report_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="proposal")
    uploader_id: Mapped[str] = mapped_column(String(36), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(128), nullable=False)  # sha256 or pHash
    perceptual_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # verification workflow (Module H): PENDING → VERIFIED/REJECTED by admin;
    # duplicates stay flagged via is_duplicate/duplicate_of, never deleted silently.
    verification_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    capture_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: device, note, etc.
    # Real bytes live IN the DB (works on serverless, no object storage needed).
    # file_path is a storage key (db://photo_evidences/<id>), never a filesystem lie.
    data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    thumb: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    content_type: Mapped[str] = mapped_column(String(30), default="image/jpeg")
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    upload_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    exif_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_analysis_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    duplicate_of: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FieldVerificationTask(Base):
    """Sec 32 — Admin requests field check."""
    __tablename__ = "field_verification_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    proposal_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_proposals.id"), nullable=False)
    administrative_unit_id: Mapped[str] = mapped_column(String(36), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(20), default="HIGH")
    assigned_to: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")  # PENDING|IN_PROGRESS|COMPLETED|CANCELLED
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CitizenReport(Base):
    """Module B — persisted citizen report (was a fake in-memory response).

    Photos attach later via EvidenceService (source=citizen, report_id=id);
    until then evidence_url stays null — honestly empty, never fabricated.
    """
    __tablename__ = "citizen_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(100), nullable=False)
    report_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    administrative_unit_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
