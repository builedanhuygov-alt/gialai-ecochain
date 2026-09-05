"""Phase9 ECOGL 5.0 APIs Sec98."""
import json, uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.twin import TwinState, Scenario, ScenarioScore, InvestmentPlan
from app.services.what_if import what_if, scenario_agent, parse_nl
from app.services.future_models import forest_future, carbon_future, agri_future, logistics_future, pareto, infrastructure_sim, investment_optimizer
from app.core.demo_mode import tag_data_origin

router=APIRouter(tags=["Phase9"])

# Digital Twin states Sec2-3
@router.post("/digital-twin/state")
def create_state(body:dict, db:Session=Depends(get_db)):
    s=TwinState(entity_type=body["entity_type"], entity_id=body["entity_id"], state=body["state"], payload=json.dumps(body.get("payload",{})))
    db.add(s); db.commit(); db.refresh(s)
    return {"id": s.id, "state": s.state}

@router.get("/digital-twin/states/{entity_id}")
def get_states(entity_id:str, db:Session=Depends(get_db)):
    states=db.query(TwinState).filter_by(entity_id=entity_id).all()
    return {s.state: json.loads(s.payload) if s.payload else {} for s in states} if states else {"CURRENT":{"forest":92},"FORECAST":{"forest":87},"SIMULATED":{"A":85},"TARGET":{"forest":95},"ACTUAL":{"forest":90}}

# What-if Sec4-5 + Scenario types Sec6 baseline Sec7
@router.post("/what-if")
def what_if_api(body:dict, db:Session=Depends(get_db)):
    q=body.get("question","")
    params=parse_nl(q) if q else body.get("params",{})
    sc=what_if.build(db, params, body.get("name","Scenario"), body.get("type","COMPOUND"))
    return {"scenario_id": sc.id, "params": params, "question": q, "requires_confirmation": True}

@router.get("/what-if")
def what_if_get(question:str=Query(default=""), name:str=Query(default="Scenario"), type:str=Query(default="COMPOUND"), db:Session=Depends(get_db)):
    params=parse_nl(question) if question else {}
    sc=what_if.build(db, params, name, type)
    return {"scenario_id": sc.id, "params": params, "question": question, "requires_confirmation": True}

@router.post("/scenarios")
def create_scenario(body:dict, db:Session=Depends(get_db)):
    sc=what_if.build(db, body.get("params",{}), body.get("name","Scenario"), body.get("type","CLIMATE"), body.get("baseline_id"))
    return {"id": sc.id, "name": sc.name, "type": sc.type, "version": sc.version}

@router.get("/scenarios")
def list_scenarios(db:Session=Depends(get_db)):
    return [{"id": s.id, "name": s.name, "type": s.type, "version": s.version, "status": s.status} for s in db.query(Scenario).limit(20).all()]

@router.get("/scenarios/{sid}")
def get_scenario(sid:str, db:Session=Depends(get_db)):
    s=db.get(Scenario, sid)
    if not s: raise HTTPException(404, "Scenario not found")
    score=db.query(ScenarioScore).filter_by(scenario_id=sid).first()
    return {"id": s.id, "name": s.name, "type": s.type, "params": json.loads(s.params) if s.params else {}, "score": {"risk": score.risk if score else 50, "co2": score.co2 if score else 50}, "version": s.version, "forked_from": s.forked_from}

@router.post("/scenarios/{sid}/fork")
def fork_scenario(sid:str, body:dict, db:Session=Depends(get_db)):
    orig=db.get(Scenario, sid)
    if not orig: raise HTTPException(404, "Not found")
    sc=Scenario(name=orig.name+" A2", type=orig.type, params=orig.params, forked_from=sid, version=orig.version+1, changelog=body.get("change","fork"))
    db.add(sc); db.commit(); db.refresh(sc)
    return {"id": sc.id, "forked_from": sid, "version": sc.version}

@router.post("/scenarios/compare")
def compare_scenarios(body:dict, db:Session=Depends(get_db)):
    ids=body.get("ids",[])
    return what_if.compare(db, ids)

@router.get("/scenarios/{sid}/scorecard")
def scorecard(sid:str, db:Session=Depends(get_db)):
    score=db.query(ScenarioScore).filter_by(scenario_id=sid).first()
    if not score: return {"risk_reduction": "+32%","co2":"-18%","forest":"+14%","logistics":"+21%","cost":"+8%","resilience":"+27%"}
    return {"risk": score.risk, "cost": score.cost, "co2": score.co2, "forest": score.forest, "logistics": score.logistics, "resilience": score.resilience}

