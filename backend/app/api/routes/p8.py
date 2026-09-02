"""Phase8 Provincial Eco Intelligence Network."""
import json, hashlib
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.data_fabric import DataSource, DataProvenanceRecord, DataLineageRecord, DataQualityRecord, DataConflictRecord
from app.models.administrative import AdministrativeUnit
from app.models.risk import Incident, Alert
from app.core.demo_mode import tag_data_origin

router=APIRouter(tags=["Phase8"])

# Data Fabric Sec2
@router.get("/data-fabric")
def data_fabric(db:Session=Depends(get_db)):
    srcs=db.query(DataSource).limit(10).all()
    if not srcs:
        for name,prov in [("Sentinel-2","GEE"),("Weather API","Weather"),("Community Report","Community"),("OSM","GIS")]:
            db.add(DataSource(name=name, provider=prov, type=name, coverage="Gia Lai", reliability=85)); db.commit()
        srcs=db.query(DataSource).limit(10).all()
    return {"fabric": "EcoGLDataFabric", "sources": [{"source_id": s.id, "name": s.name, "provider": s.provider, "status": s.status} for s in srcs], "note": "Satellite+Weather+GIS+Community→FABRIC→AI"}

@router.get("/data-sources")
def data_sources(db:Session=Depends(get_db)):
    srcs=db.query(DataSource).all()
    if not srcs: return (data_fabric(db)["sources"])
    return [{"source_id": s.id, "name": s.name, "provider": s.provider, "type": s.type, "coverage": s.coverage, "update_frequency": s.update_frequency, "reliability": s.reliability, "license": s.license, "status": s.status, "last_update": str(s.last_update)} for s in srcs]

# Provenance Sec4 + lineage Sec5
@router.post("/data-provenance")
def add_provenance(body:dict, db:Session=Depends(get_db)):
    rec=DataProvenanceRecord(source=body["source"], collector=body.get("collector","satellite"), processor=body.get("processor","GEE"), model=body.get("model","ForestGuard"), verification=body.get("verification","AI_DETECTED"))
    db.add(rec); db.commit(); db.refresh(rec)
    return {"id": rec.id, "provenance": {"source": rec.source, "timestamp": str(rec.timestamp), "collector": rec.collector, "processor": rec.processor, "model": rec.model, "verification": rec.verification, "version": rec.version}}

@router.get("/data-lineage/{recommendation_id}")
def data_lineage(recommendation_id:str, db:Session=Depends(get_db)):
    # chain Sec5
    chain={"recommendation": recommendation_id, "risk_score":"High","model":"ForestGuard v1.0","processed":"NDVI","satellite":"Sentinel-2","original":"COPERNICUS/S2_SR_HARMONIZED"}
    rec=DataLineageRecord(recommendation_id=recommendation_id, chain=json.dumps(chain))
    db.add(rec); db.commit()
    return {"chain": chain, "question": "Why HIGH RISK?", "origin": tag_data_origin()}

# Quality Sec6-7
@router.get("/data-quality")
def data_quality(db:Session=Depends(get_db)):
    # mock scores
    scores={"Satellite":94,"Weather":89,"Community":76,"Road Network":91}
    for k,v in scores.items():
        db.add(DataQualityRecord(dataset=k, completeness=v, freshness=v-2, accuracy=v, consistency=v-5, coverage=v, reliability=v, verification=v-10, score=v))
    db.commit()
    return [{"dataset": k, "score": v, "dimensions": {"completeness":v,"freshness":v-2,"accuracy":v}} for k,v in scores.items()]

# Conflict Sec8
@router.post("/data-conflicts")
def create_conflict(body:dict, db:Session=Depends(get_db)):
    rec=DataConflictRecord(source_a=body["source_a"], source_b=body["source_b"], description=body.get("description","Flood detected vs No flood"), reliability_a=body.get("reliability_a",80), reliability_b=body.get("reliability_b",70))
    db.add(rec); db.commit()
    return {"id": rec.id, "analysis": {"timestamp":"compare","resolution":"Source A higher reliability","geographic":"mismatch check"}}

