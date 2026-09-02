"""WhatIfEngine Sec4 + ScenarioBuilder Sec5-7 + ScenarioAgent Sec11."""
import json, hashlib, random
from datetime import datetime
from typing import Dict, List
from sqlalchemy.orm import Session
from app.models.twin import Scenario, ScenarioScore

SCENARIO_TYPES=["CLIMATE","DISASTER","FOREST","AGRICULTURE","CARBON","LOGISTICS","EUDR","INFRASTRUCTURE","ECONOMIC","COMPOUND"]

def parse_nl(nl:str)->Dict:
    # Sec82
    p={}
    if "mưa lớn" in nl: p["rainfall"]="+30%"
    if "quốc lộ" in nl and "48 giờ" in nl: p["road_closure"]="48h"
    if "cà phê" in nl and "giảm 10%" in nl: p["crop_yield"]="-10%"
    if "500 ha rừng" in nl: p["forest_loss"]="500ha"
    return p

class WhatIfEngine:
    def build(self, db:Session, params:Dict, name:str="Scenario", type:str="COMPOUND", baseline_id:str|None=None)->Scenario:
        if type not in SCENARIO_TYPES: type="COMPOUND"
        sc=Scenario(name=name, type=type, params=json.dumps(params), baseline_id=baseline_id)
        db.add(sc); db.flush()
        # score Sec9
        rng=random.Random(int(hashlib.sha256(json.dumps(params).encode()).hexdigest()[:8],16))
        score=ScenarioScore(scenario_id=sc.id, risk=rng.randint(30,80), cost=rng.randint(20,70), co2=rng.randint(20,80), forest=rng.randint(40,90), agriculture=rng.randint(40,85), logistics=rng.randint(30,75), resilience=rng.randint(40,85), eudr=rng.randint(50,90), community=rng.randint(50,80))
        db.add(score); db.commit(); db.refresh(sc)
        return sc
    def compare(self, db:Session, ids:List[str])->Dict:
        scores=db.query(ScenarioScore).filter(ScenarioScore.scenario_id.in_(ids)).all()
        return {"scenarios": [{"id": s.scenario_id, "risk": s.risk, "co2": s.co2, "forest": s.forest} for s in scores], "baseline": ids[0] if ids else None}
    def cascade(self, scenario:str)->Dict:
        # Sec13-16
        return {"cascade": ["EXTREME RAIN","FLOOD","ROAD CLOSURE","LOGISTICS DELAY","HARVEST DELAY","CROP LOSS","CO2 INCREASE"], "temporal": {"T+0":"Event","T+6h":"First impact","T+24h":"Road disruption","T+48h":"Agriculture","T+72h":"Supply chain"}, "spatial": {"starts":"Mountain","affected":"3 communes","spreads":"Downstream","next_risk":"Flood"}}
    def data_gap(self, db:Session)->List[Dict]:
        from app.models.twin import DataGap
        gaps=db.query(DataGap).limit(5).all()
        if not gaps:
            db.add(DataGap(gap_type="missing", description="Need more satellite data", priority="HIGH")); db.commit()
            gaps=db.query(DataGap).limit(5).all()
        return [{"gap": g.gap_type, "desc": g.description} for g in gaps]

class ScenarioAgent:
    def generate(self, goal:str)->List[str]: return ["BASELINE","MODERATE","SEVERE","EXTREME"]
    def simulate(self, db:Session, scenario_id:str)->Dict:
        # call multi-agent Sec12
        return {"forest": "ForestAgent simulated", "disaster": "DisasterAgent simulated", "logistics": "LogisticsAgent simulated"}

what_if=WhatIfEngine()
scenario_agent=ScenarioAgent()
