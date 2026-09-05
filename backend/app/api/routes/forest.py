"""Forest API — Sec 38 plus Sec 25-33, 39-42."""
import json
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.enums import ProposalStatus, SatelliteSource
from app.core.demo_mode import tag_data_origin
from app.database import get_db
from app.models.administrative import AdministrativeUnit
from app.models.community import CommunityConfirmation, PhotoEvidence, FieldVerificationTask
from app.models.ops import ForestJob, MonitoredArea, Notification, AuditLog
from app.models.pipeline import DataProposal
from app.schemas.pipeline import MonitorRequest, ApprovalRequest
from app.services.agents.forest_guard import get_forest_guard_agent
from app.services.earth_engine.service import EEQueryParams, get_earth_engine_service
from app.services.community import add_confirmation
from app.services.photo_service import compute_hash, compute_perceptual_hash, is_duplicate, check_geo_consistency, check_time_consistency
from app.services.field_task import create_field_task, update_field_task
from app.services.audit import audit_log

router = APIRouter(prefix="/forest", tags=["Forest"])

# ── Sec 38 ──────────────────────────────────────────────────────────

@router.get("/areas")
def list_areas(level: Optional[str] = Query(default=None), db: Session = Depends(get_db)):
    q = db.query(AdministrativeUnit)
    if level:
        q = q.filter(AdministrativeUnit.level == level.upper())
    units = q.all()
    # include monitored flag
    monitored = {m.administrative_unit_id: m.is_priority for m in db.query(MonitoredArea).all()}
    return [
        {
            "id": u.id, "name": u.name, "level": u.level,
            "geometry": u.geometry_dict(),
            "is_monitored": u.id in monitored,
            "is_priority": monitored.get(u.id, False),
            "is_demo": u.is_demo,
        } for u in units
    ]

@router.get("/monitor")
def forest_monitor_get(administrative_unit_id: str = Query(...), start_date: str = Query(...), end_date: str = Query(...), baseline_start: Optional[str] = Query(default=None), baseline_end: Optional[str] = Query(default=None), cloud_percentage: int = Query(default=20, ge=0, le=100), dataset: str = Query(default="SENTINEL2"), db: Session = Depends(get_db)):
    return forest_monitor(MonitorRequest(administrative_unit_id=administrative_unit_id, start_date=start_date, end_date=end_date, baseline_start=baseline_start, baseline_end=baseline_end, cloud_percentage=cloud_percentage, dataset=dataset), db)

