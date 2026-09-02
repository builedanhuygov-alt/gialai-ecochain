"""Phase4 APIs — Sec45: farms/plots/lots/traceability/eudr/carbon/logistics/green-score + dashboards."""
import json, hashlib, uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.farm import Farm, Plot, ProductionLot, Farmer, ProcessingFacility, CollectionPoint, Warehouse, Vehicle, Route, Trip
from app.models.administrative import AdministrativeUnit
from app.models.risk import CarbonModel
from app.services.agents.eudr_guard import eudr_guard
from app.services.carbon_mrv import record_inventory, carbon_report, get_methodology
from app.services.green_route import green_route, haversine
from app.services.green_score import farm_green_score, commune_green_score
from app.services.audit import audit_log
from app.core.demo_mode import tag_data_origin

router = APIRouter(tags=["FarmLogistics"])

# simple permission check Sec43
PERMS={"VIEW_FARM","EDIT_FARM","VERIFY_FARM","VIEW_PLOT","EDIT_PLOT","VERIFY_PLOT","VIEW_SUPPLY_CHAIN","MANAGE_LOTS","VIEW_CARBON","VERIFY_CARBON","VIEW_LOGISTICS","OPTIMIZE_ROUTE","GENERATE_EUDR_REPORT"}
def require_perm(perm:str, role:str|None):
    # mock: admin has all, farm_operator only VIEW_FARM etc
    if role=="admin": return True
    if perm in ("VIEW_FARM","VIEW_PLOT","VIEW_SUPPLY_CHAIN","VIEW_CARBON","VIEW_LOGISTICS"): return True
    raise HTTPException(403, f"Missing permission {perm}")