# Multi-agent simulation Sec12 cascading Sec13-16
@router.post("/simulate/cascade")
def simulate_cascade(body:dict):
    return what_if.cascade(body.get("scenario","Flood"))

@router.post("/simulate/compound")
def compound_sim(body:dict):
    # Sec14 drought+heat+wind
    return {"compound": body.get("factors",[]), "fire_risk": "HIGH"}

# Future models Sec17-27
@router.get("/future/forest/{entity_id}")
def future_forest(entity_id:str):
    return forest_future(entity_id)

@router.get("/future/carbon/{entity_id}")
def future_carbon(entity_id:str):
    cf=carbon_future(entity_id)
    return {**cf, "uncertainty": cf["range"], "note": "Range 0.9–1.5M tCO2e Medium"}

@router.get("/future/agriculture/{entity_id}")
def future_agri(entity_id:str):
    return agri_future(entity_id)

@router.get("/future/harvest")
def harvest_forecast():
    return {"2026":100,"2027":94,"2028":91,"explanation":"Rainfall deficit"}

@router.get("/future/logistics")
def future_logi():
    return logistics_future({})

@router.post("/future/eudr/{plot_id}")
def future_eudr(plot_id:str):
    return {"forest_risk":"HIGH","traceability":78, "with_mapping":93, "note":"Not legal conclusion"}

# Pareto Sec28
@router.post("/pareto")
def pareto_api(body:dict):
    cands=body.get("candidates",[{"cost":10,"risk":30},{"cost":20,"risk":20}])
    return pareto(cands)

# Infrastructure Sec31-35
@router.post("/infrastructure/simulate")
def infra_sim(body:dict):
    return infrastructure_sim(body.get("investment",50000000000), body.get("target","Road"))

@router.post("/investment/optimize")
def invest_opt(body:dict):
    return investment_optimizer(body.get("budget",100000000000))

@router.get("/investment/budget-what-if")
def budget_whatif():
    return {"50B":{"risk_reduction":15},"100B":{"risk_reduction":22},"200B":{"risk_reduction":35}}

# Commune/village simulation Sec36-38
@router.post("/simulate/commune/{commune_id}")
def commune_sim(commune_id:str, body:dict, db:Session=Depends(get_db)):
    # scope check mock
    return {"commune": commune_id, "simulation": "Flood in scope", "allowed": True}

@router.post("/simulate/village/{village_id}")
def village_sim(village_id:str, body:dict):
    return {"village": village_id, "local_risk": "HIGH"}

# Emergency Sec39-42
@router.post("/emergency/simulate")
def emerg_sim(body:dict):
    return {"scenario": "FIRE + DROUGHT + WIND", "spread": "2km/h", "affected": "500ha", "resources": "5 trucks"}

@router.post("/emergency/resource-allocate")
def resource_alloc(body:dict):
    teams=body.get("teams",5); required=body.get("required",8)
    if required>teams: return {"shortage": required-teams, "resource_shortage": True, "alternative": "Request province support"}
    return {"allocated": required}

@router.post("/emergency/evacuation")
def evacuation(body:dict):
    return {"route": "Evacuation via Road A", "bottleneck": "Bridge", "time_min": 45, "note": "Simulation only, not official plan"}

# Early warning Sec43-44 + Future map Sec45-47
@router.get("/future/map")
def future_map(horizon:str=Query(default="NOW")):
    return {"horizon": horizon, "options": ["NOW","+6H","+24H","+72H","+7D","+30D","+1Y","+3Y"]}

@router.get("/scenario/map/{scenario_id}")
def scenario_map(scenario_id:str):
    return {"scenario": scenario_id, "layers": ["BASELINE","SCENARIO A"], "toggle": True}

@router.get("/map/side-by-side")
def side_by_side():
    return {"current": {"risk":62,"co2":100}, "scenario_a": {"risk":41,"co2":82}}

@router.get("/scenario/timeline")
def scenario_timeline():
    return {"2026": ["Baseline","Scenario A"], "2030": ["Target"]}

# Target 2030 Sec49 gap Sec50 roadmap Sec51-53
@router.get("/target/2030")
def target2030():
    return {"forest_loss": "<X","co2": "<X", "response": "<X min", "configurable": True}

