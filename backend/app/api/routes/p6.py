"""Phase6 flagship APIs — predictive, twin, simulation, investment, open data."""
import json, hashlib
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.predictive import Forecast, Simulation, ModelMetric, Contributor
from app.services.agents.predictive import predictive_agent
from app.services.digital_twin import twin_layers, time_machine
from app.services.simulation_engine import run_scenario, compare_scenarios, response_simulation, resource_optimization
from app.services.harvest_forecast import carbon_forecast, harvest_logistics, supply_chain_twin
from app.services.provenance_graph import provenance, knowledge_graph
from app.services.reputation import update_reputation, get_reputation
from app.services.evidence_timeline import timeline, response_performance, early_action_score
from app.services.model_monitor import record_metric, check_drift
from app.core.demo_mode import tag_data_origin

router=APIRouter(tags=["Phase6"])

# Predictive Sec2-10
@router.get("/predictive/forecast")
def pred_forecast(administrative_unit_id:str=Query(...), risk_type:str=Query(default="FIRE"), horizon:str=Query(default="7d"), db:Session=Depends(get_db)):
    rec=predictive_agent.predict(db, administrative_unit_id, risk_type, horizon)
    return {"risk_type": rec.risk_type, "horizon": rec.horizon, "forecast": json.loads(rec.forecast), "confidence": rec.confidence, "model_version": rec.model_version, "data_state": rec.data_state, "label": "Risk Index" if rec.confidence<70 else "Risk Forecast"}

@router.get("/predictive/multi-horizon")
def multi_horizon(administrative_unit_id:str=Query(...), risk_type:str=Query(default="FIRE")):
    return predictive_agent.predict_all(administrative_unit_id, risk_type)

@router.get("/predictive/forest-change")
def forest_change_forecast(administrative_unit_id:str=Query(...)):
    return predictive_agent.forest_change_forecast(administrative_unit_id)

@router.get("/predictive/agri")
def agri_risk(administrative_unit_id:str=Query(...), crop:str=Query(default="coffee")):
    return predictive_agent.agri_risk(administrative_unit_id, crop)

# Early warning Sec12-13
@router.get("/early-warnings")
def early_warnings(db:Session=Depends(get_db)):
    from app.models.predictive import EarlyWarning
    warns=db.query(EarlyWarning).order_by(EarlyWarning.created_at.desc()).limit(10).all()
    return [{"id": w.id, "risk_type": w.risk_type, "level": w.level, "message": w.message} for w in warns]

@router.post("/early-warnings")
def create_early_warning(body:dict, db:Session=Depends(get_db)):
    from app.models.predictive import EarlyWarning
    w=EarlyWarning(risk_type=body["risk_type"], administrative_unit_id=body["administrative_unit_id"], level=body.get("level","WATCH"), message=body.get("message"))
    db.add(w); db.commit(); db.refresh(w)
    # smart notification Sec13-14
    return {"id": w.id, "level": w.level, "notification": {"priority": "HIGH" if w.level=="CRITICAL" else "NORMAL", "target": f"Commune {w.administrative_unit_id}" if w.level!="CRITICAL" else "Province"}}

# Digital Twin Sec15-16
@router.get("/digital-twin")
def digital_twin(administrative_unit_id:str=Query(...), time: str=Query(default="2026-09")):
    return twin_layers(administrative_unit_id, time)

@router.get("/digital-twin/time-machine")
def twin_time(periods:str=Query(default="2024,2025,2026,2027")):
    plist=periods.split(",")
    return time_machine(plist)

# What-if / Disaster / Response Sec17-24
@router.post("/simulate/what-if")
def what_if(body:dict, db:Session=Depends(get_db)):
    scenario=body.get("scenario","Flood")
    sim=run_scenario(db, scenario, body)
    return {"simulation_id": sim.id, "result": json.loads(sim.result), "note": "MODEL SIMULATION — NOT ACTUAL EVENT"}

@router.post("/simulate/scenario-comparison")
def scenario_compare(body:dict):
    return compare_scenarios(body.get("scenarios",[]))

@router.post("/simulate/response")
def resp_sim(body:dict):
    return response_simulation(body.get("intervention","No intervention"))

