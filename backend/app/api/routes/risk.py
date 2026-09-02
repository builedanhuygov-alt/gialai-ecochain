"""Sec 58 APIs — risk / alerts / disaster / carbon / rankings / achievements + profiles."""
import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.administrative import AdministrativeUnit
from app.models.risk import Alert, RiskHistory, RiskScore, CarbonRecord, Achievement, RankingSnapshot, Incident, IncidentEvidence
from app.services.agents.disaster_guard import disaster_guard
from app.services.agents.carbon_guard import carbon_guard, CarbonModel
from app.services.risk_engine import risk_engine
from app.services.alert_engine import alert_engine
from app.services.ranking_engine import ranking_engine
from app.services.recognition_engine import recognition_engine
from app.core.demo_mode import tag_data_origin

router = APIRouter(tags=["Risk"])

# ── Risk ──────────────────────────────────────────────────────────
@router.get("/risk/overview")
def risk_overview(db: Session = Depends(get_db)):
    total=db.query(RiskScore).count()
    critical=db.query(Alert).filter(Alert.level=="CRITICAL", Alert.status=="ACTIVE").count()
    high=db.query(Alert).filter(Alert.level=="HIGH", Alert.status=="ACTIVE").count()
    return {"total_scores": total, "critical_alerts": critical, "high_alerts": high, "origin": tag_data_origin()}

@router.get("/risk/areas")
def risk_areas(
    province: Optional[str]=Query(default=None), commune: Optional[str]=Query(default=None),
    village: Optional[str]=Query(default=None), risk_type: Optional[str]=Query(default=None),
    date: Optional[str]=Query(default=None), status: Optional[str]=Query(default=None),
    db: Session=Depends(get_db)):
    # Sec 55 filter — simplified
    q=db.query(RiskScore)
    items=q.order_by(RiskScore.created_at.desc()).limit(50).all()
    return [{"administrative_unit_id": r.administrative_unit_id, "overall_score": r.overall_score, "overall_level": r.overall_level, "breakdown": json.loads(r.breakdown) if r.breakdown else {}, "confidence": r.confidence} for r in items]

@router.get("/risk/{unit_id}")
def risk_profile(unit_id:str, db:Session=Depends(get_db)):
    rs=db.query(RiskScore).filter_by(administrative_unit_id=unit_id).order_by(RiskScore.created_at.desc()).first()
    if not rs: raise HTTPException(404, "No risk profile")
    # area risk profile Sec27 + radar Sec28
    breakdown=json.loads(rs.breakdown) if rs.breakdown else {}
    radar={k: {"score": v, "level": ("LOW" if v<=20 else "MODERATE" if v<=40 else "ELEVATED" if v<=60 else "HIGH" if v<=80 else "CRITICAL")} for k,v in breakdown.items()}
    return {
        "administrative_unit_id": unit_id, "overall_score": rs.overall_score, "overall_level": rs.overall_level,
        "breakdown": breakdown, "radar": radar, "confidence": rs.confidence, "model_version": rs.model_version,
        "trend": risk_engine.history_trend(db, unit_id, "OVERALL"),
        "early_warning": risk_engine.early_warning(db, unit_id),
        "origin": tag_data_origin()
    }

@router.get("/risk/history/{unit_id}")
def risk_history(unit_id:str, risk_type:Optional[str]=Query(default="OVERALL"), db:Session=Depends(get_db)):
    h=risk_engine.history_trend(db, unit_id, risk_type or "OVERALL")
    rows=db.query(RiskHistory).filter_by(administrative_unit_id=unit_id).order_by(RiskHistory.created_at.asc()).all()
    return {"administrative_unit_id": unit_id, "risk_type": risk_type, "history": h, "records": [{"period": r.period, "score": r.score, "risk_type": r.risk_type} for r in rows]}

# ── Alerts / Incidents ────────────────────────────────────────────
@router.get("/alerts")
def list_alerts(status:Optional[str]=Query(default=None), level:Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    q=db.query(Alert)
    if status: q=q.filter(Alert.status==status.upper())
    if level: q=q.filter(Alert.level==level.upper())
    alerts=q.order_by(Alert.created_at.desc()).limit(50).all()
    return [{"id": a.id, "risk_type": a.risk_type, "level": a.level, "status": a.status, "title": a.title, "administrative_unit_id": a.administrative_unit_id, "priority": a.priority, "created_at": str(a.created_at)} for a in alerts]

@router.get("/alerts/{alert_id}")
def get_alert(alert_id:str, db:Session=Depends(get_db)):
    a=db.get(Alert, alert_id)
    if not a: raise HTTPException(404, "Alert not found")
    inc=db.query(Incident).filter_by(alert_id=alert_id).first()
    ev=db.query(IncidentEvidence).filter_by(incident_id=inc.id).all() if inc else []
    return {
        "id": a.id, "risk_type": a.risk_type, "level": a.level, "status": a.status, "title": a.title, "message": a.message,
        "explanation": a.explanation, "geometry": json.loads(a.geometry) if a.geometry else None,
        "priority": a.priority, "model_version": a.model_version,
        "incident": {"id": inc.id, "status": inc.status, "evidence": [{"type": e.evidence_type, "payload": json.loads(e.payload) if e.payload else None} for e in ev]} if inc else None,
        "origin": tag_data_origin()
    }

@router.post("/alerts/{alert_id}/acknowledge")
def ack_alert(alert_id:str, body:dict, db:Session=Depends(get_db)):
    actor=body.get("actor_id") or body.get("verified_by") or "admin"
    a=alert_engine.acknowledge(db, alert_id, actor)
    return {"id": a.id, "status": a.status}

@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id:str, body:dict, db:Session=Depends(get_db)):
    actor=body.get("actor_id") or body.get("verified_by")
    a=alert_engine.resolve(db, alert_id, actor)
    return {"id": a.id, "status": a.status}

