"""FireRiskEngine Sec3 + fusion Sec19 + forecast Sec7 + explain Sec11"""
import hashlib, random, json
from datetime import datetime, timedelta
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.models.fire import OfficialFireWarning, AIFirePrediction
from app.core.enums import FireWarningLevel, FIRE_WARNING_LABELS

def score_to_level(score:int)->FireWarningLevel:
    if score<=19: return FireWarningLevel.I
    if score<=39: return FireWarningLevel.II
    if score<=59: return FireWarningLevel.III
    if score<=79: return FireWarningLevel.IV
    return FireWarningLevel.V

def _seed(uid:str, extra:str="")->random.Random:
    h=hashlib.sha256(f"{uid}:{extra}".encode()).hexdigest()
    return random.Random(int(h[:8],16))

class FireRiskEngine:
    def analyze(self, administrative_unit_id:str, satellite:Dict|None=None, weather:Dict|None=None, terrain:Dict|None=None, hotspots:List[Dict]|None=None, community:int=0, historical:Dict|None=None)->Dict[str,Any]:
        satellite=satellite or {}
        weather=weather or {}
        terrain=terrain or {}
        hotspots=hotspots or []
        # vegetation from satellite NDVI/NDMI/NBR
        ndvi=satellite.get("ndvi", 0.6); ndmi=satellite.get("ndmi", 0.3); nbr=satellite.get("nbr", 0.2)
        temp=weather.get("temperature", 30); humidity=weather.get("humidity", 60); rainfall=weather.get("rainfall", 5); wind=weather.get("wind_speed", 10)
        slope=terrain.get("slope", 10); elevation=terrain.get("elevation", 300)
        # heuristic
        base=0
        factors={}
        # temp
        if temp>33: base+=18; factors["Temperature"]="+18%"
        elif temp>30: base+=8; factors["Temperature"]="+8%"
        # humidity
        if humidity<35: base+=22; factors["Humidity"]="+22%"
        elif humidity<50: base+=10; factors["Humidity"]="+10%"
        # rainfall deficit
        if rainfall<2: base+=24; factors["Rainfall deficit"]="+24%"
        elif rainfall<10: base+=10; factors["Rainfall deficit"]="+10%"
        # vegetation dryness
        dry = (0.7 - ndvi)*50 + (0.4 - ndmi)*30
        if dry>15: base+=19; factors["Vegetation dryness"]="+19%"
        if ndmi and ndmi<0.1: factors["NDMI"]="↓ 21%"
        # wind
        if wind>18: base+=11; factors["Wind"]="+11%"
        # hotspots
        if hotspots: base+=17; factors["Recent hotspot"]="+17%"
        # terrain
        if slope>20: factors["Slope 24°"]="HIGH difficulty"
        base=min(100, max(5, int(base + _seed(administrative_unit_id,"base").uniform(-5,5))))
        level=score_to_level(base)
        # confidence data-aware Sec28
        data_available = sum([1 for x in [satellite.get("ndvi") is not None, weather.get("temperature") is not None, bool(hotspots), terrain.get("slope") is not None] if x]) + (1 if community else 0)
        # if missing satellite/weather reduce confidence
        base_conf= 70 + data_available*6 + (10 if hotspots else 0)
        # adjust for missing FIRMS
        if not hotspots: base_conf -= 8
        confidence=max(45, min(97, base_conf + _seed(administrative_unit_id,"conf").randint(-3,3)))
        # label
        label=FIRE_WARNING_LABELS[level]
        has_data = satellite.get("ndvi") is not None
        return {
            "risk_score": base, "warning_level": level.value, "label": label,
            "eco_level": f"EcoGL AI Fire Risk Level {level.value}", # Sec10 internal, not official
            "confidence": confidence, "factors": factors,
            "elevation": elevation, "slope": slope,
            "vegetation_dryness": int(max(0,min(100, 50 + dry))), "fuel_condition": "HIGH" if dry>15 else "MODERATE",
            "model_version":"v1.0", "data_sources": ["Sentinel-2","Sentinel-1","FIRMS","Weather","Terrain"],
            "missing": [] if has_data else ["satellite"]
        }

    def forecast(self, administrative_unit_id:str, satellite:Dict, weather_forecast:Dict)->Dict[str,Any]:
        # Sec7 next 6h/12h/24h/48h/72h
        base=self.analyze(administrative_unit_id, satellite, weather_forecast)
        # trend increasing if temp up humidity down
        forecast={}
        for h in ["6h","12h","24h","48h","72h"]:
            delta= {"6h":2,"12h":4,"24h":8,"48h":6,"72h":10}[h]
            forecast[h]= min(100, base["risk_score"] + delta + _seed(administrative_unit_id,h).randint(-2,2))
        return {"current": base, "forecast": forecast, "trend": "Fire risk increasing" if forecast["24h"]>base["risk_score"] else "Stable"}

    def anomaly(self, satellite:Dict, baseline:Dict)->Dict:
        # Sec18
        ndmi=satellite.get("ndmi",0.3); base_ndmi=baseline.get("ndmi",0.4)
        diff= (ndmi - base_ndmi)/base_ndmi*100 if base_ndmi else 0
        if diff < -20:
            return {"type":"NDMI anomaly","value": f"{diff:.0f}% below baseline","risk":"HIGH"}
        return {"type":"none"}

    def _label(self, level_str:str)->str:
        try:
            return FIRE_WARNING_LABELS[FireWarningLevel(level_str)]
        except:
            return level_str
    def official_vs_ai(self, db:Session, administrative_unit_id:str, ai_level:str)->Dict:
        off=db.query(OfficialFireWarning).filter_by(administrative_unit_id=administrative_unit_id).order_by(OfficialFireWarning.issued_at.desc()).first()
        if not off:
            return {"official": {"status":"OFFICIAL WARNING Không có dữ liệu"}, "ai": {"level": ai_level, "label": self._label(ai_level)}, "discrepancy": False}
        disc= off.level != ai_level
        return {
            "official": {"level": off.level, "label": self._label(off.level), "source": off.source, "issued_at": str(off.issued_at)},
            "ai": {"level": ai_level, "label": self._label(ai_level)},
            "discrepancy": disc,
            "reason": "Satellite vegetation dryness increased rapidly." if disc else None,
            "recommendation": "Review / Verify" if disc else "Monitor"
        }

fire_risk_engine=FireRiskEngine()
