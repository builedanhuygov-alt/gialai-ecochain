"""Field missions — closed field loop.

POST /api/missions is restricted to admin/ranger (checked in backend, not
just by hiding the button). Results feed back: CONFIRMED_FIRE creates a
verified community report + an alert; FALSE_ALARM is recorded for the
false-alarm statistics used to retune weights later (never auto-retuned).
"""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_role
from app.database import get_db
from app.models.mission import (
    FIELD_CHECKLIST, MISSION_NEXT, MISSION_OUTCOMES, MISSION_STATUSES,
    FieldResult, Mission,
)

router = APIRouter(tags=["Missions"])
MISSION_RADIUS_KM = 1.0


def _shape(m: Mission, result: Optional[FieldResult] = None) -> dict:
    try:
        checks = json.loads(m.checklist) if m.checklist else []
    except Exception:
        checks = []
    return {
        "id": m.id, "area": m.area, "cell_id": m.cell_id,
        "latitude": m.latitude, "longitude": m.longitude,
        "risk_at_creation": m.risk_at_creation, "priority": m.priority,
        "due_at": m.due_at.isoformat() if m.due_at else None,
        "status": m.status, "assignee": m.assignee, "created_by": m.created_by,
        "checklist_steps": FIELD_CHECKLIST, "checklist_done": checks,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "result": ({
            "id": result.id, "outcome": result.outcome, "note": result.note,
            "photo_hash": result.photo_hash,
            "latitude": result.latitude, "longitude": result.longitude,
            "reporter_id": result.reporter_id,
            "created_at": result.created_at.isoformat() if result.created_at else None,
        } if result else None),
    }


@router.get("/missions/checklist")
def checklist_template():
    return {"steps": FIELD_CHECKLIST}


@router.post("/missions")
def create_mission(body: dict, db: Session = Depends(get_db),
                   user=Depends(require_role("ranger"))):
    """Create a field mission (admin or ranger only)."""
    area = str(body.get("area") or "").strip()
    if not area:
        raise HTTPException(400, "area is required")

    def num(k):
        v = body.get(k)
        return float(v) if v not in (None, "") else None
    try:
        lat, lon = num("latitude"), num("longitude")
    except (TypeError, ValueError):
        raise HTTPException(400, "latitude/longitude must be numeric")
    if lat is not None and not (-90 <= lat <= 90 and lon is not None and -180 <= lon <= 180):
        raise HTTPException(400, "coordinates out of range")
    risk = body.get("risk_at_creation")
    try:
        risk = int(risk) if risk not in (None, "") else None
    except (TypeError, ValueError):
        raise HTTPException(400, "risk_at_creation must be an integer")
    if risk is not None and not (0 <= risk <= 100):
        raise HTTPException(400, "risk_at_creation must be 0..100")
    priority = str(body.get("priority") or "NORMAL").upper()
    if priority not in ("LOW", "NORMAL", "HIGH", "CRITICAL"):
        raise HTTPException(400, "priority must be LOW/NORMAL/HIGH/CRITICAL")
    due = None
    if body.get("due_at"):
        try:
            due = datetime.fromisoformat(str(body["due_at"])[:19])
        except ValueError:
            raise HTTPException(400, "due_at must be ISO datetime")

    m = Mission(area=area[:300], cell_id=str(body.get("cell_id") or "")[:40] or None,
                latitude=lat, longitude=lon, risk_at_creation=risk, priority=priority,
                due_at=due, status="NEW",
                assignee=str(body.get("assignee") or "")[:100] or None,
                created_by=user.username)
    db.add(m); db.commit(); db.refresh(m)
    try:
        from app.services.audit import audit_log
        audit_log(db, action='MISSION_CREATED', resource_type='mission', resource_id=m.id,
                  detail=f'{m.area} risk={m.risk_at_creation}', actor_id=user.username); db.commit()
    except Exception:
        pass
    return _shape(m)