@router.post("/alerts/{alert_id}/verify")
def verify_alert(alert_id:str, body:dict, db:Session=Depends(get_db)):
    # human override Sec50 — confirm/reject/escalate
    action=body.get("action","VERIFY")  # CONFIRM/REJECT/ESCALATE
    actor=body.get("actor_id") or "admin"
    reason=body.get("reason","human override")
    a=db.get(Alert, alert_id)
    if not a: raise HTTPException(404, "Alert not found")
    if action=="REJECT": a.status="REJECTED"
    elif action=="ESCALATE": a.priority="CRITICAL"; a.level="CRITICAL"
    else: a.status="ACKNOWLEDGED"
    from app.services.audit import audit_log
    audit_log(db, action=f"ALERT_{action}", resource_type="alert", resource_id=alert_id, actor_id=actor, detail=reason)
    db.commit()
    return {"id": a.id, "status": a.status, "action": action}

# ── Disaster ──────────────────────────────────────────────────────
@router.get("/disaster")
def disaster_overview(db:Session=Depends(get_db)):
    # Sec44 critical areas table sorted by risk
    alerts=db.query(Alert).filter(Alert.status.in_(["ACTIVE","ACKNOWLEDGED"])).order_by(Alert.created_at.desc()).limit(20).all()
    # fake risk per alert
    table=[{"area": a.administrative_unit_id, "risk": 80 if a.level=="CRITICAL" else 65, "type": a.risk_type, "confidence": 80, "status": a.status} for a in alerts]
    table.sort(key=lambda x: x["risk"], reverse=True)
    return {"critical_areas": table, "origin": tag_data_origin()}

@router.post("/disaster/analyze")
def disaster_analyze(body:dict, db:Session=Depends(get_db)):
    unit_id=body.get("administrative_unit_id")
    if not unit_id: raise HTTPException(400, "administrative_unit_id required")
    geom=body.get("geometry")
    inputs=body.get("inputs") or {}
    # data fusion inputs
    unit=db.get(AdministrativeUnit, unit_id)
    if not unit: raise HTTPException(404, "Unit not found")
    if not geom: geom=unit.geometry_dict()
    risk_type=body.get("risk_type","FIRE")
    if risk_type=="ALL":
        signals=disaster_guard.analyze_all(unit_id, geom, inputs)
        # persist each as RiskSignal
        for s in signals:
            from app.models.risk import RiskSignal
            db.add(RiskSignal(agent="DisasterGuard", risk_type=s["risk_type"], administrative_unit_id=unit_id, score=s["score"], confidence=s["confidence"], level=s["level"], model_version=s["model_version"], explanation=s["explanation"], data_sources=json.dumps(list(inputs.keys()))))
        db.commit()
        return {"signals": signals, "fused": disaster_guard.data_fusion(signals, community_verified=body.get("community_verified",False)), "origin": tag_data_origin()}
    sig=disaster_guard.analyze(unit_id, risk_type, geom, inputs)
    from app.models.risk import RiskSignal
    db.add(RiskSignal(agent="DisasterGuard", risk_type=sig["risk_type"], administrative_unit_id=unit_id, score=sig["score"], confidence=sig["confidence"], level=sig["level"], model_version=sig["model_version"], explanation=sig["explanation"], data_sources=json.dumps(list(inputs.keys()))))
    db.commit()
    # create alert if high/critical
    if sig["level"] in ("HIGH","CRITICAL"):
        alert_engine.create(db, sig["risk_type"], unit_id, sig["score"], sig["confidence"], sig["explanation"], geom)
    return {**sig, "origin": tag_data_origin(), "data_quality": "MEDIUM"}