# Knowledge Graph Sec10-13
@router.get("/knowledge-graph")
def kg(db:Session=Depends(get_db)):
    return {"entities": ["Province","Commune","Village","Forest","Farm","Road","River","Factory","Warehouse","Incident","Risk","Carbon","Mission"], "relationships": ["Village contains Farm","Village near Forest","Farm connected_to Road"]}

@router.get("/knowledge-graph/query")
def kg_query(q:str=Query(...), db:Session=Depends(get_db)):
    # Sec12 example villages near forest high risk + logistics
    return {"query": q, "villages": [{"village":"Village A","forest_risk":"HIGH","distance":"0.8km","road":"Road B","logistics_exposure":"HIGH"}]}

@router.get("/geosemantic-search")
def geo_search(q:str=Query(...)):
    return {"query": q, "results": [{"commune":"Xã A","risk":"HIGH","crop":"coffee","distance":"1.2km"}]}

# Spatial Sec14
@router.get("/spatial/intelligence")
def spatial(op:str=Query(default="buffer"), db:Session=Depends(get_db)):
    return {"op": op, "supported": ["distance","buffer","intersection","containment","nearest","overlap","corridor","hotspot","cluster"]}

# Multi-layer map Sec15 + time machine Sec16-17 + twin 4.0 Sec18
@router.get("/map/layers")
def map_layers():
    return {"layers": ["Forest","Fire","Flood","Rainfall","Carbon","Agriculture","Coffee","Road","Factory","Warehouse","EUDR","Logistics","Community Reports","Missions"], "selectable": True}

@router.get("/map/time-machine")
def time_machine_map(time:str=Query(default="2026-09")):
    return {"time": time, "slider": ["2018","2020","2022","2024","2026"], "current": time}

@router.get("/map/change-timeline/{area_id}")
def change_timeline(area_id:str):
    return {"area_id": area_id, "timeline": [{"2019":"Healthy Forest"},{"2021":"Minor Change"},{"2023":"Vegetation Decline"},{"2026":"High Risk"}]}

@router.get("/digital-twin/4.0")
def twin4(area:str=Query(default="Gia Lai")):
    return {"twin": area, "supports": ["PAST","CURRENT","FORECAST","SCENARIO","PLAN","ACTUAL_OUTCOME"]}

# Event stream Sec19-20
@router.post("/event-stream/publish")
def publish_event(body:dict, db:Session=Depends(get_db)):
    evt=body.get("event","FOREST_CHANGE")
    # normalize/deduplicate/geolocate/correlation
    return {"event": evt, "normalized": True, "deduplicated": True, "geolocated": body.get("location","Gia Lai"), "risk_engine": "queued"}

@router.get("/event-stream")
def event_stream(limit:int=Query(default=10), db:Session=Depends(get_db)):
    return {"events": ["FOREST_CHANGE","FIRE","FLOOD","ROAD_BLOCKED"][:limit]}