@router.get("/missions")
def list_missions(status: Optional[str] = Query(default=None),
                  db: Session = Depends(get_db)):
    q = db.query(Mission).order_by(Mission.created_at.desc())
    if status:
        if status not in MISSION_STATUSES:
            raise HTTPException(400, f"status must be one of {MISSION_STATUSES}")
        q = q.filter_by(status=status)
    missions = q.limit(200).all()
    ids = [m.id for m in missions]
    results = db.query(FieldResult).filter(FieldResult.mission_id.in_(ids)).all() if ids else []
    by_mission = {r.mission_id: r for r in results}
    return {"missions": [_shape(m, by_mission.get(m.id)) for m in missions],
            "count": len(missions)}


@router.get("/missions/{mission_id}")
def get_mission(mission_id: str, db: Session = Depends(get_db)):
    m = db.get(Mission, mission_id)
    if not m:
        raise HTTPException(404, "Mission not found")
    r = db.query(FieldResult).filter_by(mission_id=m.id).first()
    return _shape(m, r)


@router.patch("/missions/{mission_id}/status")
def set_status(mission_id: str, body: dict, db: Session = Depends(get_db),
               user=Depends(get_current_user)):
    m = db.get(Mission, mission_id)
    if not m:
        raise HTTPException(404, "Mission not found")
    nxt = str(body.get("status") or "").upper()
    if nxt not in MISSION_STATUSES:
        raise HTTPException(400, f"status must be one of {MISSION_STATUSES}")
    if nxt not in MISSION_NEXT.get(m.status, ()):
        raise HTTPException(400, f"illegal transition {m.status} -> {nxt}")
    m.status = nxt
    if nxt == "ASSIGNED" and body.get("assignee"):
        m.assignee = str(body["assignee"])[:100]
    db.commit(); db.refresh(m)
    try:
        from app.services.audit import audit_log
        audit_log(db, action='MISSION_STATUS', resource_type='mission', resource_id=m.id,
                  detail=f'{m.status}', actor_id=user.username); db.commit()
    except Exception:
        pass
    r = db.query(FieldResult).filter_by(mission_id=m.id).first()
    return _shape(m, r)


@router.patch("/missions/{mission_id}/checklist")
def tick_checklist(mission_id: str, body: dict, db: Session = Depends(get_db),
                   user=Depends(get_current_user)):
    m = db.get(Mission, mission_id)
    if not m:
        raise HTTPException(404, "Mission not found")
    done = body.get("done")
    if not isinstance(done, list) or any(not isinstance(i, int) or not (0 <= i < len(FIELD_CHECKLIST)) for i in done):
        raise HTTPException(400, f"done must be a list of step indices 0..{len(FIELD_CHECKLIST)-1}")
    m.checklist = json.dumps(sorted(set(done)))
    db.commit(); db.refresh(m)
    return {"id": m.id, "checklist_done": sorted(set(done)), "steps": FIELD_CHECKLIST}


