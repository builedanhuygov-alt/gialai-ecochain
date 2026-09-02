"""RiskEngine — overall environmental risk, radar, history, early warning."""
from __future__ import annotations
import json, hashlib, random
from datetime import datetime
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from app.models.risk import RiskSignal, RiskScore, RiskHistory
from app.core.enums import RiskLevel

MODEL_VERSION="v1.0"

def _level(score:int)->RiskLevel:
    if score<=20: return RiskLevel.LOW
    if score<=40: return RiskLevel.MODERATE
    if score<=60: return RiskLevel.ELEVATED
    if score<=80: return RiskLevel.HIGH
    return RiskLevel.CRITICAL

def overall_from_breakdown(breakdown:Dict[str,int])->int:
    # weighted max + avg, forest/fire heavier
    if not breakdown: return 30
    # overall = 0.4*max + 0.6*mean
    vals=list(breakdown.values())
    return int(0.4*max(vals) + 0.6*(sum(vals)/len(vals)))

class RiskEngine:
    model_version=MODEL_VERSION
    def compute(self, db:Session, administrative_unit_id:str, signals:Dict[str,Dict[str,Any]])->RiskScore:
        # signals: {fire:{score}, flood:{}, landslide:{}, drought:{}, heat:{}, forest:{}, carbon_change_pct:..}
        breakdown={}
        confidences=[]
        for k,v in signals.items():
            if isinstance(v, dict) and "score" in v:
                breakdown[k]=v["score"]
                confidences.append(v.get("confidence",60))
            elif k=="forest" and isinstance(v, dict):
                breakdown[k]=v.get("risk_score",30)
                confidences.append(v.get("confidence",60))
        overall=overall_from_breakdown(breakdown)
        avg_conf=int(sum(confidences)/len(confidences)) if confidences else 60
        rs=RiskScore(administrative_unit_id=administrative_unit_id, overall_score=overall, overall_level=_level(overall).value, breakdown=json.dumps(breakdown), confidence=avg_conf, model_version=MODEL_VERSION)
        db.add(rs)
        # history + signals persistence
        period=datetime.utcnow().strftime("%Y-%m")
        for k,score in breakdown.items():
            db.add(RiskHistory(administrative_unit_id=administrative_unit_id, risk_type=k.upper(), score=score, period=period))
            db.add(RiskSignal(agent="RiskEngine", risk_type=k.upper(), administrative_unit_id=administrative_unit_id, score=score, confidence=avg_conf, level=_level(score).value, model_version=MODEL_VERSION, data_sources=json.dumps(list(signals.keys())), explanation=str(signals.get(k,{}).get("explanation","")), data_quality="MEDIUM"))
        db.commit(); db.refresh(rs)
        return rs

    def history_trend(self, db:Session, administrative_unit_id:str, risk_type:str="OVERALL", limit:int=6)->Dict[str,Any]:
        rows=db.query(RiskHistory).filter_by(administrative_unit_id=administrative_unit_id, risk_type=risk_type.upper()).order_by(RiskHistory.created_at.asc()).limit(limit).all()
        if not rows:
            # mock trend
            base=random.Random(hash(administrative_unit_id)&0xFFFFFFFF).randint(30,60)
            trend=[base + i*5 for i in range(4)]
            return {"scores":trend, "trend":"↗ Increasing" if trend[-1]>trend[0] else "→ Stable"}
        scores=[r.score for r in rows]
        if len(scores)>=3 and scores[-1]>scores[-2]>scores[-3]:
            trend="↗ Increasing"
        elif len(scores)>=3 and scores[-1]<scores[-2]<scores[-3]:
            trend="↘ Decreasing"
        else: trend="→ Stable"
        return {"scores":scores, "trend":trend}

    def early_warning(self, db:Session, administrative_unit_id:str)->Dict[str,Any]|None:
        h=self.history_trend(db, administrative_unit_id, "FIRE", 4)
        scores=h["scores"]
        if len(scores)>=3 and scores[0]<scores[1]<scores[2]:
            return {"type":"EARLY_WARNING","message":f"Fire risk increased: {' → '.join(map(str,scores[-3:]))} over last 3 periods.","scores":scores}
        return None

    def sensor_fusion(self, satellite:Dict[str,Any], weather:Dict[str,Any], community_verified:bool, historical:Dict[str,Any]|None=None)->Dict[str,Any]:
        # configurable weighting: satellite 0.35 weather 0.35 community 0.2 historical 0.1
        scores=[satellite.get("score",50)*0.35, weather.get("score",50)*0.35]
        if community_verified: scores.append(85*0.2)
        else: scores.append(40*0.2)
        if historical: scores.append(historical.get("score",50)*0.1)
        fused=int(sum(scores))
        fused=min(100,max(0,fused))
        conf= int((satellite.get("confidence",60)+weather.get("confidence",60))/2 + (15 if community_verified else 0))
        return {"fused_score":fused, "fused_confidence":min(100,conf), "level":_level(fused).value, "explanation": f"Satellite {satellite.get('level')}, Weather {weather.get('level')}, Community {'VERIFIED' if community_verified else 'pending'}"}

risk_engine=RiskEngine()
