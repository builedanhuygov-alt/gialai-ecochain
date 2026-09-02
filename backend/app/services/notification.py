"""Notification service — Sec 30."""
from __future__ import annotations

import json
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.ops import Notification


def notify_forest_alert(db: Session, payload: Dict[str, Any], proposal_id: str | None = None) -> Notification:
    title = f"ForestGuard Alert — {payload.get('classification', 'HIGH')} risk in {payload.get('administrative_unit_id')}"
    msg = (
        f"Potential vegetation change detected.\n"
        f"Area: {payload.get('administrative_unit_id')}\n"
        f"NDVI: {payload.get('ndvi_current')} (change {payload.get('change_percentage')}%)\n"
        f"Risk: {payload.get('risk_score')} {payload.get('classification')}\n"
        f"Status: Pending verification\n"
        f"[Review proposal {proposal_id}]"
    )
    n = Notification(
        title=title,
        message=msg,
        type="ALERT",
        scope_administrative_unit_id=payload.get("administrative_unit_id"),
        link=f"/forest/proposals/{proposal_id}" if proposal_id else None,
    )
    db.add(n)
    db.flush()
    return n


def list_notifications(db: Session, user_id: str | None = None, limit: int = 20):
    q = db.query(Notification).order_by(Notification.created_at.desc())
    if user_id:
        q = q.filter((Notification.user_id == user_id) | (Notification.user_id.is_(None)))
    return q.limit(limit).all()