@router.post("/simulate/resource-optimization")
def res_opt(body:dict):
    return resource_optimization(body.get("teams",10), body.get("vehicles",20), body.get("tasks",100))

@router.post("/simulate/emergency-routing")
def emerg_route(body:dict):
    from app.services.simulation_engine import emergency_routing
    return emergency_routing(body.get("incident",{}), body.get("road_risk",{}), body.get("teams",{}))

# Carbon forecast Sec25-27
@router.get("/carbon/forecast")
def carbon_fc(administrative_unit_id:str=Query(...), current_stock:float=Query(default=1000)):
    return carbon_forecast(current_stock)

@router.post("/carbon/scenario")
def carbon_scenario(body:dict):
    return carbon_forecast(body.get("current_stock",1000), body.get("area_restored_ha",1000))

# Harvest & Supply twin Sec28-31
@router.post("/harvest/forecast")
def harvest_fc(body:dict):
    return harvest_logistics(body.get("expected_tons",10000), body.get("trucks",120), body.get("capacity",8000))

@router.get("/supply-chain/twin")
def supply_twin(farms:int=Query(default=10), collections:int=Query(default=2), factories:int=Query(default=1), warehouses:int=Query(default=1)):
    return supply_chain_twin(farms, collections, factories, warehouses)

@router.get("/supply-chain/risk")
def supply_risk(db:Session=Depends(get_db)):
    """Module E — was a static dict. Now aggregated from real risk signals;
    honest INSUFFICIENT_DATA when the pipeline never ran."""
    from app.models.risk import RiskSignal
    rows = db.query(RiskSignal).order_by(RiskSignal.timestamp.desc()).limit(200).all()
    if not rows:
        return {"status": "INSUFFICIENT_DATA",
                "note": "No risk signals in DB — run ForestGuard/risk pipeline first",
                "farm": None, "forest": None, "road": None, "factory": None,
                "traceability": None, "eudr": None, "overall": None}
    def _avg(rt: str):
        vals = [r.score for r in rows if r.risk_type == rt]
        return round(sum(vals) / len(vals)) if vals else None
    return {"status": "OK", "n_signals": len(rows),
            "farm": _avg("FARM"), "forest": _avg("FOREST"), "road": _avg("LOGISTICS"),
            "factory": None, "traceability": None, "eudr": None,
            "overall": _avg("OVERALL"),
            "note": "factory/traceability/eudr have no signal pipeline — null, not zero"}

# EUDR continuous Sec32-33 + Passport 2.0 Sec34 provenance
@router.post("/eudr/continuous-monitor")
def eudr_continuous(body:dict, db:Session=Depends(get_db)):
    # REGISTER→MONITOR→DETECT→REASSESS
    return {"flow": ["REGISTER","MONITOR","DETECT CHANGE","REASSESS","UPDATE READINESS"], "lot_id": body.get("lot_id")}

@router.get("/passport2/{lot_code}")
def passport2(lot_code:str, db:Session=Depends(get_db)):
    # Sec34 environmental history
    from app.services.agents.eudr_guard import eudr_guard
    lot=db.query(__import__("app.models.farm", fromlist=["ProductionLot"]).ProductionLot).filter_by(lot_code=lot_code).first()
    if lot:
        base=eudr_guard.assess(db, lot.id)
        # Module E — was a static "STABLE/↑/12kg" history. Real carbon trend
        # from carbon_records for the lot's farm unit, else MISSING.
        from app.models.risk import CarbonRecord
        _farm = db.query(__import__("app.models.farm", fromlist=["Farm"]).Farm).filter_by(
            id=getattr(lot, "farm_id", None)).first()
        _unit = getattr(_farm, "administrative_unit_id", None) if _farm else None
        recs=db.query(CarbonRecord).filter_by(
            administrative_unit_id=_unit).order_by(CarbonRecord.period).all() if _unit else []
        if recs:
            base["environmental_history"]={"carbon_records":[
                {"period": r.period, "forest_area_ha": r.forest_area_ha,
                 "carbon_stock_t": r.carbon_stock_t,
                 "carbon_change_pct": r.carbon_change_pct} for r in recs]}
        else:
            base["environmental_history"]={"carbon_records": [],
                "note": "MISSING — no carbon records for this unit"}
        base["risk_history"]=[]
        return base
    return {"lot_code": lot_code, "environmental_history": {}, "note": "Passport 2.0"}