# ── Carbon ───────────────────────────────────────────────────────
@router.get("/carbon")
def carbon_list(administrative_unit_id:Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    q=db.query(CarbonRecord)
    if administrative_unit_id: q=q.filter_by(administrative_unit_id=administrative_unit_id)
    recs=q.order_by(CarbonRecord.created_at.desc()).limit(20).all()
    return [{"id": r.id, "administrative_unit_id": r.administrative_unit_id, "period": r.period, "carbon_stock_t": r.carbon_stock_t, "carbon_change_pct": r.carbon_change_pct, "confidence": r.confidence} for r in recs]

@router.post("/carbon/analyze")
def carbon_analyze(body:dict, db:Session=Depends(get_db)):
    unit_id=body.get("administrative_unit_id")
    if not unit_id: raise HTTPException(400, "administrative_unit_id required")
    area=body.get("forest_area_ha")
    ndvi=body.get("ndvi")
    result=carbon_guard.analyze(unit_id, forest_area_ha=area, ndvi=ndvi, ndvi_change=body.get("ndvi_change"))
    rec=CarbonRecord(administrative_unit_id=unit_id, period=body.get("period") or datetime.utcnow().strftime("%Y-%m"), forest_area_ha=result["forest_area_ha"], carbon_stock_t=result["estimated_carbon_stock_t"], carbon_change_pct=result["potential_carbon_change_pct"], confidence=result["confidence"], model_version=result["model_version"])
    db.add(rec); db.commit()
    return {**result, "origin": tag_data_origin(), "disclaimer": "Estimated carbon — not credit certification (Sec 23)"}

# ── Rankings / Achievements ──────────────────────────────────────
@router.get("/rankings")
def rankings_list(period:Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    out={}
    for t in ["SAFETY","RESPONSE","FOREST","COMMUNITY","PREPAREDNESS"]:
        snaps=db.query(RankingSnapshot).filter_by(ranking_type=t).order_by(RankingSnapshot.rank.asc()).limit(5).all()
        if not snaps:
            snaps=ranking_engine.compute(db, t, period)
            snaps=snaps[:5]
        out[t]=[{"rank": s.rank, "administrative_unit_id": s.administrative_unit_id, "score": s.score} for s in snaps]
    return out

@router.get("/rankings/{ranking_type}")
def ranking_detail(ranking_type:str, limit:int=Query(default=10), db:Session=Depends(get_db)):
    snaps=ranking_engine.list(db, ranking_type, limit)
    if not snaps:
        snaps=ranking_engine.compute(db, ranking_type)
    return [{"rank": s.rank, "administrative_unit_id": s.administrative_unit_id, "score": s.score, "period": s.period, "evidence": json.loads(s.evidence) if s.evidence else None} for s in snaps[:limit]]

@router.get("/achievements")
def list_achievements(administrative_unit_id:Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    items=recognition_engine.list(db, administrative_unit_id)
    return [{"id": a.id, "name": a.name, "administrative_unit_id": a.administrative_unit_id, "period": a.period, "score": a.score, "evidence": json.loads(a.evidence) if a.evidence else None, "verified_by": a.verified_by} for a in items]

@router.post("/achievements")
def create_achievement(body:dict, db:Session=Depends(get_db)):
    try:
        ach=recognition_engine.award(db, body["name"], body["administrative_unit_id"], body.get("period"), body.get("score"), body.get("evidence"), body.get("verified_by"))
        return {"id": ach.id, "name": ach.name, "status": "AWARDED"}
    except Exception as e:
        raise HTTPException(400, str(e))

# ── Profiles / Search / Heatmap ───────────────────────────────────
@router.get("/profiles/{unit_id}")
def profile(unit_id:str, db:Session=Depends(get_db)):
    unit=db.get(AdministrativeUnit, unit_id)
    if not unit: raise HTTPException(404, "Unit not found")
    rs=db.query(RiskScore).filter_by(administrative_unit_id=unit_id).order_by(RiskScore.created_at.desc()).first()
    alerts=db.query(Alert).filter_by(administrative_unit_id=unit_id, status="ACTIVE").count()
    ach=db.query(Achievement).filter_by(administrative_unit_id=unit_id).count()
    return {
        "unit": {"id": unit.id, "name": unit.name, "level": unit.level},
        "risk": {"overall_score": rs.overall_score if rs else None, "overall_level": rs.overall_level if rs else None, "breakdown": json.loads(rs.breakdown) if rs and rs.breakdown else {}},
        "active_alerts": alerts, "achievements": ach, "origin": tag_data_origin()
    }

@router.get("/search")
def search(q:str=Query(...), db:Session=Depends(get_db)):
    units=db.query(AdministrativeUnit).filter(AdministrativeUnit.name.like(f"%{q}%")).limit(10).all()
    alerts=db.query(Alert).filter(Alert.title.like(f"%{q}%")).limit(5).all()
    return {"units": [{"id": u.id, "name": u.name, "level": u.level} for u in units], "alerts": [{"id": a.id, "title": a.title} for a in alerts]}

@router.get("/heatmap")
def heatmap(risk_type:Optional[str]=Query(default="OVERALL"), db:Session=Depends(get_db)):
    # Sec30 heatmap data — color per level
    scores=db.query(RiskScore).order_by(RiskScore.overall_score.desc()).limit(30).all()
    color={"LOW":"🟢","MODERATE":"🟡","ELEVATED":"🟠","HIGH":"🔴","CRITICAL":"🟥"}
    return [{"administrative_unit_id": s.administrative_unit_id, "score": s.overall_score, "level": s.overall_level, "color": color.get(s.overall_level,"🟢")} for s in scores]
