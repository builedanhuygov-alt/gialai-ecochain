"""EcoGLOrchestrator — Sec3-6 event-driven cross-agent (Sec2)."""
from __future__ import annotations
import json, uuid
from datetime import datetime
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from app.models.risk import AgentRun, AgentResult
from app.services.audit import audit_log

EVENTS=["FOREST_CHANGE_DETECTED","FIRE_RISK_ELEVATED","FLOOD_RISK_ELEVATED","COMMUNITY_REPORT_CREATED","REPORT_COMMUNITY_VERIFIED","ADMIN_VERIFIED","CARBON_CHANGE_DETECTED","PLOT_REGISTERED","LOT_CREATED","ROUTE_BLOCKED","EUDR_FLAG_CREATED"]
# kill switch Sec80
ENABLED={"ForestGuard":True,"DisasterGuard":True,"CarbonGuard":True,"EUDRGuard":True,"GreenRouteAgent":True,"MediaAnalysisAgent":True,"EcoGLOrchestrator":True}

def is_enabled(agent:str)->bool: return ENABLED.get(agent, True)
def set_enabled(agent:str, enabled:bool): ENABLED[agent]=enabled

def record_run(db:Session, agent:str, administrative_unit_id:str, input_params:Dict[str,Any], status:str="COMPLETED", score:int|None=None, confidence:int|None=None, explanation:str|None=None)->AgentRun:
    if not is_enabled(agent):
        raise RuntimeError(f"Agent {agent} is PAUSED (kill switch)")
    run=AgentRun(agent=agent, administrative_unit_id=administrative_unit_id, status=status, model_version="v1.0", input_params=json.dumps(input_params))
    db.add(run); db.flush()
    if score is not None:
        db.add(AgentResult(run_id=run.id, score=score, confidence=confidence or 70, explanation=explanation))
    audit_log(db, action="AGENT_RUN", resource_type="agent_run", resource_id=run.id, detail=f"{agent} {administrative_unit_id}")
    db.commit(); return run

class EcoGLOrchestrator:
    def emit(self, db:Session, event:str, payload:Dict[str,Any])->Dict[str,Any]:
        # Sec5 event bus
        trace=[]
        uid=payload.get("administrative_unit_id") or payload.get("unit_id") or "unknown"
        geom=payload.get("geometry")
        # Agent memory: store previous runs count
        prev=db.query(AgentRun).filter_by(administrative_unit_id=uid).count()
        # Orchestration flow Sec4, Sec6
        if event=="FOREST_CHANGE_DETECTED":
            # Risk Engine + downstream
            from app.services.risk_engine import risk_engine
            from app.services.agents.disaster_guard import disaster_guard
            from app.services.agents.carbon_guard import carbon_guard
            # record ForestGuard run
            record_run(db, "ForestGuard", uid, payload, score=payload.get("risk_score",70), confidence=payload.get("confidence",80), explanation="ForestGuard detected potential vegetation change")
            trace.append({"agent":"ForestGuard","signal":"FOREST_CHANGE","why":"NDVI decline"})
            # DisasterGuard prioritized if fire signal
            fire=disaster_guard.analyze(uid, "FIRE", geom, {"ndvi_change": payload.get("ndvi_change"), "temperature": 34})
            trace.append({"agent":"DisasterGuard","signal":fire, "why": fire["explanation"]})
            # CarbonGuard
            carbon=carbon_guard.analyze(uid, forest_area_ha=1000, ndvi=payload.get("ndvi_current"))
            trace.append({"agent":"CarbonGuard","signal":carbon, "why": carbon["explanation"]})
            # EUDR if has lot
            if payload.get("lot_id"):
                from app.services.agents.eudr_guard import eudr_guard
                try:
                    eudr=eudr_guard.assess(db, payload["lot_id"])
                    trace.append({"agent":"EUDRGuard","signal": eudr["readiness"], "why":"Traceability check"})
                except: pass
            # Risk Engine overall
            signals={"forest": payload, "fire": fire, "carbon": {"score": int(abs(carbon["potential_carbon_change_pct"]*5))}}
            rs=risk_engine.compute(db, uid, signals)
            trace.append({"agent":"RiskEngine","signal": {"overall": rs.overall_score}, "why": "Multi-source fusion"})
        elif event=="PLOT_REGISTERED":
            # triggers forest+ eudr
            record_run(db, "EUDRGuard", uid, payload)
            trace.append({"agent":"EUDRGuard","why":"Plot geometry check"})
        elif event=="LOT_CREATED":
            # orchestrator auto Sec45
            from app.services.agents.eudr_guard import eudr_guard
            try:
                r=eudr_guard.assess(db, payload["lot_id"]); trace.append({"agent":"EUDRGuard","signal":r["readiness"]})
            except: pass
        # unified trace Sec9
        decision_trace={"event": event, "payload": payload, "trace": trace, "agent_memory": {"previous_runs": prev, "model_versions": {"ForestGuard":"v1.0","DisasterGuard":"v1.0"}}, "recommendation": self.recommend(trace)}
        return {"orchestrator":"EcoGLOrchestrator","event":event,"trace": decision_trace, "run_id": str(uuid.uuid4())}

    def recommend(self, trace:List[Dict[str,Any]])->List[str]:
        recs=[]
        for t in trace:
            if t.get("agent")=="DisasterGuard" and t.get("signal",{}).get("level") in ("HIGH","CRITICAL"):
                recs.append("Request field verification")
                recs.append("Notify Commune Admin")
            if t.get("agent")=="ForestGuard":
                recs.append("Monitor nearby forest plots")
        if not recs: recs=["Continue monitoring"]
        return recs

    def cross_check(self, forest:Dict[str,Any], disaster:Dict[str,Any], community_verified:bool)->str:
        # Sec47 multi-agent cross check
        if forest.get("classification") in ("HIGH","CRITICAL") and disaster.get("level") in ("HIGH","CRITICAL") and community_verified:
            return "Multiple evidence sources indicate elevated fire-related environmental risk."
        return "Single agent signal — requires further verification."

orchestrator=EcoGLOrchestrator()
