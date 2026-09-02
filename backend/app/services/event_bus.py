"""Event Bus Sec113-115 idempotency."""
import hashlib, json
from collections import defaultdict
from typing import Dict, List, Callable
_seen=set()
_subscribers=defaultdict(list)
def subscribe(event:str, handler:Callable): _subscribers[event].append(handler)
def publish(event:str, payload:Dict, priority:str="MEDIUM"):
    eid=hashlib.sha256(f"{event}:{json.dumps(payload,sort_keys=True)}".encode()).hexdigest()[:16]
    if eid in _seen: return {"event_id": eid, "duplicate": True}
    _seen.add(eid)
    results=[]
    for h in _subscribers.get(event,[]):
        try: results.append(h(payload))
        except: pass
    return {"event_id": eid, "priority": priority, "results": results}
def idempotency_key(event:str, payload:Dict)->str:
    return hashlib.sha256(f"{event}:{json.dumps(payload,sort_keys=True)}".encode()).hexdigest()