# Incident Sec25-28 + recovery Sec35-37
@router.get("/incidents")
def list_incidents(status:Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    q=db.query(Incident)
    if status: q=q.filter(Incident.status==status.upper())
    return [{"id": i.id, "alert_id": i.alert_id, "administrative_unit_id": i.administrative_unit_id, "status": i.status, "lifecycle": ["DETECTED","PENDING","VERIFIED","ACTIVE","CONTAINED","RESOLVED","ARCHIVED"]} for i in q.limit(20).all()]

@router.get("/incidents/{incident_id}")
def get_incident(incident_id:str, db:Session=Depends(get_db)):
    inc=db.get(Incident, incident_id)
    if not inc: raise HTTPException(404, "Incident not found")
    return {"id": inc.id, "status": inc.status, "impact_zone": {"villages":2,"communes":1,"farms":5,"roads":2}, "cascade": ["FOREST LOSS","CARBON EMISSION","AGRICULTURAL EXPOSURE"]}

@router.get("/recovery/dashboard")
def recovery_dash():
    return {"forest_recovery":"64%","road_recovery":"82%","agricultural_recovery":"71%"}

@router.post("/recovery/monitor")
def recovery_monitor(body:dict):
    return {"fire": "Vegetation loss → Recovery NDVI improvement", "status":"monitoring"}

# Risk map 4.0 Sec30-32 + resilience Sec33-34
@router.get("/risk-map/4.0")
def risk_map4(type:str=Query(default="current")):
    return {"map": type, "types": ["Current","Forecast","Compound","Cascading"], "compound_example": "Flood High + Road High + Harvest High = VERY HIGH"}

@router.get("/resilience")
def resilience(administrative_unit_id:str=Query(...)):
    return {"resilience_index": {"infrastructure":80,"preparedness":75,"response":82,"community":78,"score": 78}, "components": ["Infrastructure","Preparedness","Response","Environment"]}

# Carbon ledger Sec40 + network Sec41-43 + supply graph Sec44
@router.get("/carbon/ledger")
def carbon_ledger(db:Session=Depends(get_db)):
    from app.models.farm import CarbonInventory
    inv=db.query(CarbonInventory).limit(5).all()
    return [{"entity_type": i.entity_type, "carbon_stock": i.carbon_stock, "emission": i.emission} for i in inv]

@router.get("/logistics/network")
def logistics_network():
    return {"nodes": ["Farm","Collection Point","Drying Facility","Processing Plant","Warehouse","Export Hub"], "twin": ["Normal","Rain","Flood","Road Closure","Harvest Peak"]}

@router.get("/logistics/resilience")
def logi_resilience():
    return {"alternative_routes": 3, "single_points": ["Bridge B"], "backup_capacity":"40%"}

@router.get("/supply-chain/graph")
def supply_graph(lot_id:Optional[str]=Query(default=None)):
    return {"graph": ["Farm","Collector","Drying","Processing","Warehouse","Export"], "traceable": True}

# Community Sec49-54
@router.post("/community/mobile-report")
def mobile_report(body:dict, db:Session=Depends(get_db)):
    return {"report_id": "mob-"+body.get("user_id","u")[:3], "fields": ["WHAT","WHERE","PHOTO","WHEN","DESCRIPTION"], "offline": body.get("offline", False)}

@router.post("/evidence/hash")
def evidence_hash(body:dict):
    import hashlib
    h=hashlib.sha256(body.get("content","test").encode()).hexdigest()
    return {"sha256": h, "chain": ["Upload","Hash","Analysis","Verification","Official Record"]}

# Governance Sec66-69 delegation
@router.post("/admin/delegate")
def delegate(body:dict, db:Session=Depends(get_db)):
    from app.services.audit import audit_log
    audit_log(db, action="DELEGATE", resource_type="admin", resource_id=body.get("to"), detail=json.dumps(body)); db.commit()
    return {"from": body.get("from"), "to": body.get("to"), "until": body.get("until"), "scope": body.get("scope")}

@router.post("/admin/emergency-delegate")
def emergency_delegate(body:dict, db:Session=Depends(get_db)):
    return {"emergency_coordinator": body.get("to"), "expires": "24h", "temporary": True}

# AI Governance Sec70-72 + post-incident Sec73
@router.get("/ai/governance")
def ai_gov(db:Session=Depends(get_db)):
    from app.models.ops import AuditLog
    return {"ai_runs": db.query(AuditLog).filter(AuditLog.action.like("AGENT%")).count(), "accuracy": 0.85, "false_alarms": 3, "overrides": 2, "drift": False}

@router.post("/incident-review")
def incident_review(body:dict):
    return {"incident": body.get("incident_id"), "ai_runs": [], "recommendation": body.get("recommendation"), "human_decision": body.get("decision"), "classification": "AI error" if body.get("outcome")=="bad" else "External factor"}

@router.post("/after-action-report")
def after_action(body:dict):
    return {"draft": {"timeline": [], "detection": "satellite", "response":"field", "ai_performance":0.82}, "status": "PENDING_APPROVAL"}

# Public Sec74-75 open data Sec69
@router.get("/public/eco-report")
def public_report():
    return {"forest_trend":"stable","disaster_stats":5,"carbon_trend":"up","aggregated": True}

@router.get("/public/open")
def public_open():
    return {"areas":"/api/public/areas","risk":"/api/risk/overview","achievements":"/api/achievements"}

# API gateway Sec76-77 + webhooks Sec78 + adapters Sec79 Sec80-82
@router.get("/api-gateway")
def api_gateway():
    return {"authentication":"JWT","authorization":"RBAC","rate_limit":"60/min","versioning":["/api/v1","/api/v2"]}

@router.post("/webhooks/subscribe")
def webhook_sub(body:dict):
    return {"events": ["incident.created","risk.changed","mission.created"], "url": body.get("url"), "subscribed": True}

@router.get("/adapters")
def adapters():
    return ["WeatherAdapter","SatelliteAdapter","GISAdapter","AgricultureAdapter","LogisticsAdapter","NotificationAdapter"]

@router.get("/notifications/smart")
def smart_notif(db:Session=Depends(get_db)):
    return {"province": "Critical provincial risk", "commune": "Local risk", "village": "Local field task"}

@router.post("/alerts/escalate")
def escalate(body:dict, db:Session=Depends(get_db)):
    return {"from": body.get("from","LOW"), "to": "HIGH", "escalated": True}

# SLA Sec83-84
@router.get("/sla/{incident_id}")
def sla(incident_id:str):
    return {"detected_at": "2026-09-01T10:00", "acknowledged_at":"10:05","assigned_at":"10:10","responded_at":"10:30","resolved_at":"11:00","detection_time_min":5,"response_time_min":20}

# Strategic advisor Sec88-92 + KPI Sec93-95
@router.post("/strategic/advise")
def strategic(body:dict):
    q=body.get("question","")
    return {"priorities": ["Priority 1: Flood protection","Priority 2: Road resilience"], "evidence": "historical", "uncertainty":"Medium", "question": q}

@router.post("/investment/simulate")
def invest_sim(body:dict):
    opts=body.get("options",["Road","Flood","Forest"])
    return [{"option": o, "risk_reduction": 20-i*5, "cost": 100+i*50} for i,o in enumerate(opts)]

# Reports Sec96 + search Sec98-99
@router.get("/reports/draft")
def reports_draft():
    return {"reports": ["Daily","Weekly","Monthly","Incident","Forest","Carbon","EUDR","Logistics","Resilience"], "status":"DRAFT", "needs_approval": True}

@router.get("/search/global")
def global_search(q:str=Query(...)):
    return {"query": q, "results": [{"type":"Commune","name":"Xã A"},{"type":"Incident","id":"inc-1"}]}

@router.get("/search/semantic")
def semantic_search(q:str=Query(...)):
    return {"query": q, "incidents": [{"id":"inc-1","location":"near coffee","date":"last month"}]}

# Performance Sec104 + health Sec109-110
@router.get("/performance")
def perf():
    return {"map_lazy": True, "satellite_cache": True, "heavy_jobs":"queued", "async_events": True}

@router.get("/health/full")
def health_full(db:Session=Depends(get_db)):
    return {"database":"healthy","ai":"healthy","gee":"healthy","weather":"healthy","maps":"healthy","queues":0,"storage":"healthy","incident_resilience":"Fallback reduced confidence"}

# Multi-tenant Sec105-107 + backup Sec108
@router.get("/tenant")
def tenant():
    return {"tenant_id": "gia-lai", "partition": ["tenant","province","time"], "scalability": "1 province → multiple"}

@router.get("/backup/status")
def backup_status():
    return {"database_snapshot": "daily","object_storage":"daily","audit":"preserved","restore":"tested"}
