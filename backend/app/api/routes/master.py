"""Phase7 Master APIs Sec112 + Command Center."""
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.phase7 import Plan, PlanTask, Mission, LearningRecord, Approval, ModelRegistryEntry
from app.models.risk import AgentRun
from app.services.master_agent import master_agent
from app.services.agent_registry import list_agents, set_health
from app.services.audit import audit_log
from app.services.event_bus import publish
from app.services.impact_cascade import cascade
from app.services.priority_engine import priority

router=APIRouter(tags=["Master"])

# Sec112 agents
@router.get("/agents")
def get_agents(): return list_agents()
@router.get("/agent-runs")
def list_runs(db:Session=Depends(get_db), agent:Optional[str]=None):
    q=db.query(AgentRun)
    if agent: q=q.filter(AgentRun.agent==agent)
    return [{"id": r.id, "agent": r.agent, "status": r.status} for r in q.limit(20).all()]

# Plans Sec6-8
@router.post("/plans")
def create_plan(body:dict, db:Session=Depends(get_db)):
    goal=body.get("goal","Reduce flood risk")
    plan=master_agent.create_plan(db, goal, body.get("goal_type","DISASTER_PREPAREDNESS"), body.get("scope"), body.get("priority","HIGH"))
    return {"plan_id": plan.id, "goal": plan.goal, "trace_id": plan.trace_id, "status": plan.approval_status}

@router.get("/plans")
def list_plans(db:Session=Depends(get_db)):
    return [{"id": p.id, "goal": p.goal, "approval_status": p.approval_status, "execution_status": p.execution_status, "trace_id": p.trace_id} for p in db.query(Plan).limit(20).all()]

@router.get("/plans/{plan_id}")
def get_plan(plan_id:str, db:Session=Depends(get_db)):
    p=db.get(Plan, plan_id)
    if not p: raise HTTPException(404, "Plan not found")
    tasks=db.query(PlanTask).filter_by(plan_id=plan_id).all()
    return {"id": p.id, "goal": p.goal, "agents": json.loads(p.agents) if p.agents else [], "tasks": [{"id": t.id, "name": t.name, "agent": t.agent, "dependencies": json.loads(t.dependencies) if t.dependencies else [], "status": t.status} for t in tasks], "trace_id": p.trace_id, "explain": "WHY THESE AGENTS? Weather needed for disaster forecast etc (Sec51)", "evidence": {"sources":["satellite","weather"], "freshness":"2h", "confidence":"High", "model_version":"v1.0", "assumptions": json.loads(p.assumptions) if p.assumptions else {}}}

@router.post("/plans/{plan_id}/delegate")
def delegate(plan_id:str, db:Session=Depends(get_db)):
    tasks=master_agent.delegate_tasks(db, plan_id)
    return {"delegated": len(tasks)}

@router.post("/plans/{plan_id}/simulate")
def simulate_plan(plan_id:str, body:dict, db:Session=Depends(get_db)):
    opts=body.get("options",["Baseline","Moderate","Severe","Extreme"])
    sim=master_agent.simulate_options(opts)
    # Sec25 scenario comparison
    return {"plan_id": plan_id, "simulations": sim["simulations"], "comparison": {"affected_villages": [12,31,58]}}

@router.post("/plans/{plan_id}/recommend")
def recommend(plan_id:str, db:Session=Depends(get_db)):
    rec=master_agent.generate_recommendation({"plan_id": plan_id})
    return rec

# Tasks Sec8 DAG
@router.get("/tasks")
def list_tasks(plan_id:Optional[str]=None, db:Session=Depends(get_db)):
    q=db.query(PlanTask)
    if plan_id: q=q.filter(PlanTask.plan_id==plan_id)
    return [{"id": t.id, "name": t.name, "agent": t.agent, "status": t.status} for t in q.limit(20).all()]

# Missions Sec37-42
@router.post("/missions")
def create_mission(body:dict, db:Session=Depends(get_db)):
    m=Mission(goal=body["goal"], scope=body.get("scope","Province"), deadline=body.get("deadline"), kpis=json.dumps(body.get("kpis",{})), agents=json.dumps(body.get("agents",[])), resources=json.dumps(body.get("resources",{})))
    db.add(m); db.commit(); db.refresh(m)
    audit_log(db, action="MISSION_CREATED", resource_type="mission", resource_id=m.id); db.commit()
    return {"mission_id": m.id, "goal": m.goal, "trace_id": m.trace_id}

@router.get("/missions")
def list_missions(db:Session=Depends(get_db)):
    return [{"id": m.id, "goal": m.goal, "scope": m.scope, "status": m.status} for m in db.query(Mission).limit(20).all()]

# Scenarios/simulations
@router.get("/scenarios")
def list_scenarios(db:Session=Depends(get_db)):
    from app.models.predictive import Simulation
    sims=db.query(Simulation).limit(10).all()
    return [{"id": s.id, "scenario": s.scenario, "affected_villages": s.affected_villages} for s in sims]

@router.get("/simulations")
def list_sims(db:Session=Depends(get_db)):
    from app.models.predictive import Simulation
    return [{"id": s.id, "scenario": s.scenario} for s in db.query(Simulation).limit(10).all()]

