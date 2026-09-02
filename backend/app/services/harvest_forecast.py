"""Harvest & carbon scenario Sec25-29."""
import random, hashlib
def carbon_forecast(current_stock:float, area_restored_ha:float=1000)->dict:
    seq= area_restored_ha * 150 * 0.47 * 0.3
    return {"current": current_stock, "projected_sequestration": round(seq,1), "note": "Scenario estimate, not credit issuance"}
def harvest_logistics(expected_tons:int, trucks:int, capacity:int)->dict:
    bottleneck= "Factory B" if expected_tons>8000 else None
    return {"expected_tons": expected_tons, "trucks": trucks, "capacity": capacity, "bottleneck": bottleneck, "alert": "Potential logistics bottleneck" if bottleneck else None}
def supply_chain_twin(farms:int, collections:int, factories:int, warehouses:int)->dict:
    nodes=[{"type":"FARMS","count":farms,"capacity":farms*5},{"type":"COLLECTION","count":collections},{"type":"FACTORIES","count":factories},{"type":"WAREHOUSES","count":warehouses}]
    return {"nodes": nodes, "risk_score": {"farm":12,"forest":8,"road":21,"factory":10,"traceability":4,"eudr":7,"overall":"LOW"}}
