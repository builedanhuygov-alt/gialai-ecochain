import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.enums import ProposalStatus, SatelliteSource
from app.database import get_db
from app.models.administrative import AdministrativeUnit
from app.models.pipeline import DataProposal
from app.schemas.pipeline import MonitorRequest, ApprovalRequest
from app.services.agents.forest_guard import get_forest_guard_agent
from app.services.earth_engine.service import EEQueryParams, get_earth_engine_service
from app.services.pipeline.pipeline import approve_proposal, reject_proposal
from app.core.demo_mode import tag_data_origin

router = APIRouter(prefix="/agents/forest-guard", tags=["ForestGuard"])

@router.post("/monitor")
def monitor(req: MonitorRequest, db: Session = Depends(get_db)):
    # Resolve geometry
    geometry = req.geometry
    if not geometry:
        unit = db.get(AdministrativeUnit, req.administrative_unit_id)
        if not unit:
            raise HTTPException(status_code=404, detail="Administrative unit not found")
        geometry = unit.geometry_dict()
        if not geometry:
            raise HTTPException(status_code=400, detail="Unit has no geometry; provide geometry in request")
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
    )
    result["origin"] = tag_data_origin()
    return result

@router.post("/ndvi")
def ndvi(req: MonitorRequest, db: Session = Depends(get_db)):
    geometry = req.geometry
    if not geometry:
        unit = db.get(AdministrativeUnit, req.administrative_unit_id)
        if not unit or not unit.geometry_dict():
            raise HTTPException(status_code=404, detail="Geometry required")
        geometry = unit.geometry_dict()
    svc = get_earth_engine_service()
    params = EEQueryParams(
        administrative_unit_id=req.administrative_unit_id,
        geometry=geometry,  # type: ignore
        start_date=req.start_date,
        end_date=req.end_date,
        cloud_percentage=req.cloud_percentage,
        dataset=SatelliteSource(req.dataset) if req.dataset in [e.value for e in SatelliteSource] else SatelliteSource.SENTINEL2,
    )
    stats = svc.calculate_ndvi(params)
    return {"ndvi": stats.__dict__, "formula": "NDVI = (NIR - RED)/(NIR + RED)", "origin": tag_data_origin()}

@router.get("/proposals")
def list_proposals(status: str | None = Query(default=None), db: Session = Depends(get_db)):
    q = db.query(DataProposal)
    if status:
        q = q.filter(DataProposal.status == status.upper())
    items = q.order_by(DataProposal.created_at.desc()).limit(100).all()
    return [{"id": p.id, "status": p.status, "title": p.title, "administrative_unit_id": p.administrative_unit_id, "created_at": str(p.created_at), "payload": json.loads(p.payload) if p.payload else None} for p in items]

@router.get("/proposals/{proposal_id}")
def get_proposal(proposal_id: str, db: Session = Depends(get_db)):
    p = db.get(DataProposal, proposal_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": p.id, "status": p.status, "title": p.title, "payload": json.loads(p.payload) if p.payload else None, "origin": tag_data_origin()}

@router.post("/proposals/{proposal_id}/approve")
def approve(proposal_id: str, body: ApprovalRequest, db: Session = Depends(get_db)):
    try:
        return approve_proposal(db, proposal_id, verified_by=body.verified_by)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@router.post("/proposals/{proposal_id}/reject")
def reject(proposal_id: str, body: ApprovalRequest, db: Session = Depends(get_db)):
    try:
        return reject_proposal(db, proposal_id, reviewed_by=body.verified_by, reason=body.reason or "No reason")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@router.get("/lineage/{proposal_id}")
def lineage(proposal_id: str, db: Session = Depends(get_db)):
    from app.models.query_log import DataLineage
    lin = db.query(DataLineage).filter(DataLineage.proposal_id == proposal_id).first()
    if not lin:
        raise HTTPException(status_code=404, detail="Lineage not found")
    return {
        "proposal_id": lin.proposal_id,
        "ai_result_id": lin.ai_result_id,
        "processed_data_id": lin.processed_data_id,
        "raw_data_id": lin.raw_data_id,
        "query_log_id": lin.query_log_id,
        "verified_data_id": lin.verified_data_id,
        "dataset": lin.dataset,
    }

@router.get("/query-logs")
def query_logs(limit: int = 20, db: Session = Depends(get_db)):
    from app.models.query_log import EEQueryLog
    logs = db.query(EEQueryLog).order_by(EEQueryLog.created_at.desc()).limit(limit).all()
    return [{"id": l.id, "agent_id": l.agent_id, "dataset": l.dataset, "status": l.status, "error_message": l.error_message, "created_at": str(l.created_at)} for l in logs]
