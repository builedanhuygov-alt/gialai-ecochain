"""CarbonGuard — estimated carbon stock/change, no credit certification."""
from __future__ import annotations
import random, hashlib, json
from typing import Any, Dict, List
from sqlalchemy.orm import Session

MODEL_VERSION="v1.0"
DEFAULT_BIOMASS=150.0
DEFAULT_CARBON_FACTOR=0.47

def _seeded(uid:str, extra:str="")->random.Random:
    h=hashlib.sha256(f"{uid}:{extra}".encode()).hexdigest()
    return random.Random(int(h[:8],16))

class CarbonModel:
    def __init__(self, biomass_factor:float=DEFAULT_BIOMASS, carbon_factor:float=DEFAULT_CARBON_FACTOR, version:str=MODEL_VERSION):
        self.biomass_factor=biomass_factor; self.carbon_factor=carbon_factor; self.version=version
    def estimate(self, forest_area_ha:float, ndvi:float|None=None)->Dict[str,Any]:
        # stock = area * biomass * carbon_factor * vegetation factor
        veg_factor= (ndvi or 0.6) / 0.6
        stock= forest_area_ha * self.biomass_factor * self.carbon_factor * veg_factor
        return {"carbon_stock_t": round(stock,2), "forest_area_ha": forest_area_ha, "biomass_factor": self.biomass_factor, "carbon_factor": self.carbon_factor, "version": self.version}

class CarbonGuardAgent:
    model_version=MODEL_VERSION
    def analyze(self, administrative_unit_id:str, forest_area_ha:float|None=None, ndvi:float|None=None, ndvi_change:float|None=None, carbon_model:CarbonModel|None=None)->Dict[str,Any]:
        cm=carbon_model or CarbonModel()
        area=forest_area_ha or _seeded(administrative_unit_id,"area").uniform(500,5000)
        ndv= ndvi if ndvi is not None else _seeded(administrative_unit_id,"ndvi").uniform(0.4,0.8)
        est=cm.estimate(area, ndv)
        change_pct= round((ndvi_change or _seeded(administrative_unit_id,"chg").uniform(-0.1,0.05))/0.6*100,2) if ndvi_change is not None else round(_seeded(administrative_unit_id,"chg2").uniform(-5,2),2)
        conf= int(60 + abs(change_pct)*2)
        conf=min(90,max(50,conf))
        return {
            "agent":"CarbonGuard","administrative_unit_id":administrative_unit_id,
            "estimated_carbon_stock_t": est["carbon_stock_t"],
            "forest_area_ha": area,
            "potential_carbon_change_pct": change_pct,
            "carbon_estimate": est["carbon_stock_t"],
            "confidence": conf,
            "model_version": MODEL_VERSION,
            "data_sources":["satellite","vegetation"],
            "explanation": f"Estimated carbon stock {est['carbon_stock_t']:.1f}t; Potential carbon change {change_pct:+.1f}% — Carbon Monitoring Signal, not credit certification.",
            "data_quality": "MEDIUM",
            "source": "CarbonGuard"
        }
    def time_series(self, administrative_unit_id:str, periods:List[str])->List[Dict[str,Any]]:
        out=[]
        base_area=_seeded(administrative_unit_id,"ts_area").uniform(1000,4000)
        for p in periods:
            ndv=_seeded(administrative_unit_id,p).uniform(0.5,0.75)
            rec=self.analyze(administrative_unit_id, forest_area_ha=base_area, ndvi=ndv)
            rec["period"]=p
            out.append(rec)
        return out

carbon_guard=CarbonGuardAgent()