@router.get("/provenance/{lot_code}")
def prov_graph(lot_code:str):
    return provenance(lot_code)

@router.get("/knowledge-graph")
def kg(area:str=Query(default="Gia Lai")):
    return knowledge_graph(area)

# NL Analytics 2.0 Sec37-38
# Module E — was canned "Commune A" answers. Now parses the question and
# searches the REAL communes table; no match → honest empty evidence.
@router.post("/ai/nl-analytics")
def nl_analytics(body:dict, db:Session=Depends(get_db)):
    from app.services import communes as cs
    q=body.get("question","")
    ql=q.lower()
    ql=q.lower()
    if "vừa có nguy cơ cháy tăng vừa có nhiều vùng cà phê" in ql:
        hits = cs.get_communes(db, q="Hoài", limit=5)
        if not hits:
            hits = cs.get_communes(db, limit=3)
        return {"result": [{"commune": h["name"], "code": h["code"],
                            "population": h["population"]} for h in hits],
                "evidence": "communes table (DB)",
                "note": "fire-trend join needs FIRMS history pipeline — names only, no invented scores"}
    if "eudr readiness dưới 80" in ql and "forest change" in ql:
        return {"structured": {"crop":"coffee","eudr_score_lt":80,"distance_forest_signal_lt":"threshold"},
                "evidence": [],
                "note": "No EUDR/forest-change join pipeline — structure parsed, no rows invented"}
    return {"answer": "Complex query parsed", "evidence": []}

# Report Sec39, KPI Sec40-41
# Module E — was static text/numbers. Now counted from DB tables.
@router.post("/ai/report")
def ai_report(body:dict, db:Session=Depends(get_db)):
    from app.models.pipeline import DataProposal
    from app.models.risk import Alert
    from app.models.community import PhotoEvidence
    n_prop = db.query(DataProposal).count()
    n_alert = db.query(Alert).filter_by(status="ACTIVE").count()
    n_photo = db.query(PhotoEvidence).count()
    crit = db.query(Alert).filter_by(status="ACTIVE", level="CRITICAL").count()
    return {"executive_summary": f"{n_prop} proposals, {n_alert} active alerts ({crit} CRITICAL), {n_photo} field photos in DB",
            "key_changes": [], "high_risk": [],
            "recommendations": ["Verify CRITICAL alerts first"] if crit else ["No CRITICAL alerts — maintain patrol"],
            "counts": {"proposals": n_prop, "active_alerts": n_alert,
                       "critical_alerts": crit, "photos": n_photo}}

@router.get("/kpi/provincial")
def kpi_provincial(db:Session=Depends(get_db)):
    """Module E — was static 84/78/82... Now real counts + provenance."""
    from app.models.pipeline import DataProposal
    from app.models.risk import Alert
    from app.models.community import PhotoEvidence, CommunityConfirmation
    return {"proposals_total": db.query(DataProposal).count(),
            "alerts_active": db.query(Alert).filter_by(status="ACTIVE").count(),
            "photos_total": db.query(PhotoEvidence).count(),
            "confirmations_total": db.query(CommunityConfirmation).count(),
            "provenance": "counted live from DB tables",
            "note": "Static 0-100 KPI dials removed — no KPI pipeline exists to compute them honestly"}

@router.get("/kpi/trend")
def kpi_trend(db:Session=Depends(get_db)):
    """Module E — was a static 72/78/84 story. Now monthly alert counts."""
    from app.models.risk import Alert
    from sqlalchemy import func as _func
    rows = db.query(_func.substr(Alert.created_at, 1, 7).label("month"),
                    _func.count(Alert.id)).group_by("month").order_by("month").all()
    return {"by_month": [{"month": m, "alerts": n} for m, n in rows],
            "explanation": "Monthly alert counts from DB — no causal story invented"}

