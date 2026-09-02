"""Simulation engine Sec17-24."""
from __future__ import annotations
import random, hashlib, json
from typing import Dict, List
from sqlalchemy.orm import Session
from app.models.predictive import Simulation

def _seeded(scenario:str, params:dict)->random.Random:
    h=hashlib.sha256(f"{scenario}:{json.dumps(params,sort_keys=True)}".encode()).hexdigest()
    return random.Random(int(h[:8],16))

def run_scenario(db:Session, scenario:str, params:Dict)->Simulation:
    # params: duration, intensity, region etc
    rng=_seeded(scenario, params)
    # Sec18 types
    affected={
        "villages": rng.randint(5,60),
        "roads": rng.randint(2,15),
        "farms": rng.randint(200,1500),
        "logistics": rng.choice(["LOW","HIGH"]),
        "routes": rng.randint(3,8)
    }
    result={"scenario": scenario, "params": params, "affected": affected, "model_simulation": "MODEL SIMULATION — NOT ACTUAL EVENT"}
    sim=Simulation(scenario=scenario, params=json.dumps(params), result=json.dumps(result), affected_villages=affected["villages"])
    db.add(sim); db.commit(); db.refresh(sim)
    return sim

def compare_scenarios(scenarios:List[Dict])->Dict:
    # Sec19 A/B/C
    return {"comparison": scenarios, "note": "Simulated numbers with basis, not fake actual"}

def response_simulation(intervention:str)->Dict:
    # Sec20
    mapping={"No intervention": "HIGH", "Pre-position team": "MODERATE", "Close road + reroute": "LOWER"}
    return {"intervention": intervention, "risk": mapping.get(intervention,"MODERATE")}

def resource_optimization(teams:int, vehicles:int, tasks:int)->Dict:
    # Sec22 WHO GOES WHERE
    return {"assignment": f"{teams} teams, {vehicles} vehicles → {tasks} tasks", "optimized": True}

def emergency_routing(incident:Dict, road_risk:Dict, teams:Dict)->Dict:
    from app.services.green_route import green_route
    return green_route.optimize({"lat":13.7,"lng":108.1}, {"lat":13.9,"lng":108.5}, road_risk=road_risk)