@router.post("/monitor")
def forest_monitor(req: MonitorRequest, db: Session = Depends(get_db)):
    """Sec 38 POST /api/forest/monitor — creates QUEUED job, not blocking."""
    geometry = req.geometry
    if not geometry:
        unit = db.get(AdministrativeUnit, req.administrative_unit_id)
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")
        geometry = unit.geometry_dict()
        if not geometry:
            raise HTTPException(status_code=400, detail="Unit has no geometry")
    # quota check Sec 36
    from app.services.quota import check_quota, log_quota
    quota = check_quota("GEE")
    if quota["allowed"] != "true":
        log_quota(db, "GEE", quota["reason"], "monitor throttled")
        db.commit()
        raise HTTPException(status_code=429, detail=f"Quota: {quota['reason']}")

    # create ForestJob QUEUED (Sec 41)
    job = ForestJob(
        administrative_unit_id=req.administrative_unit_id,
        status="QUEUED",
        params=json.dumps(req.model_dump()),
        progress=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # synchronous mock execution for demo (in prod enqueue to Celery/background)
    try:
        from app.services.quota import log_quota as _lq
        dataset = SatelliteSource(req.dataset) if req.dataset in [e.value for e in SatelliteSource] else SatelliteSource.SENTINEL2
        agent = get_forest_guard_agent()
        result = agent.monitor_area(
            administrative_unit_id=req.administrative_unit_id,
            start_date=req.start_date,
            end_date=req.end_date,
            geometry=geometry,
            dataset=dataset,
            cloud_percentage=req.cloud_percentage,
            db=db,
            baseline_start=req.baseline_start,
            baseline_end=req.baseline_end,
        )
        # NO_VALID_IMAGE → NO_DATA
        if result.get("status") == "NO_DATA":
            job.status = "NO_DATA"
            job.error = result.get("reason")
        elif result.get("status") == "FAILED":
            job.status = "FAILED"
            job.error = result.get("error")
            _lq(db, "GEE", "FAILED", result.get("error"))
        else:
            job.status = "COMPLETED"
            job.result = json.dumps(result)
        job.progress = 100
        db.commit()
    except Exception as exc:
        job.status = "FAILED"
        job.error = str(exc)
        db.commit()
        raise

    return {"job_id": job.id, "status": job.status, "result": json.loads(job.result) if job.result else None, "origin": tag_data_origin()}

@router.get("/proposals")
def list_proposals(status: Optional[str] = Query(default=None), db: Session = Depends(get_db)):
    q = db.query(DataProposal)
    if status:
        q = q.filter(DataProposal.status == status.upper())
    items = q.order_by(DataProposal.created_at.desc()).limit(100).all()
    return [
        {
            "id": p.id, "status": p.status, "title": p.title,
            "administrative_unit_id": p.administrative_unit_id,
            "confidence": p.confidence, "data_type": p.data_type,
            "source": p.source, "source_reference": p.source_reference,
            "created_at": str(p.created_at), "expires_at": str(p.expires_at) if p.expires_at else None,
            "payload": json.loads(p.payload) if p.payload else None,
            "origin": tag_data_origin(),
        } for p in items
    ]

@router.get("/proposals/{proposal_id}")
def get_proposal(proposal_id: str, db: Session = Depends(get_db)):
    p = db.get(DataProposal, proposal_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    # lineage + confirmations + photos
    from app.models.query_log import DataLineage
    lineage = db.query(DataLineage).filter(DataLineage.proposal_id == proposal_id).first()
    confs = db.query(CommunityConfirmation).filter_by(proposal_id=proposal_id).all()
    photos = db.query(PhotoEvidence).filter_by(proposal_id=proposal_id).all()
    return {
        "id": p.id, "status": p.status, "title": p.title,
        "payload": json.loads(p.payload) if p.payload else None,
        "confidence": p.confidence, "source": p.source,
        "lineage": {"verified_data_id": lineage.verified_data_id if lineage else None, "dataset": lineage.dataset if lineage else None},
        "confirmations": [{"user_id": c.user_id, "confirmed": c.confirmed} for c in confs],
        "photos": [{"id": ph.id, "file_hash": ph.file_hash, "is_duplicate": ph.is_duplicate} for ph in photos],
        "origin": tag_data_origin(),
    }

@router.post("/proposals/{proposal_id}/verify")
def verify_proposal(proposal_id: str, body: ApprovalRequest, db: Session = Depends(get_db)):
    """Sec 20 OFFICIAL_VERIFIED — admin override."""
    p = db.get(DataProposal, proposal_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    if p.status == ProposalStatus.OFFICIAL_VERIFIED.value or p.status == ProposalStatus.VERIFIED.value:
        raise HTTPException(status_code=400, detail="Already verified")
    # allow from COMMUNITY_VERIFIED or PENDING
    from app.services.pipeline.pipeline import approve_proposal
    try:
        result = approve_proposal(db, proposal_id, verified_by=body.verified_by)
        # map to OFFICIAL_VERIFIED
        p2 = db.get(DataProposal, proposal_id)
        if p2:
            p2.status = ProposalStatus.OFFICIAL_VERIFIED.value
            db.commit()
        audit_log(db, action="OFFICIAL_VERIFIED", resource_type="proposal", resource_id=proposal_id, actor_id=body.verified_by)
        db.commit()
        return {"proposal_id": proposal_id, "status": ProposalStatus.OFFICIAL_VERIFIED.value, "verified": result}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@router.post("/proposals/{proposal_id}/reject")
def reject_proposal_route(proposal_id: str, body: ApprovalRequest, db: Session = Depends(get_db)):
    from app.services.pipeline.pipeline import reject_proposal
    try:
        result = reject_proposal(db, proposal_id, reviewed_by=body.verified_by, reason=body.reason or "Rejected")
        audit_log(db, action="REJECTED", resource_type="proposal", resource_id=proposal_id, actor_id=body.verified_by, detail=body.reason)
        db.commit()
        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@router.post("/proposals/{proposal_id}/community-confirm")
def community_confirm(proposal_id: str, body: dict, db: Session = Depends(get_db)):
    """Sec 17 body: {user_id, confirmed, comment, location:{lat,lng}}"""
    user_id = body.get("user_id")
    confirmed = body.get("confirmed", True)
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    # check self-confirm via add_confirmation
    try:
        return add_confirmation(db, proposal_id, user_id, confirmed, body.get("comment"), body.get("location"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

# ── Jobs / statistics / map ─────────────────────────────────────────

@router.get("/jobs")
def list_jobs(status: Optional[str] = Query(default=None), db: Session = Depends(get_db)):
    q = db.query(ForestJob)
    if status:
        q = q.filter(ForestJob.status == status.upper())
    jobs = q.order_by(ForestJob.created_at.desc()).limit(50).all()
    return [{"id": j.id, "administrative_unit_id": j.administrative_unit_id, "status": j.status, "progress": j.progress, "created_at": str(j.created_at)} for j in jobs]

@router.get("/jobs/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    j = db.get(ForestJob, job_id)
    if not j:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": j.id, "status": j.status, "progress": j.progress, "params": json.loads(j.params) if j.params else None, "result": json.loads(j.result) if j.result else None, "error": j.error}

@router.get("/statistics")
def statistics(db: Session = Depends(get_db)):
    """Sec 27 dashboard cards from real DB."""
    from app.models.pipeline import DataProposal as DP
    total_areas = db.query(MonitoredArea).count()
    if total_areas == 0:
        total_areas = db.query(AdministrativeUnit).filter(AdministrativeUnit.level.in_(["COMMUNE","VILLAGE"])).count()
    pending = db.query(DP).filter(DP.status == ProposalStatus.PENDING.value).count()
    comm = db.query(DP).filter(DP.status == ProposalStatus.COMMUNITY_VERIFIED.value).count()
    official = db.query(DP).filter(DP.status.in_([ProposalStatus.OFFICIAL_VERIFIED.value, ProposalStatus.VERIFIED.value])).count()
    high = db.query(DP).filter(DP.payload.like('%"HIGH"%')).count()
    critical = db.query(DP).filter(DP.payload.like('%"CRITICAL"%')).count()
    # fallback count by risk payload if like fails
    return {
        "areas_monitored": total_areas,
        "pending_signals": pending,
        "community_verified": comm,
        "official_verified": official,
        "high_risk": high,
        "critical": critical,
        "origin": tag_data_origin(),
    }

@router.get("/map/layer")
def map_layer(status: Optional[str] = Query(default=None), db: Session = Depends(get_db)):
    """Sec 25 — FOREST MONITORING layer with colors."""
    q = db.query(DataProposal)
    if status:
        q = q.filter(DataProposal.status == status.upper())
    proposals = q.order_by(DataProposal.created_at.desc()).limit(50).all()
    color_map = {
        ProposalStatus.PENDING.value: "🟡 Pending",
        ProposalStatus.COMMUNITY_VERIFIED.value: "🔵 Community Verified",
        ProposalStatus.OFFICIAL_VERIFIED.value: "🟢 Official Verified",
        ProposalStatus.VERIFIED.value: "🟢 Official Verified",
        "HIGH": "🟠 High Risk",
        "CRITICAL": "🔴 Critical",
        "STABLE": "🟢 Stable",
    }
    features = []
    for p in proposals:
        payload = json.loads(p.payload) if p.payload else {}
        classification = payload.get("classification", "UNKNOWN")
        layer_status = color_map.get(p.status, p.status)
        if classification in ("HIGH", "CRITICAL"):
            layer_status = color_map.get(classification, layer_status)
        unit = db.get(AdministrativeUnit, p.administrative_unit_id)
        features.append({
            "proposal_id": p.id,
            "administrative_unit_id": p.administrative_unit_id,
            "unit_name": unit.name if unit else None,
            "geometry": unit.geometry_dict() if unit else None,
            "status": p.status,
            "layer": layer_status,
            "risk_score": payload.get("risk_score"),
            "classification": classification,
            "ndvi": payload.get("ndvi_current"),
            "change": payload.get("change_percentage"),
            "affected_area_ha": payload.get("affected_area_ha"),
        })
    return {"features": features, "disclaimer": "Potential vegetation change — requires verification"}

@router.get("/history/{administrative_unit_id}")
def history(administrative_unit_id: str, db: Session = Depends(get_db)):
    """Sec 42 timeline chart."""
    proposals = db.query(DataProposal).filter(DataProposal.administrative_unit_id == administrative_unit_id).order_by(DataProposal.created_at.asc()).all()
    timeline = []
    for p in proposals:
        payload = json.loads(p.payload) if p.payload else {}
        timeline.append({
            "date": payload.get("period_end") or str(p.created_at),
            "ndvi": payload.get("ndvi_current") or payload.get("ndvi_after"),
            "risk_score": payload.get("risk_score"),
            "classification": payload.get("classification"),
            "status": p.status,
        })
    # highlight HIGH changes
    return {"administrative_unit_id": administrative_unit_id, "timeline": timeline}

# ── Photo / field tasks / notifications ────────────────────────────

@router.post("/proposals/{proposal_id}/photos")
def upload_photo(proposal_id: str, file: UploadFile = File(...), uploader_id: str = Form(...), lat: Optional[float] = Form(None), lng: Optional[float] = Form(None), db: Session = Depends(get_db)):
    p = db.get(DataProposal, proposal_id)
    if not p:
        raise HTTPException(status_code=404, detail="Proposal not found")
    data = file.file.read()
    h = compute_hash(data)
    ph = compute_perceptual_hash(data)
    existing = db.query(PhotoEvidence).all()
    existing_hashes = [e.file_hash for e in existing]
    existing_phashes = [e.perceptual_hash for e in existing if e.perceptual_hash]
    dup, _ = is_duplicate(h, existing_hashes, ph, existing_phashes)
    # geo check
    payload = json.loads(p.payload) if p.payload else {}
    geometry = payload.get("geometry")
    # try unit geometry fallback
    if not geometry:
        unit = db.get(AdministrativeUnit, p.administrative_unit_id)
        geometry = unit.geometry_dict() if unit else {"type": "Polygon", "coordinates": [[[108,13],[109,13],[109,14],[108,14],[108,13]]]}
    geo_ok = check_geo_consistency(lat, lng, geometry)
    photo = PhotoEvidence(
        proposal_id=proposal_id,
        uploader_id=uploader_id,
        file_path=f"uploads/{proposal_id}/{file.filename}",
        file_hash=h,
        perceptual_hash=ph,
        location_lat=lat,
        location_lng=lng,
        is_duplicate=dup,
        duplicate_of=_ if dup else None,
        ai_analysis_status="PENDING",
    )
    db.add(photo)
    # maybe trigger community verify re-eval
    db.flush()
    from app.services.community import maybe_auto_verify
    auto = maybe_auto_verify(db, proposal_id)
    db.commit()
    db.refresh(photo)
    return {"photo_id": photo.id, "is_duplicate": dup, "geo_check": geo_ok, "auto_verify": auto, "hash": h}

@router.post("/proposals/{proposal_id}/field-task")
def request_field_task(proposal_id: str, body: dict, db: Session = Depends(get_db)):
    reason = body.get("reason", "ForestGuard detected abnormal vegetation change")
    priority = body.get("priority", "HIGH")
    assigned_to = body.get("assigned_to")
    task = create_field_task(db, proposal_id, reason, priority, assigned_to)
    return {"task_id": task.id, "status": task.status}

@router.post("/field-tasks/{task_id}/evidence")
def submit_evidence(task_id: str, body: dict, db: Session = Depends(get_db)):
    task = update_field_task(db, task_id, body)
    return {"task_id": task.id, "status": task.status, "evidence": body}

@router.get("/notifications")
def get_notifications(user_id: Optional[str] = Query(default=None), db: Session = Depends(get_db)):
    from app.services.notification import list_notifications
    items = list_notifications(db, user_id)
    return [{"id": n.id, "title": n.title, "message": n.message, "is_read": n.is_read, "created_at": str(n.created_at)} for n in items]

@router.get("/audit")
def get_audit(limit: int = Query(default=20), db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [{"id": l.id, "action": l.action, "resource_type": l.resource_type, "resource_id": l.resource_id, "detail": l.detail, "created_at": str(l.created_at)} for l in logs]
