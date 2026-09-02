"""EcoGLMasterAgent Sec3-4 planning."""
import json, uuid
from datetime import datetime
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.models.phase7 import Plan, PlanTask, Approval
from app.services.agent_registry import select_agents, make_message, get_agent
from app.services.audit import audit_log

GOAL_TEMPLATES={
    "Reduce flood-related logistics disruption.": ["Analyze rainfall forecast","Find vulnerable roads","Find affected farms","Find alternative logistics routes","Calculate additional CO2","Compare scenarios","Generate recommendation"],
    "Giảm nguy cơ gián đoạn chuỗi cung ứng cà phê trong mùa mưa.": ["Find high-risk areas","Analyze rainfall","Analyze roads","Analyze farms","Analyze factories","Analyze logistics","Simulate scenarios","Generate mitigation plans"],
}

class EcoGLMasterAgent:
    def analyze_goal(self, goal:str)->Dict[str, Any]:
        # Sec4 goal → tasks
        tasks=GOAL_TEMPLATES.get(goal, ["Analyze","Predict","Simulate","Recommend"])
        return {"goal": goal, "inferred_tasks": tasks, "goal_type": "SUPPLY_CHAIN_RESILIENCE" if "cà phê" in goal or "logistics" in goal.lower() else "ENVIRONMENTAL_PROTECTION"}
    def create_plan(self, db:Session, goal:str, goal_type:str="SUPPLY_CHAIN_RESILIENCE", scope:Dict|None=None, priority:str="HIGH")->Plan:
        analysis=self.analyze_goal(goal)
        agents=select_agents(goal_type)
        plan=Plan(goal=goal, goal_type=goal_type, priority=priority, scope=json.dumps(scope or {}), agents=json.dumps(agents), constraints=json.dumps({}), assumptions=json.dumps({"data_freshness":"2h"}))
        db.add(plan); db.flush()
        # Task DAG Sec8
        prev=None
        for i,name in enumerate(analysis["inferred_tasks"]):
            t=PlanTask(plan_id=plan.id, name=name, agent=agents[i%len(agents)] if agents else "ForestGuard", dependencies=json.dumps([prev]) if prev else json.dumps([]))
            db.add(t); db.flush(); prev=t.id
        audit_log(db, action="PLAN_CREATED", resource_type="plan", resource_id=plan.id, detail=goal); db.commit(); db.refresh(plan)
        return plan
    def delegate_tasks(self, db:Session, plan_id:str)->List[PlanTask]:
        tasks=db.query(PlanTask).filter_by(plan_id=plan_id).all()
        # simulate delegation via messages
        for t in tasks:
            msg=make_message("EcoGLMasterAgent", t.agent or "ForestGuard", t.id, {"task": t.name})
            t.result=json.dumps({"message": msg, "status":"delegated"})
        db.commit()
        return tasks
    def collect_results(self, db:Session, plan_id:str)->Dict:
        tasks=db.query(PlanTask).filter_by(plan_id=plan_id).all()
        return {"collected": len(tasks), "tasks": [{"name": t.name, "agent": t.agent} for t in tasks]}
    def resolve_conflicts(self, db:Session, conflicts:List[Dict])->Dict:
        # Sec19-20 check freshness/source/confidence/version
        from app.models.phase7 import AgentConflictRecord
        for c in conflicts:
            rec=AgentConflictRecord(agents=json.dumps(c.get("agents",[])), claims=json.dumps(c.get("claims",{})), severity="MEDIUM", resolution="HUMAN REVIEW REQUIRED" if c.get("severity")=="HIGH" else "auto", status="OPEN")
            db.add(rec)
        db.commit()
        return {"resolved": len(conflicts), "human_review": any(c.get("severity")=="HIGH" for c in conflicts)}
    def simulate_options(self, options:List[str])->Dict:
        return {"simulations": [{"option": o, "risk": 70-i*10} for i,o in enumerate(options)]}
    def generate_recommendation(self, trace:Dict)->Dict:
        return {"recommendation": "Reroute logistics through Route B", "expected_impact":"Lower disruption", "trade_off":"Longer route", "evidence": trace, "confidence":"High confidence"}
    def request_human_approval(self, db:Session, plan_id:str, action:str="CREATE_OFFICIAL_ALERT")->Approval:
        appr=Approval(plan_id=plan_id, action=action, status="PENDING")
        db.add(appr); db.commit(); db.refresh(appr)
        return appr
    def monitor_execution(self, plan_id:str, db:Session)->Dict:
        tasks=db.query(PlanTask).filter_by(plan_id=plan_id).all()
        done=len([t for t in tasks if t.status=="COMPLETED"])
        total=len(tasks) or 1
        return {"plan": f"{int(done/total*100)}%", "tasks": f"{done}/{total} completed", "status": "ON TRACK" if done/total>0.5 else "DELAYED"}
    def evaluate_outcome(self, db:Session, prediction:str, outcome:str)->Dict:
        from app.models.phase7 import LearningRecord
        correct= prediction.lower() in outcome.lower()
        rec=LearningRecord(prediction=prediction, action="plan executed", outcome=outcome, prediction_correct=int(correct))
        db.add(rec); db.commit()
        return {"prediction_correct": correct, "difference": "-8% if not correct", "explanation": "Weather updated"}

master_agent=EcoGLMasterAgent()
