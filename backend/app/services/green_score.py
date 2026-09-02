"""Green scores — farm/commune Sec29-33."""
from __future__ import annotations
import json, random, hashlib
from sqlalchemy.orm import Session

def farm_green_score(traceability:int, forest_safety:int, carbon:int, logistics:int, data_quality:int)->dict:
    overall=int((traceability*0.2+forest_safety*0.2+carbon*0.15+logistics*0.15+data_quality*0.3))
    return {"traceability":traceability,"forest_safety":forest_safety,"carbon":carbon,"logistics":logistics,"data_quality":data_quality,"overall":overall}

def commune_green_score(forest:int, carbon:int, disaster:int, community:int, traceability:int, logistics:int)->dict:
    overall=int((forest*0.2+disaster*0.15+community*0.15+traceability*0.2+carbon*0.15+logistics*0.15))
    return {"forest":forest,"carbon":carbon,"disaster":disaster,"community":community,"traceability":traceability,"logistics":logistics,"overall":overall}

def overall_eco_score(scores:dict, weights:dict|None=None)->int:
    w=weights or {"forest":0.2,"disaster":0.15,"community":0.15,"traceability":0.2,"carbon":0.15,"logistics":0.15}
    return int(sum(scores.get(k,50)*v for k,v in w.items()))
