"""AlertEngine — PROPOSED/ACTIVE/ACKNOWLEDGED/RESOLVED/EXPIRED/REJECTED, levels INFO..CRITICAL."""
from __future__ import annotations
import json
from datetime import datetime, timedelta
from typing import Any, Dict
from sqlalchemy.orm import Session
from app.models.risk import Alert, Incident, IncidentEvidence
from app.services.audit import audit_log

LEVEL_MAP={ "LOW":"INFO","MODERATE":"WATCH","ELEVATED":"WARNING","HIGH":"HIGH","CRITICAL":"CRITICAL"}
PRIORITY_MAP={"INFO":"LOW","WATCH":"NORMAL","WARNING":"NORMAL","HIGH":"HIGH","CRITICAL":"CRITICAL"}

class AlertEngine:
    def create(self, db:Session, risk_type:str, administrative_unit_id:str, score:int, confidence:int, explanation:str, geometry:Dict|None=None, level:str|None=None, ttl_days:int=7)->Alert:
        lvl= level or LEVEL_MAP.get("CRITICAL" if score>80 else "HIGH" if score>60 else "WARNING" if score>40 else "WATCH" if score>20 else "INFO", "WARNING")
        alert=Alert(
            risk_type=risk_type.upper(), administrative_unit_id=administrative_unit_id,
            level=lvl, status="ACTIVE", priority=PRIORITY_MAP.get(lvl,"NORMAL"),
            title=f"{lvl} — Potential {risk_type.lower()} risk in {administrative_unit_id}",
            message=f"Potential {risk_type.lower()} risk detected. Risk {score}/100 Confidence {confidence}%",
            explanation=explanation, geometry=json.dumps(geometry) if geometry else None,
            expires_at=datetime.utcnow()+timedelta(days=ttl_days)
        )
        db.add(alert)
        # incident
        inc=Incident(alert_id=alert.id, administrative_unit_id=administrative_unit_id, title=alert.title, status="ACTIVE")
        db.add(inc)
        db.flush()
        db.add(IncidentEvidence(incident_id=inc.id, evidence_type="SATELLITE", payload=json.dumps({"score":score,"confidence":confidence})))
        audit_log(db, action="ALERT_CREATED", resource_type="alert", resource_id=alert.id)
        db.commit(); db.refresh(alert)
        return alert
    def acknowledge(self, db:Session, alert_id:str, actor_id:str)->Alert:
        a=db.get(Alert, alert_id)
        if not a: raise ValueError("Alert not found")
        a.status="ACKNOWLEDGED"; a.acknowledged_by=actor_id
        audit_log(db, action="ALERT_ACKNOWLEDGED", resource_type="alert", resource_id=alert_id, actor_id=actor_id)
        db.commit(); return a
    def resolve(self, db:Session, alert_id:str, actor_id:str|None=None)->Alert:
        a=db.get(Alert, alert_id)
        if not a: raise ValueError("Alert not found")
        a.status="RESOLVED"; a.resolved_at=datetime.utcnow()
        audit_log(db, action="ALERT_RESOLVED", resource_type="alert", resource_id=alert_id, actor_id=actor_id)
        # also resolve incident
        inc=db.query(Incident).filter_by(alert_id=alert_id).first()
        if inc: inc.status="RESOLVED"
        db.commit(); return a
    def expire_stale(self, db:Session):
        now=datetime.utcnow()
        for a in db.query(Alert).filter(Alert.status=="ACTIVE", Alert.expires_at < now).all():
            a.status="EXPIRED"
        db.commit()

alert_engine=AlertEngine()
