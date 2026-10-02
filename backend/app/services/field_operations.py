"""Field verification import and readiness rules."""
from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.field_operations import OperationalWorkItem

ROOT = Path(__file__).resolve().parents[3]
SOURCE_FILES = (ROOT / "docs" / "verification_tasks.csv", ROOT / "docs" / "field_work_orders.csv")


def _date(value: str | None):
    if not value:
        return None
    return datetime.strptime(value[:10], "%Y-%m-%d")


def _set_if_value(item: OperationalWorkItem, field: str, value: str | None) -> None:
    if value:
        setattr(item, field, value)


def _import_status(current: str, raw: str | None) -> str:
    if current in ("VERIFIED", "REJECTED", "IN_PROGRESS"):
        return current
    return (raw or "PENDING").strip() or "PENDING"


def _apply_row(item: OperationalWorkItem, row: dict) -> None:
    values = {
        "campaign": (row.get("campaign") or "").strip(),
        "phase": (row.get("phase") or "").strip(),
        "target_type": (row.get("target_type") or "").strip(),
        "target": (row.get("target") or "").strip(),
        "required_fields": (row.get("required_fields") or "").strip(),
        "acceptance": (row.get("acceptance") or "").strip(),
    }
    for field, value in values.items():
        _set_if_value(item, field, value)
    item.status = _import_status(item.status, row.get("status"))
    item.priority = (row.get("priority") or "P1").strip() or "P1"
    for field in ("verified_by", "verification_date", "evidence_ref", "rejected_reason"):
        _set_if_value(item, field, (row.get(field) or "").strip() or None)
    if row.get("verification_date"):
        item.verification_date = _date(row["verification_date"].strip())


def import_work_items(db: Session) -> int:
    """Idempotently import both canonical worklists without inventing data."""
    imported = 0
    by_task = {item.task_id: item for item in db.query(OperationalWorkItem).all()}
    for path in SOURCE_FILES:
        if not path.exists():
            continue
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                task_id = (row.get("task_id") or "").strip()
                if not task_id:
                    continue
                item = by_task.get(task_id)
                if item is None:
                    item = OperationalWorkItem(task_id=task_id)
                    db.add(item)
                    by_task[task_id] = item
                    imported += 1
                _apply_row(item, row)
    db.commit()
    return imported


def required_fields(item: OperationalWorkItem) -> set[str]:
    return {field.strip() for field in item.required_fields.split(";") if field.strip()}


def item_dict(item: OperationalWorkItem) -> dict:
    return {
        "task_id": item.task_id,
        "campaign": item.campaign,
        "phase": item.phase,
        "target_type": item.target_type,
        "target": item.target,
        "required_fields": sorted(required_fields(item)),
        "acceptance": item.acceptance,
        "status": item.status,
        "priority": item.priority,
        "verified_by": item.verified_by,
        "verification_date": item.verification_date.isoformat() if item.verification_date else None,
        "evidence_ref": item.evidence_ref,
        "evidence": json.loads(item.evidence) if item.evidence else None,
        "rejected_reason": item.rejected_reason,
    }


def _status(ready: int, total: int, blocked: bool = False) -> str:
    if blocked:
        return "BLOCKED"
    if ready == total and total > 0:
        return "READY"
    if ready > 0:
        return "PARTIAL"
    return "MISSING"


def readiness(db: Session) -> dict:
    import_work_items(db)
    items = db.query(OperationalWorkItem).all()
    groups = {
        "GPS": [x for x in items if x.phase == "PH1-GPS"],
        "Water": [x for x in items if x.phase == "PH2-WATER"],
        "Contacts": [x for x in items if x.phase == "PH3-COMMUNE"],
        "Evacuation": [x for x in items if x.phase == "PH4-EVAC"],
        "Routes": [x for x in items if x.phase == "PH6-ROAD"],
        "Photos": [x for x in items if x.phase == "PH7-PHOTO"],
        "360": [x for x in items if x.phase == "PH8-360"],
    }
    board = {}
    for name, group in groups.items():
        verified = sum(item.status == "VERIFIED" for item in group)
        board[name] = {"status": _status(verified, len(group)), "verified": verified, "required": len(group)}
    for name in ("FIRMS", "Weather", "GEE", "Sentinel"):
        board[name] = {"status": "BLOCKED", "verified": 0, "required": 1}
    return board


def decision(board: dict) -> dict:
    blockers = [name for name, value in board.items() if value["status"] in ("MISSING", "BLOCKED")]
    partial = [name for name, value in board.items() if value["status"] == "PARTIAL"]
    if blockers:
        status = "NO-GO"
    elif partial:
        status = "GO-WITH-CONDITIONS"
    else:
        status = "GO"
    return {
        "status": status,
        "blockers": blockers,
        "conditions": partial,
    }


def report(db: Session) -> dict:
    """Return the field-verification output contract without synthetic values."""
    import_work_items(db)
    items = db.query(OperationalWorkItem).all()
    board = readiness(db)

    def missing(phases: set[str]) -> list[str]:
        return [item.target for item in items if item.phase in phases and item.status != "VERIFIED"]

    return {
        "verification_status": board,
        "missing_assets": missing({"PH1-GPS"}),
        "missing_contacts": missing({"PH2-WATER", "PH3-COMMUNE"}),
        "missing_routes": missing({"PH6-ROAD"}),
        "missing_evacuation_plans": missing({"PH4-EVAC"}),
        "photo_coverage": board["Photos"],
        "360_coverage": board["360"],
        "eo_runtime_status": {name: board[name]["status"] for name in ("FIRMS", "Weather", "GEE", "Sentinel")},
        "operational_risk": [name for name, value in board.items() if value["status"] in ("MISSING", "BLOCKED")],
        "decision": decision(board),
    }