# ── Farms ─────────────────────────────────────────────────────────
@router.get("/farms")
def list_farms(administrative_unit_id:Optional[str]=Query(default=None), db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    require_perm("VIEW_FARM", x_role or "admin")
    q=db.query(Farm)
    if administrative_unit_id: q=q.filter(Farm.administrative_unit_id==administrative_unit_id)
    farms=q.limit(50).all()
    # privacy Sec44: not expose phone, filter
    return [{"farm_id": f.farm_id, "id": f.id, "crop_type": f.crop_type, "area_ha": f.area_ha, "status": f.status, "administrative_unit_id": f.administrative_unit_id, "data_quality": f.data_quality, "origin": tag_data_origin()} for f in farms]

@router.post("/farms")
def create_farm(body:dict, db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    require_perm("EDIT_FARM", x_role or "admin")
    fid=body.get("farm_id") or f"FARM-{uuid.uuid4().hex[:8].upper()}"
    farm=Farm(farm_id=fid, owner_reference=body.get("owner_reference"), owner_id=body.get("owner_id"), administrative_unit_id=body["administrative_unit_id"], location=body.get("location"), geometry=json.dumps(body["geometry"]) if body.get("geometry") else None, crop_type=body.get("crop_type","coffee"), area_ha=body.get("area_ha"), production_period=body.get("production_period"), status="ACTIVE", data_quality="VERIFIED" if body.get("geometry") else "PENDING")
    db.add(farm); audit_log(db, action="FARM_CREATED", resource_type="farm", resource_id=farm.id, detail=fid); db.commit(); db.refresh(farm)
    return {"id": farm.id, "farm_id": farm.farm_id, "status": farm.status}

@router.get("/farms/{farm_id}")
def get_farm(farm_id:str, db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    require_perm("VIEW_FARM", x_role or "admin")
    f=db.query(Farm).filter((Farm.id==farm_id)|(Farm.farm_id==farm_id)).first()
    if not f: raise HTTPException(404, "Farm not found")
    farmer=db.get(Farmer, f.owner_id) if f.owner_id else None
    # privacy: don't expose phone in public view (x_role not admin)
    owner_public= {"name": farmer.name if farmer else f.owner_reference} if farmer or f.owner_reference else None
    return {"farm_id": f.farm_id, "id": f.id, "owner": owner_public, "geometry": json.loads(f.geometry) if f.geometry else None, "crop_type": f.crop_type, "area_ha": f.area_ha, "administrative_unit_id": f.administrative_unit_id, "data_quality": f.data_quality, "origin": tag_data_origin()}

# ── Plots ─────────────────────────────────────────────────────────
@router.get("/plots")
def list_plots(farm_id:Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    q=db.query(Plot)
    if farm_id: q=q.filter(Plot.farm_id==farm_id)
    return [{"id": p.id, "farm_id": p.farm_id, "geometry": json.loads(p.geometry), "area_ha": p.area_ha, "forest_overlap_pct": p.forest_overlap_pct, "forest_risk": p.forest_risk} for p in q.limit(50).all()]

@router.post("/plots")
def create_plot(body:dict, db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    require_perm("EDIT_PLOT", x_role or "admin")
    if not body.get("geometry") or body["geometry"].get("type")!="Polygon": raise HTTPException(400, "Plot requires Polygon geometry Sec5")
    plot=Plot(farm_id=body["farm_id"], geometry=json.dumps(body["geometry"]), area_ha=body.get("area_ha"), crop_type=body.get("crop_type"))
    db.add(plot)
    # forest check Sec6
    from app.services.agents.eudr_guard import forest_check
    ctx=forest_check(body["geometry"])
    plot.forest_overlap_pct=ctx["forest_overlap_pct"]; plot.forest_risk=ctx["forest_risk"]
    audit_log(db, action="PLOT_CREATED", resource_type="plot", resource_id=plot.id); db.commit(); db.refresh(plot)
    return {"id": plot.id, "forest_overlap_pct": plot.forest_overlap_pct, "forest_risk": plot.forest_risk, "note": "EUDR REVIEW REQUIRED" if plot.forest_risk=="HIGH" else "LOW"}

@router.get("/plots/{plot_id}")
def get_plot(plot_id:str, db:Session=Depends(get_db)):
    p=db.get(Plot, plot_id)
    if not p: raise HTTPException(404, "Plot not found")
    return {"id": p.id, "farm_id": p.farm_id, "geometry": json.loads(p.geometry), "area_ha": p.area_ha, "forest_overlap_pct": p.forest_overlap_pct, "forest_risk": p.forest_risk}

# ── Lots ──────────────────────────────────────────────────────────
@router.get("/lots")
def list_lots(farm_id:Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    q=db.query(ProductionLot)
    if farm_id: q=q.filter(ProductionLot.farm_id==farm_id)
    return [{"lot_code": l.lot_code, "id": l.id, "farm_id": l.farm_id, "harvest_date": l.harvest_date, "quantity_kg": l.quantity_kg, "traceability_status": l.traceability_status, "eudr_status": l.eudr_status} for l in q.limit(50).all()]

@router.post("/lots")
def create_lot(body:dict, db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    require_perm("MANAGE_LOTS", x_role or "admin")
    code=body.get("lot_code") or f"GL-2026-{str(db.query(ProductionLot).count()+1).zfill(5)}"
    lot=ProductionLot(lot_code=code, farm_id=body["farm_id"], plot_id=body.get("plot_id"), facility_id=body.get("facility_id"), crop_type=body.get("crop_type","coffee"), harvest_date=body.get("harvest_date"), quantity_kg=body.get("quantity_kg"))
    db.add(lot); audit_log(db, action="LOT_CREATED", resource_type="lot", resource_id=lot.id, detail=code); db.commit(); db.refresh(lot)
    return {"id": lot.id, "lot_code": lot.lot_code}

@router.get("/lots/{lot_id}")
def get_lot(lot_id:str, db:Session=Depends(get_db)):
    lot=db.query(ProductionLot).filter((ProductionLot.id==lot_id)|(ProductionLot.lot_code==lot_id)).first()
    if not lot: raise HTTPException(404, "Lot not found")
    return {"lot_code": lot.lot_code, "id": lot.id, "farm_id": lot.farm_id, "plot_id": lot.plot_id, "harvest_date": lot.harvest_date, "quantity_kg": lot.quantity_kg, "traceability_status": lot.traceability_status, "data_quality": lot.data_quality}

# ── Traceability ──────────────────────────────────────────────────
@router.get("/traceability/{lot_id}")
def traceability(lot_id:str, db:Session=Depends(get_db)):
    lot=db.query(ProductionLot).filter((ProductionLot.id==lot_id)|(ProductionLot.lot_code==lot_id)).first()
    if not lot: raise HTTPException(404, "Lot not found")
    farm=db.get(Farm, lot.farm_id) if lot.farm_id else None
    plot=db.get(Plot, lot.plot_id) if lot.plot_id else None
    facility=db.get(ProcessingFacility, lot.facility_id) if lot.facility_id else None
    # hierarchy
    trace=[]
    if farm:
        unit=db.get(AdministrativeUnit, farm.administrative_unit_id)
        while unit:
            trace.append({"level": unit.level, "name": unit.name})
            unit=db.get(AdministrativeUnit, unit.parent_id) if unit.parent_id else None
        trace.reverse()
    graph={"farm": farm.farm_id if farm else None, "plot": plot.id if plot else None, "collection": "Collection Center", "factory": facility.name if facility else None, "warehouse": "Warehouse", "exporter": "Exporter", "eu_market": "EU Market"}
    timeline=[
        {"date": "2026-02-01", "event": "Farm registered"},
        {"date": lot.harvest_date or "2026-05-15", "event": "Harvest"},
        {"date": "2026-05-18", "event": "Collected"},
        {"date": "2026-05-20", "event": "Processing"},
        {"date": "2026-05-25", "event": "Warehouse"},
        {"date": "2026-05-28", "event": "Shipment"},
    ]
    return {"lot_code": lot.lot_code, "farm": farm.farm_id if farm else None, "plot": plot.id if plot else None, "hierarchy": trace, "graph": graph, "timeline": timeline, "origin": tag_data_origin()}

# ── EUDR ──────────────────────────────────────────────────────────
@router.get("/eudr/check")
def eudr_check(lot_id:str=Query(...), db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    require_perm("GENERATE_EUDR_REPORT", x_role or "admin")
    result=eudr_guard.assess(db, lot_id)
    return result

@router.get("/eudr/report")
def eudr_report(lot_id:str=Query(...), db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    require_perm("GENERATE_EUDR_REPORT", x_role or "admin")
    return eudr_guard.report(db, lot_id)

# passport + QR Sec11-12
@router.get("/passport/{lot_code}")
def passport(lot_code:str, db:Session=Depends(get_db)):
    lot=db.query(ProductionLot).filter(ProductionLot.lot_code==lot_code).first()
    if not lot: raise HTTPException(404, "Lot not found")
    assess=eudr_guard.assess(db, lot.id)
    # privacy: public view excludes farmer phone
    return {"passport": assess["passport"], "qr": assess["qr"], "origin": tag_data_origin(), "note": "Public data only — private farmer info not exposed"}

# ── Carbon MRV ────────────────────────────────────────────────────
@router.get("/carbon/inventory")
def carbon_inventory(entity_type:Optional[str]=Query(default=None), db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    require_perm("VIEW_CARBON", x_role or "admin")
    from app.models.farm import CarbonInventory
    q=db.query(CarbonInventory)
    if entity_type: q=q.filter(CarbonInventory.entity_type==entity_type.upper())
    inv=q.limit(50).all()
    return [{"id": i.id, "entity_type": i.entity_type, "entity_id": i.entity_id, "carbon_stock": i.carbon_stock, "emission": i.emission, "methodology": i.methodology, "verification_status": i.verification_status} for i in inv]

@router.post("/carbon/inventory")
def create_carbon_inventory(body:dict, db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    inv=record_inventory(db, body["entity_type"], body["entity_id"], body.get("carbon_stock"), body.get("emission"), body.get("methodology","FOREST_BIOMASS_V1"))
    return {"id": inv.id, "status": inv.verification_status}

@router.get("/carbon/report")
def carbon_rep(administrative_unit_id:Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    return carbon_report(db, administrative_unit_id)

# ── Logistics ─────────────────────────────────────────────────────
@router.get("/logistics/routes")
def list_routes(db:Session=Depends(get_db)):
    routes=db.query(Route).limit(20).all()
    return [{"id": r.id, "origin": r.origin, "destination": r.destination, "distance_km": r.distance_km, "risk_level": r.risk_level} for r in routes]

@router.post("/logistics/routes")
def create_route(body:dict, db:Session=Depends(get_db)):
    r=Route(origin=body["origin"], destination=body["destination"], waypoints=json.dumps(body.get("waypoints")), distance_km=body["distance_km"], time_min=body.get("time_min",60), risk_level=body.get("risk_level","LOW"))
    db.add(r); db.commit(); db.refresh(r)
    return {"id": r.id, "distance_km": r.distance_km}

@router.post("/logistics/optimize")
def optimize_route(body:dict, db:Session=Depends(get_db), x_role:Optional[str]=Header(default=None)):
    require_perm("OPTIMIZE_ROUTE", x_role or "admin")
    origin=body["origin"]; dest=body["destination"]; wps=body.get("waypoints")
    # disaster-aware Sec25: check alerts
    from app.models.risk import Alert
    alerts=[{"level": a.level} for a in db.query(Alert).filter(Alert.status=="ACTIVE").limit(5).all()]
    road_risk={"segment1": alerts[0]["level"]} if alerts else None
    vehicle=db.query(Vehicle).first()
    result=green_route.optimize(origin, dest, wps, vehicle, road_risk, body.get("weights"))
    # also demo dynamic reroute if high alert
    reroute=green_route.disaster_reroute(result["best"], alerts)
    return {**result, "reroute": reroute, "origin": tag_data_origin()}

@router.post("/logistics/emissions")
def logistics_emissions(body:dict, db:Session=Depends(get_db)):
    # body: route_id, vehicle_id, load_kg
    route=db.get(Route, body["route_id"]) if body.get("route_id") else None
    vehicle=db.get(Vehicle, body["vehicle_id"]) if body.get("vehicle_id") else db.query(Vehicle).first()
    if not route or not vehicle: raise HTTPException(404, "Route or vehicle not found")
    load=body.get("load_kg",3000)
    em=green_route.optimize.__wrapped__ if False else None
    from app.services.green_route import co2_for
    co2=co2_for(route.distance_km, load, vehicle.emission_factor)
    trip=Trip(route_id=route.id, vehicle_id=vehicle.id, lot_id=body.get("lot_id"), load_kg=load, distance_km=route.distance_km, emission_kg=co2["co2_kg"])
    db.add(trip); db.flush()
    record_inventory(db, "TRIP", trip.id, emission=co2["co2_kg"], methodology=co2["methodology"]); db.commit()
    return {"trip_id": trip.id, "co2_kg": co2["co2_kg"], "methodology": co2["methodology"], "emission_factor": co2["emission_factor"]}

# ── Green scores / Dashboard ──────────────────────────────────────
@router.get("/green-score")
def green_score(farm_id:Optional[str]=Query(default=None), commune_id:Optional[str]=Query(default=None), db:Session=Depends(get_db)):
    if farm_id:
        farm=db.query(Farm).filter((Farm.id==farm_id)|(Farm.farm_id==farm_id)).first()
        if not farm: raise HTTPException(404, "Farm not found")
        gs=farm_green_score(90,85,78,80,92)
        return {"farm_id": farm.farm_id, "green_score": gs}
    if commune_id:
        gs=commune_green_score(85,82,75,80,90,78)
        # ECOGL SCORE Sec33
        from app.services.green_score import overall_eco_score
        eco=overall_eco_score({"forest":91,"disaster":84,"carbon":87,"traceability":93,"logistics":78,"community":95})
        return {"commune_id": commune_id, "green_score": gs, "ecogl_score": eco}
    # overall dashboard Sec46-47
    farms=db.query(Farm).count(); lots=db.query(ProductionLot).count()
    from app.models.risk import Alert as A
    critical=db.query(A).filter(A.level=="CRITICAL").count()
    return {"farms": farms, "lots": lots, "critical_alerts": critical, "origin": tag_data_origin()}

@router.get("/dashboard/green-economy")
def dashboard_green(db:Session=Depends(get_db)):
    farms=db.query(Farm).count(); lots=db.query(ProductionLot).count()
    from app.models.farm import CarbonInventory as CI
    carbon=db.query(CI).count()
    routes=db.query(Route).count()
    eudr_ready=db.query(ProductionLot).filter(ProductionLot.eudr_status=="COMPLETE").count() if hasattr(ProductionLot,"eudr_status") else 0
    return {"traceable_farms": farms, "traceable_lots": lots, "carbon_monitored": carbon, "green_routes": routes, "eudr_ready_lots": eudr_ready, "origin": tag_data_origin()}

@router.get("/dashboard/lot-risk")
def lot_risk_dashboard(db:Session=Depends(get_db)):
    lots=db.query(ProductionLot).all()
    # mock risk via plot forest_risk
    counts={"LOW":0,"MODERATE":0,"HIGH":0,"CRITICAL":0}
    for lot in lots:
        plot=db.get(Plot, lot.plot_id) if lot.plot_id else None
        lvl= plot.forest_risk if plot and plot.forest_risk else "LOW"
        counts[lvl]=counts.get(lvl,0)+1
    return counts

# ── Permissions list / Audit ──────────────────────────────────────
@router.get("/permissions")
def list_perms():
    return sorted(list(PERMS))

@router.get("/audit/traces")
def audit_traces(limit:int=Query(default=20), db:Session=Depends(get_db)):
    from app.models.ops import AuditLog
    logs=db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [{"action": l.action, "resource_type": l.resource_type, "resource_id": l.resource_id, "detail": l.detail, "created_at": str(l.created_at)} for l in logs]
