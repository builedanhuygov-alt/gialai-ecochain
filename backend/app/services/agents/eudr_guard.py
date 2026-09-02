"""EUDRGuard — readiness, due diligence, flags, passport, QR, report (Sec2-12,39)."""
from __future__ import annotations
import hashlib, json, random
from datetime import datetime
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from app.models.farm import Farm, Plot, ProductionLot
from app.models.administrative import AdministrativeUnit

# Risk flags Sec9
FLAGS=["MISSING_GEOLOCATION","FOREST_OVERLAP","FOREST_CHANGE_SIGNAL","MISSING_DOCUMENT","UNKNOWN_SUPPLIER","HIGH_RISK_AREA","DATA_OUTDATED","VERIFICATION_REQUIRED"]

def forest_check(plot_geometry:Dict|None, forest_risk:str|None=None)->Dict[str,Any]:
    # mock overlap via seeded random
    h=hashlib.sha256(json.dumps(plot_geometry or {}).encode()).hexdigest()
    rng=random.Random(int(h[:8],16))
    overlap= round(rng.uniform(0,15),1)
    # forest_risk from DisasterGuard or mock
    risk= forest_risk or ("HIGH" if overlap>8 else "LOW" if overlap<3 else "MODERATE")
    return {"forest_overlap_pct": overlap, "forest_risk": risk, "vegetation_change": "STABLE" if overlap<5 else "POTENTIAL_CHANGE"}

def due_diligence(lot:ProductionLot, farm:Farm|None, plot:Plot|None, facility_check:bool=True)->Dict[str,Any]:
    checks={
        "producer_identified": bool(farm and farm.owner_reference),
        "plot_geolocation": bool(plot and plot.geometry),
        "production_period": bool(lot.harvest_date),
        "supply_chain": bool(lot.facility_id),
        "forest_monitoring": True,  # always via forest_check
        "risk_assessment": True,
        "supporting_document": False,  # mock missing
        "verification": lot.data_quality in ("VERIFIED","COMMUNITY_VERIFIED"),
    }
    flags=[]
    if not checks["plot_geolocation"]: flags.append("MISSING_GEOLOCATION")
    if plot and (plot.forest_overlap_pct or 0) > 5: flags.append("FOREST_OVERLAP")
    if plot and plot.forest_risk=="HIGH": flags.append("FOREST_CHANGE_SIGNAL")
    if not checks["supporting_document"]: flags.append("MISSING_DOCUMENT")
    if plot and plot.forest_risk=="HIGH": flags.append("HIGH_RISK_AREA")
    status="COMPLETE" if all(checks.values()) else ("REVIEW_REQUIRED" if flags else "INCOMPLETE")
    return {"checks": checks, "flags": flags, "status": status}

def readiness_score(due:Dict[str,Any], forest_ctx:Dict[str,Any])->Dict[str,Any]:
    checks=due["checks"]
    # subscores 0-100
    trace= 95 if checks["producer_identified"] and checks["plot_geolocation"] else 60
    geo= 100 if checks["plot_geolocation"] else 0
    forest_ev= 87 if forest_ctx["forest_risk"]=="LOW" else 40
    doc= 82 if checks["supporting_document"] else 45
    risk= 90 if not due["flags"] else 55
    overall= int((trace+geo+forest_ev+doc+risk)/5)
    return {"traceability": trace, "geolocation": geo, "forest_evidence": forest_ev, "documentation": doc, "risk_assessment": risk, "overall": overall}

class EUDRGuardAgent:
    def assess(self, db:Session, lot_id:str)->Dict[str,Any]:
        lot=db.get(ProductionLot, lot_id)
        if not lot: raise ValueError("Lot not found")
        farm=db.get(Farm, lot.farm_id) if lot.farm_id else None
        plot=db.get(Plot, lot.plot_id) if lot.plot_id else None
        facility_check=True
        fctx= forest_check(json.loads(plot.geometry) if plot and plot.geometry else None, plot.forest_risk if plot else None) if plot else {"forest_overlap_pct":0,"forest_risk":"LOW","vegetation_change":"STABLE"}
        # update plot with forest context
        if plot:
            plot.forest_overlap_pct=fctx["forest_overlap_pct"]
            plot.forest_risk=fctx["forest_risk"]
        due= due_diligence(lot, farm, plot, facility_check)
        readiness= readiness_score(due, fctx)
        # hierarchy trace Sec3
        trace=[]
        if farm:
            unit=db.get(AdministrativeUnit, farm.administrative_unit_id)
            if unit:
                # walk up
                cur=unit
                while cur:
                    trace.append({"level":cur.level,"name":cur.name, "id":cur.id})
                    cur= db.get(AdministrativeUnit, cur.parent_id) if cur.parent_id else None
                trace.reverse()
        passport={
            "lot_code": lot.lot_code, "origin": "Gia Lai", "farm": farm.farm_id if farm else None,
            "plot": plot.id if plot else None, "harvest": lot.harvest_date, "geolocation": "VERIFIED" if due["checks"]["plot_geolocation"] else "MISSING",
            "forest_risk": fctx["forest_risk"], "traceability": due["status"], "eudr_readiness": readiness["overall"],
            "disclaimer": "EUDR Readiness — Due Diligence Support, not certification (Sec53)"
        }
        # QR payload (public only, no phone)
        qr_payload= {"lot": lot.lot_code, "origin": "Gia Lai", "farm": farm.farm_id if farm else None, "geolocation": passport["geolocation"], "forest_risk": fctx["forest_risk"], "eudr_readiness": readiness["overall"]}
        qr_token= hashlib.sha256(json.dumps(qr_payload).encode()).hexdigest()[:16]
        return {
            "lot_id": lot_id, "lot_code": lot.lot_code,
            "forest_context": fctx, "due_diligence": due, "readiness": readiness,
            "traceability": trace, "passport": passport, "qr": {"token": qr_token, "payload": qr_payload, "url": f"/passport/{lot.lot_code}?t={qr_token}"},
            "flags": due["flags"], "status": due["status"]
        }
    def report(self, db:Session, lot_id:str)->Dict[str,Any]:
        a=self.assess(db, lot_id)
        lot=db.get(ProductionLot, lot_id)
        return {
            "producer": lot.farm_id if lot else None, "lot": a["lot_code"], "geolocation": a["due_diligence"]["checks"]["plot_geolocation"],
            "production": lot.harvest_date if lot else None, "forest_evidence": a["forest_context"],
            "risk_assessment": a["readiness"], "supporting_evidence": a["due_diligence"]["checks"],
            "verification_history": a["traceability"], "data_quality": lot.data_quality if lot else None,
            "generated_at": datetime.utcnow().isoformat(), "disclaimer": "EUDR Readiness Report — not legal certification"
        }

eudr_guard=EUDRGuardAgent()
