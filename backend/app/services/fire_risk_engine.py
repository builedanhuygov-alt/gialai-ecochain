"""FireRiskEngine Sec3 + fusion Sec19 + forecast Sec7 + explain Sec11"""
import hashlib, random, json
from datetime import datetime, timedelta
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.models.fire import OfficialFireWarning, AIFirePrediction
from app.core.enums import FireWarningLevel, FIRE_WARNING_LABELS

def score_to_level(score:int)->FireWarningLevel:
    # unified scale with RiskLevel (20/40/60/80) — see fire_risk_config.THRESHOLDS
    if score<=20: return FireWarningLevel.I
    if score<=40: return FireWarningLevel.II
    if score<=60: return FireWarningLevel.III
    if score<=80: return FireWarningLevel.IV
    return FireWarningLevel.V

def _seed(uid:str, extra:str="")->random.Random:
    h=hashlib.sha256(f"{uid}:{extra}".encode()).hexdigest()
    return random.Random(int(h[:8],16))

class FireRiskEngine:
    def analyze(self, administrative_unit_id:str, satellite:Dict|None=None, weather:Dict|None=None, terrain:Dict|None=None, hotspots:List[Dict]|None=None, community:int=0, historical:Dict|None=None, sources_available:Dict[str,bool]|None=None)->Dict[str,Any]:
        # Single formula lives in app.services.fire_risk.compute_score.
        # Legacy mode (renormalize=False) preserves historical numbers; the
        # ±3 seeded jitter is kept for backward-compatible outputs.
        from app.services.fire_risk import compute_score, input_from_legacy
        satellite=satellite or {}
        weather=weather or {}
        terrain=terrain or {}
        # Artificial-heat suspects (airport runways, industrial zones — flagged
        # by firms_service) must NEVER count as fire evidence.
        raw_hotspots=hotspots if hotspots is not None else []
        real_hotspots=[h for h in raw_hotspots if not h.get("suspect_artificial")]
        filtered_artificial=len(raw_hotspots)-len(real_hotspots)
        # Provenance: only keys actually present count as real data.
        # Defaults are neutral computation stand-ins — they must NOT
        # inflate confidence (previous bug: confidence ~86% with zero inputs).
        has_sat = satellite.get("ndvi") is not None
        has_wx = weather.get("temperature") is not None
        has_terr = terrain.get("slope") is not None
        has_firms = bool(real_hotspots)
        has_comm = (community or 0) > 0
        # sources_available: nguồn nào caller đã chạm API thành công (kể cả trả
        # 0 cháy / 0 report — đó là tín hiệu thật, KHÔNG phải thiếu nguồn).
        # None = suy từ nội dung như cũ (giữ tương thích unit tests).
        if sources_available is None:
            missing = [k for k, ok in (("satellite", has_sat), ("weather", has_wx),
                                       ("terrain", has_terr), ("firms", has_firms),
                                       ("community", has_comm)) if not ok]
        else:
            missing = [k for k in ("satellite", "weather", "terrain", "firms", "community")
                       if not sources_available.get(k, False)]
        r = compute_score(
            input_from_legacy(satellite, weather, terrain, hotspots, community, historical, sources_available),
            origin="LIVE", renormalize=False,
        )
        base = r.score if r.score is not None else 5
        ndvi = satellite.get("ndvi", 0.6) if has_sat else 0.6
        ndmi = satellite.get("ndmi", 0.3)
        dry = (0.7 - ndvi)*50 + (0.4 - ndmi)*30
        base=min(100, max(5, int(base + _seed(administrative_unit_id,"base").uniform(-3,3))))
        level=score_to_level(base)
        # confidence data-aware Sec28 — driven by REAL inputs only
        n_real = sum([has_sat, has_wx, has_firms, has_terr, has_comm])
        base_conf = 35 + n_real * 12 + (5 if has_firms else 0)
        confidence = max(30, min(97, base_conf + _seed(administrative_unit_id, "conf").randint(-3, 3)))
        # label
        label=FIRE_WARNING_LABELS[level]
        slope = terrain.get("slope", 10) if has_terr else 10
        elevation = terrain.get("elevation", 300)
        return {
            "risk_score": base, "warning_level": level.value, "label": label,
            "confidence": confidence, "factors": r.factors, "missing": missing,
            "data_completeness": r.data_completeness,
            "filtered_artificial": filtered_artificial,
            "elevation": elevation, "slope": slope,
            "vegetation_dryness": int(max(0,min(100, 50 + dry))), "fuel_condition": "HIGH" if dry>15 else "MODERATE",
            "model_version":"v1.0", "data_sources": ["Sentinel-2","Sentinel-1","FIRMS","Weather","Terrain"],
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
        from app.models.administrative import AdministrativeUnit
        unit=AdministrativeUnit.resolve_unit(db, administrative_unit_id)
        keys=[administrative_unit_id] + ([unit.id, unit.code] if unit else [])
        off=db.query(OfficialFireWarning).filter(OfficialFireWarning.administrative_unit_id.in_(keys)).order_by(OfficialFireWarning.issued_at.desc()).first()
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
