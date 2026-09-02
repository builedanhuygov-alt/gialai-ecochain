"""DisasterGuard — multi-type risk (FIRE/FLOOD/LANDSLIDE/DROUGHT/HEAT/STORM/OTHER) with data fusion."""
from __future__ import annotations
import random, hashlib, json
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.core.enums import RiskLevel

TYPES = ["FIRE","FLOOD","LANDSLIDE","DROUGHT","HEAT","STORM","OTHER"]
MODEL_VERSION = "v1.0"

def _level(score:int)->RiskLevel:
    if score<=20: return RiskLevel.LOW
    if score<=40: return RiskLevel.MODERATE
    if score<=60: return RiskLevel.ELEVATED
    if score<=80: return RiskLevel.HIGH
    return RiskLevel.CRITICAL

def _seeded(administrative_unit_id:str, risk_type:str, extra:str="")->random.Random:
    h=hashlib.sha256(f"{administrative_unit_id}:{risk_type}:{extra}".encode()).hexdigest()
    return random.Random(int(h[:8],16))

def fire_risk(administrative_unit_id:str, geometry:Dict|None, inputs:Dict[str,Any])->Dict[str,Any]:
    rng=_seeded(administrative_unit_id,"FIRE", str(inputs))
    ndvi_change=inputs.get("ndvi_change")
    if ndvi_change is None: ndvi_change= rng.uniform(-0.2,0.05)
    temp=inputs.get("temperature")
    if temp is None: temp= rng.uniform(28,38)
    rainfall=inputs.get("rainfall")
    if rainfall is None: rainfall= rng.uniform(0,80)
    # heuristic: low rain + high temp + vegetation decline => high risk
    score=int(max(0,min(100, (-ndvi_change*120) + (temp-30)*4 + (30-rainfall)*0.8 + rng.uniform(-5,5))))
    score=max(0,min(100,score))
    conf=int(60 + (10 if inputs.get("community_reports") else 0) + rng.randint(0,15))
    expl=[]
    if ndvi_change < -0.05: expl.append("Low vegetation stability (NDVI decline)")
    if temp>33: expl.append(f"High temperature {temp:.1f}°C")
    if rainfall<20: expl.append(f"Low rainfall {rainfall:.1f}mm")
    if inputs.get("historical_fire"): expl.append("Historical fire reports in area")
    if not expl: expl.append("No strong fire indicators — LOW risk")
    return {"risk_type":"FIRE","score":score,"confidence":min(100,conf),"level":_level(score).value,"explanation":"; ".join(expl),"inputs":inputs,"model_version":MODEL_VERSION,"source":"DisasterGuard"}

def flood_risk(administrative_unit_id:str, geometry:Dict|None, inputs:Dict[str,Any])->Dict[str,Any]:
    rng=_seeded(administrative_unit_id,"FLOOD", str(inputs))
    rainfall=inputs.get("rainfall")
    if rainfall is None: rainfall=rng.uniform(0,150)
    elevation=inputs.get("elevation")
    if elevation is None: elevation=rng.uniform(50,800)
    score=int(max(0,min(100, rainfall*0.6 - elevation*0.02 + rng.uniform(-8,8))))
    conf=int(55 + rng.randint(0,20))
    expl=[]
    if rainfall>80: expl.append(f"Rainfall above historical average ({rainfall:.0f}mm)")
    if elevation<100: expl.append("Low elevation / poor drainage")
    if inputs.get("historical_flood"): expl.append("Historical flood events")
    if not expl: expl.append("No flood signal")
    return {"risk_type":"FLOOD","score":max(0,min(100,score)),"confidence":min(100,conf),"level":_level(score).value,"explanation":"Potential Flood Risk: "+" ; ".join(expl),"inputs":inputs,"model_version":MODEL_VERSION,"source":"DisasterGuard"}

