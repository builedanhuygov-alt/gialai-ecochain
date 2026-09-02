"""Audit log helper — Sec 20/27."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.ops import AuditLog


def audit_log(db: Session, action: str, resource_type: str | None = None, resource_id: str | None = None,
              actor_id: str | None = None, detail: str | None = None) -> AuditLog:
    entry = AuditLog(action=action, resource_type=resource_type, resource_id=resource_id, actor_id=actor_id, detail=detail)
    db.add(entry)
    db.flush()
    return entry
