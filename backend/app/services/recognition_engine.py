"""RecognitionEngine — achievements evidence-based."""
from __future__ import annotations
import json
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.risk import Achievement
from app.services.audit import audit_log

ACHIEVEMENTS={
    "Fastest Disaster Response": {"criteria":"Response Performance >=90 and avg verification <30min","score_min":90},
    "Forest Guardian Commune": {"criteria":"Forest monitored + low risk trend","score_min":85},
    "Community Reporting Champion": {"criteria":"Verified reports >50 + community participation >80","score_min":80},
    "Community Climate Action": {"criteria":"Community participation high","score_min":75},
    "Outstanding Village": {"criteria":"Overall safety top 10%","score_min":88},
    "Green Logistics Pioneer": {"criteria":"Logistics / sustainability","score_min":80},
    # Phase4 Sec34
    "EUDR Ready Commune": {"criteria":"EUDR readiness >=90","score_min":90},
    "Traceability Champion": {"criteria":"Traceability >=90","score_min":90},
    "Carbon Smart Commune": {"criteria":"Carbon performance >=85","score_min":85},
    "Green Logistics Champion": {"criteria":"Logistics score >=85","score_min":85},
    "Forest Protection Champion": {"criteria":"Forest score >=90","score_min":90},
    "Overall EcoGL Champion": {"criteria":"Overall EcoGL score top 5%","score_min":88},
}

class RecognitionEngine:
    def award(self, db:Session, name:str, administrative_unit_id:str, period:str|None=None, score:float|None=None, evidence:dict|None=None, verified_by:str|None=None)->Achievement:
        if name not in ACHIEVEMENTS: raise ValueError(f"Unknown achievement {name}")
        if not evidence: raise ValueError("Evidence required — no award without evidence (Sec 39)")
        period=period or datetime.utcnow().strftime("%Y-%m")
        ach=Achievement(name=name, description=ACHIEVEMENTS[name]["criteria"], criteria=ACHIEVEMENTS[name]["criteria"], administrative_unit_id=administrative_unit_id, period=period, score=score, evidence=json.dumps(evidence), verified_by=verified_by)
        db.add(ach)
        audit_log(db, action="ACHIEVEMENT_AWARDED", resource_type="achievement", resource_id=ach.id, detail=name)
        db.commit(); db.refresh(ach); return ach
    def list(self, db:Session, administrative_unit_id:str|None=None):
        q=db.query(Achievement)
        if administrative_unit_id: q=q.filter_by(administrative_unit_id=administrative_unit_id)
        return q.order_by(Achievement.created_at.desc()).limit(20).all()

recognition_engine=RecognitionEngine()