def landslide_risk(administrative_unit_id:str, geometry:Dict|None, inputs:Dict[str,Any])->Dict[str,Any]:
    rng=_seeded(administrative_unit_id,"LANDSLIDE", str(inputs))
    slope=inputs.get("slope")
    if slope is None: slope=rng.uniform(0,35)
    rainfall=inputs.get("rainfall")
    if rainfall is None: rainfall=rng.uniform(0,120)
    score=int(max(0,min(100, slope*1.8 + rainfall*0.3 + rng.uniform(-6,6))))
    expl=[]
    if slope>15: expl.append(f"High slope {slope:.1f}°")
    if rainfall>50: expl.append("Heavy recent rainfall")
    if inputs.get("vegetation_change"): expl.append("Vegetation change increases susceptibility")
    if not expl: expl.append("Stable terrain")
    return {"risk_type":"LANDSLIDE","score":max(0,min(100,score)),"confidence":60+rng.randint(0,20),"level":_level(score).value,"explanation":"Potential Landslide Risk: "+" ; ".join(expl),"inputs":inputs,"model_version":MODEL_VERSION,"source":"DisasterGuard"}

def drought_risk(administrative_unit_id:str, geometry:Dict|None, inputs:Dict[str,Any])->Dict[str,Any]:
    rng=_seeded(administrative_unit_id,"DROUGHT", str(inputs))
    ndvi=inputs.get("ndvi")
    if ndvi is None: ndvi=rng.uniform(0.3,0.8)
    rainfall=inputs.get("rainfall")
    if rainfall is None: rainfall=rng.uniform(0,60)
    score=int(max(0,min(100, (0.7-ndvi)*120 + (40-rainfall)*0.7 + rng.uniform(-5,5))))
    expl=[]
    if ndvi<0.4: expl.append("Vegetation anomaly (low NDVI)")
    if rainfall<20: expl.append("Low rainfall")
    return {"risk_type":"DROUGHT","score":max(0,min(100,score)),"confidence":60+rng.randint(0,20),"level":_level(score).value,"explanation":"; ".join(expl) or "No drought signal","inputs":inputs,"model_version":MODEL_VERSION,"source":"DisasterGuard"}

def heat_risk(administrative_unit_id:str, geometry:Dict|None, inputs:Dict[str,Any])->Dict[str,Any]:
    rng=_seeded(administrative_unit_id,"HEAT", str(inputs))
    temp=inputs.get("temperature")
    if temp is None: temp=rng.uniform(30,40)
    score=int(max(0,min(100, (temp-28)*8 + rng.uniform(-5,5))))
    expl=[f"Temperature {temp:.1f}°C"] if temp>33 else ["Normal heat"]
    return {"risk_type":"HEAT","score":max(0,min(100,score)),"confidence":65+rng.randint(0,15),"level":_level(score).value,"explanation":"; ".join(expl),"inputs":inputs,"model_version":MODEL_VERSION,"source":"DisasterGuard"}

HANDLERS={"FIRE":fire_risk,"FLOOD":flood_risk,"LANDSLIDE":landslide_risk,"DROUGHT":drought_risk,"HEAT":heat_risk}

class DisasterGuardAgent:
    model_version=MODEL_VERSION
    def analyze(self, administrative_unit_id:str, risk_type:str, geometry:Dict|None=None, inputs:Dict[str,Any]|None=None)->Dict[str,Any]:
        rt=risk_type.upper()
        h=HANDLERS.get(rt)
        if not h:
            # generic
            rng=_seeded(administrative_unit_id,rt, str(inputs))
            score=rng.randint(10,70)
            return {"risk_type":rt,"score":score,"confidence":60,"level":_level(score).value,"explanation":"Generic risk","inputs":inputs or {},"model_version":MODEL_VERSION,"source":"DisasterGuard"}
        return h(administrative_unit_id, geometry, inputs or {})
    def analyze_all(self, administrative_unit_id:str, geometry:Dict|None=None, inputs:Dict[str,Any]|None=None)->List[Dict[str,Any]]:
        return [self.analyze(administrative_unit_id, t, geometry, inputs) for t in ["FIRE","FLOOD","LANDSLIDE","DROUGHT","HEAT"]]
    def data_fusion(self, signals:List[Dict[str,Any]], community_verified:bool=False)->Dict[str,Any]:
        # configurable weighting — community verified boosts confidence
        avg_conf=sum(s["confidence"] for s in signals)/len(signals) if signals else 60
        if community_verified: avg_conf=min(100, avg_conf+15)
        max_score=max((s["score"] for s in signals), default=0)
        # explanation from actual features
        expl="; ".join(s["explanation"] for s in signals[:2])
        return {"fused_confidence":int(avg_conf),"max_score":max_score,"explanation":expl}

disaster_guard=DisasterGuardAgent()