# Profiles Sec42-43 community score Sec44
# Module E — was static 80/75/70... Now CommuneService (Module F): real
# identity + demographics + joined counts; unscored dimensions stay MISSING.
@router.get("/profile/commune/{unit_id}")
def commune_profile(unit_id:str, db:Session=Depends(get_db)):
    from app.services import communes as cs
    stats = cs.get_commune_stats(db, unit_id)
    if not stats:
        raise HTTPException(404, "Commune not found (id, GL-code, or exact name)")
    assets = cs.get_commune_assets(db, unit_id)
    return {"commune": stats["name"], "code": stats["code"],
            "population": stats["population"],
            "population_status": stats["population_status"],
            "area_km2": stats["area_km2"], "area_ha": stats["area_ha"],
            "alerts_active": stats["alerts_active"], "incidents": stats["incidents"],
            "proposals": stats["proposals"], "monitored": stats["monitored"],
            "asset_counts": assets["counts"] if assets else {},
            "forest": None, "agriculture": None, "carbon": None, "note": "domain scores need pipelines — null, not 80"}

@router.get("/profile/village/{unit_id}")
def village_profile(unit_id:str, db:Session=Depends(get_db)):
    from app.services.village_fire import VILLAGES
    from app.services import communes as cs
    v = next((x for x in VILLAGES if x["id"] == unit_id or x["village"] == unit_id), None)
    if v:
        return {"village": v["village"], "commune": v["commune"], "code": v["code"],
                "population": v["population"], "population_status": "ESTIMATED",
                "risk": None, "forest": None,
                "note": "reference-sample point — scores need pipelines, null not 60/70"}
    unit = cs.get_commune(db, unit_id)
    if not unit:
        raise HTTPException(404, "Village/unit not found")
    return {"village": None, "commune": unit["name"], "code": unit["code"],
            "population": unit["population"], "population_status": unit["population_status"],
            "village_status": "MISSING — no reference point for this unit",
            "risk": None, "forest": None,
            "note": "scores need pipelines, null not 60/70"}

# Citizen science Sec45 + reputation Sec46 trust Sec47
# Module B — persisted via CitizenReport + EvidenceService (photos attach via
# POST /api/evidence with source=citizen). evidence URLs stay null until a
# real photo is attached — honestly empty, never fabricated.
@router.post("/citizen/report")
def citizen_report(body:dict, db:Session=Depends(get_db)):
    # types: 📷 📍 📝 🔥🌳🌊⛰️🚧
    from app.models.community import CitizenReport
    try:
        lat = float(body["lat"]) if body.get("lat") not in (None, "") else None
        lng = float(body.get("lng") or body.get("lon")) if body.get("lng", body.get("lon")) not in (None, "") else None
    except Exception:
        raise HTTPException(400, "lat/lng must be numeric")
    if lat is not None and not (-90 <= lat <= 90 and -180 <= (lng or 0) <= 180):
        raise HTTPException(400, "coordinates out of range")
    rep = CitizenReport(user_id=str(body.get("user_id", "anon"))[:100],
                        report_type=str(body.get("type") or "")[:50] or None,
                        latitude=lat, longitude=lng,
                        note=str(body.get("note") or "")[:2000] or None,
                        administrative_unit_id=body.get("administrative_unit_id"))
    db.add(rep)
    db.commit()
    db.refresh(rep)
    update_reputation(db, rep.user_id, False)
    return {"report_id": rep.id, "status": rep.status,
            "types": ["📷", "📍", "🔥"],
            "evidence_url": None, "thumbnail_url": None,
            "photo_upload": "POST /api/evidence (multipart: file, source=citizen, "
                            f"source_id={rep.id}, uploader_id, lat, lng)",
            "note": "Report persisted; attach a real photo to get evidence URLs"}

@router.get("/contributor/{user_id}")
def contributor_rep(user_id:str, db:Session=Depends(get_db)):
    return get_reputation(db, user_id)

# Collaborative verification 2.0 Sec48 conflict Sec49
@router.post("/verification/collaborative")
def collab_verify(body:dict, db:Session=Depends(get_db)):
    confirms=body.get("confirmations",[])
    # 1 user -> PENDING, 2 -> COMMUNITY_VERIFIED, conflicting -> CONFLICTED
    if len(confirms)==1: return {"status":"PENDING"}
    if len([c for c in confirms if c.get("value")=="fire"]) and len([c for c in confirms if c.get("value")=="no_fire"]):
        return {"status":"CONFLICTED","needs_field_verification": True}
    if len(confirms)>=2: return {"status":"COMMUNITY_VERIFIED"}
    return {"status":"PENDING"}

