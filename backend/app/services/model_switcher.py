"""Model switching Sec64-66 — active model per agent, demo/real mode."""
from typing import Dict
_active: Dict[str, str] = {
    "ForestGuard": "v1.0",
    "FireRisk": "v1.0",
    "DisasterGuard": "v1.0",
    "CarbonGuard": "v1.0",
    "EUDRGuard": "v1.0",
}
_modes = {"DEMO": True, "REAL": False}  # DEMO_MODE true = demo

def get_active(agent:str)->str:
    return _active.get(agent, "v1.0")

def switch(agent:str, version:str)->str:
    _active[agent]=version
    return version

def list_models():
    return [{"agent":k, "active":v, "available":["v1.0","v1.1","v2.0"]} for k,v in _active.items()]

def get_mode()->str:
    from app.core.config import get_settings
    return "DEMO" if get_settings().is_demo else "REAL"

def set_mode(mode:str):
    from app.core.config import get_settings
    s=get_settings()
    # cannot directly set, but we can set env for next restart — for demo we toggle in-memory flag via DEMO_MODE
    # For now, just return
    return mode
