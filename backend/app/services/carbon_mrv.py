"""Carbon MRV — measurement/reporting/verification + inventory + methodology."""
from __future__ import annotations
import json
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.farm import CarbonInventory
from app.models.risk import CarbonModel, CarbonRecord

def get_methodology(db:Session, version:str|None=None)->CarbonModel:
    if version:
        m=db.query(CarbonModel).filter_by(version=version).first()
        if m: return m
    m=db.query(CarbonModel).order_by(CarbonModel.created_at.desc()).first()
    if not m:
        m=CarbonModel(version="FOREST_BIOMASS_V1", biomass_factor=150, carbon_factor=0.47, description="Forest biomass default")
        db.add(m); db.commit(); db.refresh(m)
    return m

def record_inventory(db:Session, entity_type:str, entity_id:str, carbon_stock:float|None=None, emission:float|None=None, methodology:str="FOREST_BIOMASS_V1", confidence:int=60, verification_status:str="PENDING")->CarbonInventory:
    inv=CarbonInventory(entity_type=entity_type, entity_id=entity_id, carbon_stock=carbon_stock, emission=emission, methodology=methodology, confidence=confidence, verification_status=verification_status)
    db.add(inv); db.commit(); db.refresh(inv)
    return inv

def carbon_report(db:Session, administrative_unit_id:str|None=None)->dict:
    q=db.query(CarbonInventory)
    if administrative_unit_id:
        # filter via entity linked to unit? simplified
        pass
    inv=q.order_by(CarbonInventory.created_at.desc()).limit(20).all()
    total_stock=sum(i.carbon_stock or 0 for i in inv)
    total_emission=sum(i.emission or 0 for i in inv)
    return {"inventory": [{"id": i.id, "entity_type": i.entity_type, "carbon_stock": i.carbon_stock, "emission": i.emission, "methodology": i.methodology} for i in inv], "total_stock": total_stock, "total_emission": total_emission, "net": total_stock - total_emission, "methodology": get_methodology(db).version, "disclaimer": "Carbon estimate — Carbon Monitoring Signal, not credit certification"}
