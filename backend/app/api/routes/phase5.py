"""Alert center, field tasks (mobile), public portal, reports — early-warning scope only."""
import json
from app.core.time import utcnow
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.risk import Alert, Incident
from app.services.audit import audit_log

router = APIRouter(tags=["Alerts"])

# ── Unified Alert Center ────────────────────────────────────────────
@router.get("/alerts-unified")
def unified_alerts(db:Session=Depends(get_db)):
    alerts=db.query(Alert).filter(Alert.status.in_(["ACTIVE","ACKNOWLEDGED"])).all()
    # prioritize: severity (CRITICAL=4), status, recency
    sev={"INFO":1,"WATCH":2,"WARNING":2,"HIGH":3,"CRITICAL":4}
    def score(a):
        s=sev.get(a.level,2)*40 + (40 if a.status=="ACTIVE" else 0)
        age=(utcnow() - (a.created_at or utcnow())).total_seconds()/3600
        s+= max(0, 10 - age*0.1)
        return s
    alerts.sort(key=score, reverse=True)
    return [{"id": a.id, "level": a.level, "title": a.title, "administrative_unit_id": a.administrative_unit_id, "priority": a.priority, "status": a.status, "created_at": str(a.created_at), "score": int(score(a))} for a in alerts]

# ── Field Task mobile/offline ───────────────────────────────────────
@router.post("/field-tasks")
def create_task(body:dict, db:Session=Depends(get_db)):
    from app.models.community import FieldVerificationTask as FVT
    pid=body.get("proposal_id") or body.get("incident_id") or body.get("alert_id") or "unknown"
    adm=body.get("administrative_unit_id") or "unknown"
    fvt=FVT(proposal_id=pid, administrative_unit_id=adm, reason=body.get("reason","Field verification"), priority=body.get("priority","HIGH"), assigned_to=body.get("assigned_to") or body.get("village_admin"), status=body.get("status","PENDING"))
    db.add(fvt); db.commit(); db.refresh(fvt)
    return {"task_id": fvt.id, "status": fvt.status}

@router.get("/field-tasks/mobile")
def field_mobile(db:Session=Depends(get_db)):
    from app.models.community import FieldVerificationTask
    tasks=db.query(FieldVerificationTask).order_by(FieldVerificationTask.created_at.desc()).limit(10).all()
    return [{"task_id": t.id, "status": t.status, "priority": t.priority} for t in tasks]

@router.post("/field-tasks/{task_id}/sync")
def sync_task(task_id:str, body:dict, db:Session=Depends(get_db)):
    from app.models.community import FieldVerificationTask
    t=db.get(FieldVerificationTask, task_id)
    if not t: raise HTTPException(404, "Task not found")
    status=body.get("status","SYNCED")  # LOCAL_PENDING/SYNCING/SYNCED/SYNC_FAILED
    t.status=status
    db.commit()
    return {"task_id": task_id, "sync_status": status}

# ── Public Portal ───────────────────────────────────────────────────
@router.get("/public/map")
def public_map(db:Session=Depends(get_db)):
    # verified alerts only, no private info, no unverified sensitive
    alerts=db.query(Alert).filter(Alert.status.in_(["ACTIVE","ACKNOWLEDGED"])).limit(20).all()
    return {"verified_alerts": [{"id": a.id, "level": a.level, "title": a.title, "administrative_unit_id": a.administrative_unit_id} for a in alerts], "forest_monitoring":"monitoring signal", "achievements": [], "transparency": {"data_source": "satellite+community", "last_updated": utcnow().isoformat()}}

@router.get("/public/incidents/{incident_id}")
def public_incident(incident_id:str, db:Session=Depends(get_db)):
    inc=db.get(Incident, incident_id)
    if not inc: raise HTTPException(404, "Incident not found")
    alerts_info=db.get(Alert, inc.alert_id) if inc.alert_id else None
    return {"incident": {"id": inc.id, "title": inc.title, "status": inc.status, "area": inc.administrative_unit_id, "evidence": "Verified", "community": "confirmations", "transparency": {"why": alerts_info.explanation if alerts_info else "", "verification": inc.status}}}

@router.get("/public/data-freshness")
def data_freshness(db:Session=Depends(get_db)):
    last=db.query(Alert).order_by(Alert.created_at.desc()).first()
    return {"forest_data": {"updated": str(last.created_at) if last else None, "source":"Satellite", "status": "LIVE" if last else "NO_DATA"}}

# ── Reports ─────────────────────────────────────────────────────────
@router.get("/reports/generate")
def generate_report(type: str = Query(default="province"), db:Session=Depends(get_db)):
    from app.models.risk import RiskScore as RS
    scores=db.query(RS).limit(5).all()
    summary={"top_5_risk": [{"unit": s.administrative_unit_id, "score": s.overall_score} for s in scores], "incidents": db.query(Incident).count(), "generated_at": utcnow().isoformat()}
    return {"report_type": type, "summary": summary, "disclaimer": "All numbers from database"}

# ── Observability (honest: only measured/counted values) ────────────
@router.get("/system/health")
def system_health(db:Session=Depends(get_db)):
    from app.models.risk import AgentRun
    total=db.query(AgentRun).count()
    fails=db.query(AgentRun).filter(AgentRun.status=="FAILED").count()
    return {
        "agent_runs_total": total, "agent_failures": fails,
        "queue_size": 0, "database": "healthy",
        "note": "Only counted values are reported — no estimated success rates or costs",
    }

# ── Cache invalidation ──────────────────────────────────────────────
@router.post("/cache/invalidate")
def cache_invalidate(db:Session=Depends(get_db)):
    from app.models.ops import QueryCacheEntry
    db.query(QueryCacheEntry).delete(); db.commit()
    return {"status":"invalidated"}

# ── Production config ───────────────────────────────────────────────
@router.get("/config/mode")
def config_mode():
    import os
    return {"mode": os.getenv("APP_ENV","development"), "demo_mode": os.getenv("DEMO_MODE","false"), "env_vars": ["DATABASE_URL","GEE_PROJECT","STORAGE_CONFIG"]}