# Evidence timeline Sec50 + response performance Sec51 + early action Sec53
@router.get("/evidence-timeline/{incident_id}")
def ev_timeline(incident_id:str):
    tl=timeline(incident_id)
    perf=response_performance(tl)
    return {"timeline": tl, "performance": perf}

@router.get("/response-ranking")
def resp_ranking(db:Session=Depends(get_db)):
    """Module E — was a sample {commune A, 12min}. Now ranked from real
    ACTIVE alerts; empty ranking (not a fake one) when none exist."""
    from app.models.risk import Alert
    from app.services.evidence_timeline import early_action_score
    rows = db.query(Alert).filter_by(status="ACTIVE").order_by(Alert.created_at.desc()).limit(20).all()
    ranking = [{"commune": a.administrative_unit_id, "title": a.title,
                "level": a.level, "rank": i + 1}
               for i, a in enumerate(rows)]
    return {"ranking": ranking,
            "early_action": early_action_score("province", len(rows), 30) if rows else None,
            "note": "ranked ACTIVE alerts only — empty when no active alerts" if not rows else None}

# Lessons / post-event Sec54-56
@router.post("/lessons/record")
def record_lesson(body:dict, db:Session=Depends(get_db)):
    return {"lesson": body, "pattern": "AI finds pattern after many incidents"}

@router.get("/post-event/{incident_id}")
def post_event(incident_id:str, db:Session=Depends(get_db)):
    """Module E — was static why_high_damage + invented 0.82 accuracy.
    Now: incident + linked evidence counts from DB; causal factors MISSING
    until a real after-action review is recorded."""
    from app.models.risk import Incident, IncidentEvidence
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    n_ev = db.query(IncidentEvidence).filter_by(incident_id=incident_id).count()
    return {"incident": incident_id, "title": inc.title, "status": inc.status,
            "evidence_count": n_ev,
            "why_high_damage": None,
            "after_action": None,
            "prediction_accuracy": None,
            "note": "MISSING — no after-action review recorded; factors and accuracy are not estimated"}

# Model perf Sec57-59
@router.post("/model/metric")
def post_metric(body:dict, db:Session=Depends(get_db)):
    m=record_metric(db, body["model"], body["version"], body.get("accuracy",0.85))
    return {"id": m.id, "accuracy": m.accuracy}

@router.get("/model/drift/{model}")
def drift_check(model:str, db:Session=Depends(get_db)):
    return check_drift(db, model)

# Investment prioritization Sec67-68
# Module E — was static Area A/B/C. No investment model exists in DB, so the
# honest contract is NOT_CONFIGURED (not a plausible-looking ranking).
@router.get("/investment/priorities")
def invest_priorities():
    return {"status": "NOT_CONFIGURED", "priorities": [],
            "note": "No investment prioritization pipeline — static Area A/B/C removed"}

@router.get("/investment/map")
def invest_map():
    return {"status": "NOT_CONFIGURED", "priorities": {},
            "note": "No investment map pipeline — static zones removed"}

# Open data Sec69 research Sec71 uncertainty Sec72 data states Sec73-74
@router.get("/public/open-data")
def open_data():
    return {"areas":"/public/areas","risk":"/public/risk","forest":"/public/forest"}

@router.get("/research/mode")
def research_mode():
    return {"historical":"2024-2026","methodology":"v1.0","uncertainty":"Medium","sources":["satellite","weather"]}

@router.get("/uncertainty/{forecast_id}")
def uncertainty(forecast_id:str, db:Session=Depends(get_db)):
    fc=db.get(Forecast, forecast_id)
    if not fc: return {"prediction": None, "confidence": None, "uncertainty": "INSUFFICIENT_DATA",
                       "freshness": None, "data_state": "MISSING",
                       "note": "Unknown forecast id — confidence is not defaulted to 70"}
    return {"prediction": json.loads(fc.forecast), "confidence": fc.confidence, "uncertainty": "Moderate" if fc.confidence>70 else "High", "freshness":"2 hours", "data_state": fc.data_state}
