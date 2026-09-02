"""Field verification tasks — Sec 32."""
from __future__ import annotations

import json
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.community import FieldVerificationTask
from app.models.pipeline import DataProposal
from app.services.audit import audit_log


def create_field_task(db: Session, proposal_id: str, reason: str, priority: str = "HIGH", assigned_to: str | None = None) -> FieldVerificationTask:
    proposal: DataProposal | None = db.get(DataProposal, proposal_id)
    if not proposal:
        raise ValueError("Proposal not found")
    task = FieldVerificationTask(
        proposal_id=proposal_id,
        administrative_unit_id=proposal.administrative_unit_id,
        reason=reason,
        priority=priority,
        assigned_to=assigned_to,
        status="PENDING",
    )
    db.add(task)
    audit_log(db, action="FIELD_TASK_CREATED", resource_type="field_task", resource_id=task.id, detail=reason)
    db.commit()
    db.refresh(task)
    return task


def update_field_task(db: Session, task_id: str, evidence: Dict[str, Any]) -> FieldVerificationTask:
    task: FieldVerificationTask | None = db.get(FieldVerificationTask, task_id)
    if not task:
        raise ValueError("Task not found")
    task.evidence = json.dumps(evidence)
    task.status = "COMPLETED"
    audit_log(db, action="FIELD_TASK_COMPLETED", resource_type="field_task", resource_id=task_id)
    db.commit()
    db.refresh(task)
    return task