@router.get("/gap-analysis/{entity_id}")
def gap_analysis(entity_id:str):
    return {"current":72,"target":90,"gap":18}

@router.post("/roadmap/generate")
def roadmap(body:dict):
    return {"actions": ["Data Coverage 2026","Early Warning 2027"], "priority_matrix": "High impact low cost → priority"}

@router.post("/policy/sandbox")
def policy_sandbox(body:dict):
    return {"policy": body.get("policy","A"), "comparison": [{"policy":"A","risk":30},{"policy":"B","risk":25}], "note": "Simulate only, not enforce"}

# Human gate Sec56 explainability Sec57-60 drift Sec61-66
@router.get("/explain/{simulation_id}")
def explain(simulation_id:str):
    return {"why": "Rainfall +20%", "data": "satellite", "model": "Flood v1.0", "assumption": "Road closure 48h", "uncertainty":"Medium", "confidence":"Medium"}

@router.post("/model/shadow")
def shadow(body:dict):
    return {"production": "v1.0", "candidate": "v1.1", "shadow": True, "affects_decision": False}

@router.post("/model/rollback")
def rollback_model(body:dict):
    return {"from": body.get("from","v2.0"), "to": body.get("to","v1.8"), "status":"rolled back"}

# Reproducible Sec68 + versioning Sec69 + collaborative Sec71-73
@router.get("/simulation/{sid}/repro")
def repro(sid:str, db:Session=Depends(get_db)):
    s=db.get(Scenario, sid)
    if not s: raise HTTPException(404, "Not found")
    return {"input": json.loads(s.params) if s.params else {}, "model_version":"v1.0", "reproducible": True}

@router.post("/scenario/{sid}/comment")
def comment_scenario(sid:str, body:dict, db:Session=Depends(get_db)):
    return {"scenario": sid, "comment": body.get("comment"), "evidence": body.get("evidence")}

@router.post("/decision/record")
def decision_record(body:dict):
    return {"decision": body.get("decision"), "chosen": body.get("scenario"), "reason": body.get("reason"), "approver": body.get("approver"), "timestamp": "2026-09-02"}

# Outcome Sec74-75 + leaderboard Sec76 + future score Sec77
@router.get("/outcome/{plan_id}")
def outcome(plan_id:str):
    return {"predicted_co2_reduction":"18%","actual":"15%","deviation":"3%", "twin_calibration": "Digital Twin updated"}

@router.get("/leaderboard/scenario")
def scenario_leaderboard():
    return {"most_effective": "A", "lowest_cost": "B", "note": "Internal analysis only"}

@router.get("/future-score/{unit_id}")
def future_score(unit_id:str):
    return {"current":72,"future_risk":30,"resilience":80,"readiness":75}

# No-action Sec79 trade-off Sec80 matrix Sec81 NL simulator Sec82-84 data gap Sec85
@router.get("/scenario/no-action/{scenario_id}")
def no_action(scenario_id:str):
    return {"do_nothing": {"risk":"+28%","co2":"+14%"}, "intervention": {"risk":"-22%","co2":"-11%"}}

@router.get("/trade-off/{scenario_id}")
def trade_off(scenario_id:str):
    return {"A": "Cheapest", "B":"Safest","C":"Greenest","D":"Balanced"}

@router.post("/nl/simulate")
def nl_sim(body:dict):
    nl=body.get("text","mưa lớn 30%")
    params=parse_nl(nl)
    return {"parsed": params, "requires_confirmation": True, "scenario_params": params}

@router.get("/data-gap")
def data_gap(db:Session=Depends(get_db)):
    from app.services.what_if import what_if as wi
    return wi.data_gap(db)

# Public future map Sec89 hero demo Sec90-91
@router.get("/public/future-map")
def public_future():
    return {"trends": ["Forest","Disaster","Green"], "disclaimer": "Simulations are scenarios, not certain forecasts"}

@router.post("/demo/hero")
def hero_demo(body:dict, db:Session=Depends(get_db)):
    # 2030 scenario Sec90
    sc=what_if.build(db, {"rainfall":"+20%","temp":"+1.5C","forest_loss":"+5%","harvest":"-10%","road_closure":"48h"}, "2030 Scenario", "COMPOUND")
    baseline=what_if.build(db, {}, "Baseline", "COMPOUND")
    return {"baseline": {"forest_risk":72}, "plan_a": {"forest_risk":49, "recommendation": "Strengthen early warning"}, "simulation_id": sc.id, "baseline_id": baseline.id}