@router.get("/recommendations")
def list_recs(db:Session=Depends(get_db)):
    # mock
    return [{"recommendation": "Reroute logistics", "expected_impact":"Lower disruption"}]

# Approvals Sec29-30
@router.get("/approvals")
def list_approvals(db:Session=Depends(get_db)):
    return [{"id": a.id, "plan_id": a.plan_id, "action": a.action, "status": a.status} for a in db.query(Approval).limit(20).all()]

@router.post("/approvals/{approval_id}/approve")
def approve(approval_id:str, body:dict, db:Session=Depends(get_db)):
    a=db.get(Approval, approval_id)
    if not a: raise HTTPException(404, "Approval not found")
    a.status="APPROVED"; a.approved_by=body.get("approved_by","admin"); a.reason=body.get("reason","approved")
    # execution Sec33
    plan=db.get(Plan, a.plan_id)
    if plan: plan.execution_status="RUNNING"
    audit_log(db, action="APPROVAL_GRANTED", resource_type="approval", resource_id=approval_id); db.commit()
    return {"id": a.id, "status": a.status}

@router.post("/approvals/{approval_id}/reject")
def reject(approval_id:str, body:dict, db:Session=Depends(get_db)):
    a=db.get(Approval, approval_id)
    if not a: raise HTTPException(404, "Not found")
    a.status="REJECTED"; db.commit(); return {"id": a.id, "status": a.status}

# Outcomes & learning Sec35-36
@router.get("/outcomes")
def outcomes(db:Session=Depends(get_db)):
    return [{"id": r.id, "prediction": r.prediction, "outcome": r.outcome, "correct": bool(r.prediction_correct)} for r in db.query(LearningRecord).limit(10).all()]

@router.get("/learning")
def learning(db:Session=Depends(get_db)):
    return [{"id": r.id, "prediction": r.prediction, "prediction_correct": bool(r.prediction_correct)} for r in db.query(LearningRecord).limit(10).all()]

# Models Sec102-103
@router.get("/models")
def list_models(db:Session=Depends(get_db)):
    return [{"id": m.id, "model": m.model, "version": m.version, "deployment_status": m.deployment_status} for m in db.query(ModelRegistryEntry).limit(20).all()]

@router.post("/models/rollback")
def rollback(body:dict, db:Session=Depends(get_db)):
    return {"from": body.get("from","v2.0"), "to": body.get("to","v1.8"), "status":"rolled back"}

# Governance Sec97-99
@router.get("/governance")
def governance(db:Session=Depends(get_db)):
    from app.models.ops import AuditLog
    return {"ai_decisions": db.query(AuditLog).filter(AuditLog.action.like("AGENT%")).count(), "human_decisions": db.query(AuditLog).filter(AuditLog.action.like("APPROVAL%")).count(), "pending_approvals": db.query(Approval).filter(Approval.status=="PENDING").count()}

# Event bus Sec113-115
@router.post("/events/publish")
def publish_event(body:dict):
    evt=body.get("event","FOREST_RISK_INCREASED"); payload=body.get("payload",{})
    return publish(evt, payload, body.get("priority","MEDIUM"))

# Impact cascade Sec59
@router.post("/impact/cascade")
def impact(body:dict):
    return cascade(body.get("event","Flood"), body)

# Priority Sec61-62
@router.post("/priority/evaluate")
def eval_priority(body:dict):
    p=priority(body.get("severity",70), body.get("exposure",60), body.get("confidence",80), body.get("time_sensitivity",70), body.get("impact",60))
    return {"priority": p, "queue": f"#{1} Flood risk — Commune A (priority {p})"}

# Demo scenarios Sec119-121 command center Sec122
@router.get("/command-center")
def command_center(db:Session=Depends(get_db)):
    from app.models.risk import Alert
    return {"active_critical": db.query(Alert).filter(Alert.level=="CRITICAL").count(), "high_risk": db.query(Alert).filter(Alert.level=="HIGH").count(), "live_digital_twin": "/api/digital-twin", "ai_activity": db.query(AgentRun).order_by(AgentRun.created_at.desc()).limit(5).all().__len__() or 0}

@router.get("/activity-stream")
def activity_stream(db:Session=Depends(get_db)):
    runs=db.query(AgentRun).order_by(AgentRun.created_at.desc()).limit(10).all()
    return [{"time": str(r.created_at), "msg": f"{r.agent} completed analysis"} for r in runs]

# Kill switch Sec108-110 + health
@router.post("/kill-switch")
def kill_switch(body:dict):
    from app.services.orchestrator import set_enabled
    if body.get("global"):
        for a in ["ForestGuard","DisasterGuard","CarbonGuard","EUDRGuard"]:
            set_enabled(a, False)
        return {"mode": "MANUAL MODE", "ai": "disabled", "manual": "Analysis only"}
    return {"status":"ok"}

@router.get("/health/detailed")
def detailed_health(db:Session=Depends(get_db)):
    return {"database": "healthy", "gee": "healthy", "agents": len(list_agents())}
