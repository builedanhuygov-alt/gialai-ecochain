"""Field-verified operations API: worklists, evidence acceptance and readiness."""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_role
from app.database import get_db
from app.models.field_operations import FIELD_TASK_STATUSES, OperationalWorkItem
from app.services.field_operations import decision, import_work_items, item_dict, readiness, report, required_fields

router = APIRouter(prefix="/operations", tags=["Field Operations"])


def _items(db: Session):
    import_work_items(db)
    return db.query(OperationalWorkItem).order_by(OperationalWorkItem.priority, OperationalWorkItem.task_id).all()


@router.get("/tasks")
def list_tasks(status: str | None = Query(default=None), phase: str | None = Query(default=None), db: Session = Depends(get_db)):
    rows = _items(db)
    if status:
        rows = [row for row in rows if row.status == status.upper()]
    if phase:
        rows = [row for row in rows if row.phase == phase]
    return {"count": len(rows), "tasks": [item_dict(row) for row in rows]}


@router.post("/tasks/import")
def import_tasks(db: Session = Depends(get_db), _user=Depends(require_role("operator"))):
    return {"imported": import_work_items(db), "count": db.query(OperationalWorkItem).count()}


def _verify_complete(item: OperationalWorkItem, payload: dict) -> None:
    verified_by = str(payload.get("verified_by", "")).strip()
    verification_date = str(payload.get("verification_date", "")).strip()
    evidence_ref = str(payload.get("evidence_ref", "")).strip()
    evidence = payload.get("evidence")
    if not verified_by or not verification_date:
        raise HTTPException(400, "VERIFIED requires verified_by and verification_date")
    if not evidence_ref or not isinstance(evidence, dict):
        raise HTTPException(400, "VERIFIED requires evidence_ref and evidence")
    try:
        parsed_date = datetime.fromisoformat(verification_date.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(400, "verification_date must be ISO date or datetime") from exc
    missing = [
        field for field in required_fields(item)
        if field not in payload and field not in evidence
        and not (field == "photo" and "asset_photo" in evidence)
    ]
    if item.phase == "PH1-GPS":
        if evidence.get("gps_source") != "device":
            raise HTTPException(400, "GPS evidence must come directly from the field device")
        missing.extend(field for field in ("lat", "lon", "timestamp", "asset_photo") if field not in evidence)
    if missing:
        raise HTTPException(400, {"missing_evidence": sorted(set(missing))})
    item.verified_by = verified_by
    item.verification_date = parsed_date
    item.evidence_ref = evidence_ref
    item.evidence = json.dumps(evidence, ensure_ascii=False)
    item.rejected_reason = None


@router.post("/tasks/{task_id}/verify", responses={400: {"description": "Invalid or incomplete field evidence"}, 404: {"description": "Task not found"}})
def verify_task(task_id: str, payload: dict = Body(...), db: Session = Depends(get_db), _user=Depends(require_role("operator"))):
    import_work_items(db)
    item = db.query(OperationalWorkItem).filter_by(task_id=task_id).first()
    if item is None:
        raise HTTPException(404, "task not found")
    status = str(payload.get("status", "VERIFIED")).upper()
    if status not in FIELD_TASK_STATUSES:
        raise HTTPException(400, f"status must be one of {', '.join(FIELD_TASK_STATUSES)}")
    if status == "VERIFIED":
        _verify_complete(item, payload)
    elif status == "REJECTED":
        reason = str(payload.get("rejected_reason", "")).strip()
        if not reason:
            raise HTTPException(400, "REJECTED requires rejected_reason")
        item.rejected_reason = reason
    item.status = status
    db.commit()
    db.refresh(item)
    return item_dict(item)


@router.get("/readiness")
def get_readiness(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return report(db)


@router.get("/decision")
def get_decision(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    board = readiness(db)
    return decision(board)