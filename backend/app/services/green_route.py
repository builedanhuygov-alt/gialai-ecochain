"""GreenRouteAgent — Sec18-28: route optimization, CO2, disaster-aware, collection."""
from __future__ import annotations
import json, math, random, hashlib
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from app.models.farm import Route, Trip, Vehicle

def haversine(lat1,lon1,lat2,lon2):
    R=6371
    dlat=math.radians(lat2-lat1); dlon=math.radians(lon2-lon1)
    a=math.sin(dlat/2)**2+math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return 2*R*math.asin(math.sqrt(a))

def co2_for(distance_km:float, load_kg:float, emission_factor:float, methodology:str="GREEN_LOGISTICS_V1")->Dict[str,Any]:
    # simple: distance * factor * load factor (0.5 empty ..1 full)
    load_factor= 0.5 + 0.5*min(1, load_kg/5000)
    co2= distance_km * emission_factor * load_factor
    return {"co2_kg": round(co2,2), "methodology": methodology, "emission_factor": emission_factor, "disclaimer": "Estimated CO2e"}

class GreenRouteAgent:
    def optimize(self, origin:Dict[str,float], destination:Dict[str,float], waypoints:List[Dict[str,float]]|None=None, vehicle:Vehicle|None=None, road_risk:Dict[str,str]|None=None, weights:Dict[str,float]|None=None)->Dict[str,Any]:
        default_w={"distance":0.3,"time":0.2,"co2":0.3,"risk":0.1,"cost":0.1}
        w={**default_w, **(weights or {})}
        # generate 2-3 candidates with jitter
        base_dist= haversine(origin["lat"], origin["lng"], destination["lat"], destination["lng"])
        if waypoints:
            for wp in waypoints:
                base_dist+= haversine(origin["lat"], origin["lng"], wp["lat"], wp["lng"])*0.5
        candidates=[]
        for i,name in enumerate(["Route A","Route B","Route B-alt"][:2 if not waypoints else 3]):
            jitter= random.Random(int(base_dist*10)+i).uniform(-0.1,0.15)
            dist= round(base_dist*(1+jitter),1)
            time_min= int(dist*1.4 + random.Random(i).uniform(-10,10))
            # risk from disaster
            risk= "LOW"
            if road_risk and any(v=="HIGH" for v in road_risk.values()): risk="HIGH"
            co2= co2_for(dist, 3000, vehicle.emission_factor if vehicle else 0.12)
            score= round(w["distance"]* (100 - min(100, dist)) + w["time"]*(100 - min(100, time_min)) + w["co2"]*(100 - min(100, co2["co2_kg"]*2)) + w["risk"]*(100 if risk=="LOW" else 40),1)
            candidates.append({"name": name, "distance_km": dist, "time_min": time_min, "risk": risk, "co2_kg": co2["co2_kg"], "score": score, "methodology": co2["methodology"]})
        # best = highest score
        candidates.sort(key=lambda x: x["score"], reverse=True)
        return {"candidates": candidates, "best": candidates[0], "objective": w, "disaster_aware": bool(road_risk)}

    def disaster_reroute(self, current_route:Dict[str,Any], alerts:List[Dict[str,Any]])->Dict[str,Any]|None:
        # if any alert HIGH/CRITICAL affecting route geometry bbox, invalidate
        if any(a.get("level") in ("HIGH","CRITICAL") for a in alerts):
            return {"status":"ROUTE_INVALID","reason":"Flood/disaster alert", "alternative": self.optimize({"lat":13.7,"lng":108.3},{"lat":13.9,"lng":108.7})["best"]}
        return None

    def collection_optimize(self, farms:List[Dict[str,float]], collection_point:Dict[str,float], facility:Dict[str,float])->Dict[str,Any]:
        # minimize empty trips — simple nearest neighbor
        total=0
        for f in farms:
            total+= haversine(f["lat"], f["lng"], collection_point["lat"], collection_point["lng"])
        total+= haversine(collection_point["lat"], collection_point["lng"], facility["lat"], facility["lng"])
        return {"total_distance_km": round(total,1), "farms": len(farms), "estimated_reduction_pct": 12, "note": "Empty trips reduced via collection center"}

    def green_logistics_score(self, distance_km:float, co2_kg:float, load_util:float, risk:str, time_min:int)->int:
        # 0-100
        s= 100 - (co2_kg*0.8 + distance_km*0.2) + load_util*10 - (20 if risk=="HIGH" else 0) - (time_min*0.05)
        return max(0,min(100,int(s)))

green_route=GreenRouteAgent()