@router.post("/missions/{mission_id}/result")
def submit_result(mission_id: str, body: dict, db: Session = Depends(get_db),
                  user=Depends(get_current_user)):
    """Field result. Guards: mission IN_PROGRESS, valid outcome, geotagged
    photo with real bytes (no reuse), GPS within ~1 km of the target."""
    from app.models.community import CitizenReport, PhotoEvidence
    from app.services.village_fire import haversine

    m = db.get(Mission, mission_id)
    if not m:
        raise HTTPException(404, "Mission not found")
    if m.status != "IN_PROGRESS":
        raise HTTPException(400, f"mission must be IN_PROGRESS (is {m.status})")
    if db.query(FieldResult).filter_by(mission_id=m.id).first():
        raise HTTPException(400, "Result already submitted for this mission")
    outcome = str(body.get("outcome") or "").upper()
    if outcome not in MISSION_OUTCOMES:
        raise HTTPException(400, f"outcome must be one of {MISSION_OUTCOMES}")

    def num(k):
        v = body.get(k)
        return float(v) if v not in (None, "") else None
    try:
        lat, lon = num("latitude"), num("longitude")
    except (TypeError, ValueError):
        raise HTTPException(400, "latitude/longitude must be numeric")
    if lat is None or lon is None:
        raise HTTPException(400, "result latitude/longitude are required")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "coordinates out of range")
    if m.latitude is not None and m.longitude is not None:
        dist = haversine(m.longitude, m.latitude, lon, lat)
        if dist > MISSION_RADIUS_KM:
            raise HTTPException(400, f"Result too far from mission target ({dist:.2f} km > {MISSION_RADIUS_KM} km)")

    photo_hash = str(body.get("photo_hash") or "").strip() or None
    if photo_hash:
        ph = db.query(PhotoEvidence).filter_by(file_hash=photo_hash).first()
        if not ph or not ph.data:
            raise HTTPException(400, "photo_hash must reference uploaded photo bytes")
        if db.query(FieldResult).filter_by(photo_hash=photo_hash).first():
            raise HTTPException(400, "photo already used in another mission result")
        if ph.location_lat is not None and ph.location_lng is not None \
                and m.latitude is not None and m.longitude is not None:
            pdist = haversine(m.longitude, m.latitude, ph.location_lng, ph.location_lat)
            if pdist > MISSION_RADIUS_KM:
                raise HTTPException(400, f"Photo GPS too far from mission target ({pdist:.2f} km)")

    res = FieldResult(mission_id=m.id, outcome=outcome,
                      note=str(body.get("note") or "")[:2000] or None,
                      photo_hash=photo_hash, latitude=lat, longitude=lon,
                      reporter_id=user.username)
    db.add(res)
    m.status = "DONE"
    side_effects: dict = {}

    if outcome == "CONFIRMED_FIRE":
        rep = CitizenReport(
            user_id=user.username, report_type="FIRE_SUSPICION",
            latitude=lat, longitude=lon,
            note=f"Field confirmed (mission {m.id}): {(body.get('note') or '')[:500]}".strip(),
            administrative_unit_id=None, status="COMMUNITY_VERIFIED")
        db.add(rep)
        db.flush()
        from app.services.alert_engine import alert_engine
        score = m.risk_at_creation if m.risk_at_creation is not None else 70
        confidence = min(95, 60 + (15 if photo_hash else 0))
        alert = alert_engine.create(
            db, risk_type="FIRE", administrative_unit_id=m.area,
            score=score, confidence=confidence,
            explanation=f"Field team confirmed fire at ({lat}, {lon}) — mission {m.id}.",
            geometry={"type": "Point", "coordinates": [lon, lat]})
        side_effects = {"report_id": rep.id, "alert_id": alert.id}
    try:
        from app.services.audit import audit_log
        audit_log(db, action='MISSION_RESULT', resource_type='mission', resource_id=m.id,
                  detail=outcome, actor_id=user.username)
    except Exception:
        pass
    db.commit()
    db.refresh(res)
    out = _shape(m, res)
    out["side_effects"] = side_effects
    return out


@router.get("/missions-stats/summary")
def missions_stats(db: Session = Depends(get_db)):
    """Counts + false-alarm rate overall and by risk band at creation.

    For retuning weights later — weights are NEVER changed automatically.
    """
    missions = db.query(Mission).all()
    results = {r.mission_id: r for r in db.query(FieldResult).all()}

    def band(risk):
        if risk is None:
            return "unknown"
        if risk >= 60:
            return "high"
        if risk >= 40:
            return "medium"
        return "low"

    by_band: dict = {}
    outcomes = {"CONFIRMED_FIRE": 0, "FALSE_ALARM": 0, "RESOLVED": 0}
    for m in missions:
        b = band(m.risk_at_creation)
        slot = by_band.setdefault(b, {"missions": 0, "with_result": 0, "false_alarms": 0})
        slot["missions"] += 1
        r = results.get(m.id)
        if r:
            slot["with_result"] += 1
            outcomes[r.outcome] = outcomes.get(r.outcome, 0) + 1
            if r.outcome == "FALSE_ALARM":
                slot["false_alarms"] += 1
    for slot in by_band.values():
        n = slot["with_result"]
        slot["false_alarm_rate"] = (slot["false_alarms"] / n) if n else None
    total_res = sum(outcomes.values())
    return {
        "missions_total": len(missions),
        "by_status": {s: sum(1 for m in missions if m.status == s) for s in MISSION_STATUSES},
        "results": outcomes,
        "false_alarm_rate": (outcomes["FALSE_ALARM"] / total_res) if total_res else None,
        "by_risk_band": by_band,
        "note": "Statistics only — weights are not adjusted automatically.",
    }
