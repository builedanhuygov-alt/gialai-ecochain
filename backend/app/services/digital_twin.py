"""Digital Twin Sec15-16."""
from typing import Dict, List
def twin_layers(administrative_unit_id:str, time_point:str="2026-09")->Dict:
    layers=["Administrative","Forest","Terrain","Water","Agriculture","Farms","Infrastructure","Roads","Disasters","Carbon","Supply Chain","Logistics"]
    return {"administrative_unit_id": administrative_unit_id, "time": time_point, "layers": {l: "active" for l in layers}, "note": "EcoGL Digital Twin — provincial model"}
def time_machine(periods:List[str])->Dict[str, Dict]:
    # Sec16 time machine 2024->2027 forecast
    out={}
    for p in periods:
        out[p]={"forest": "historical" if p<"2026" else "forecast" if p>"2026" else "current"}
    return out
