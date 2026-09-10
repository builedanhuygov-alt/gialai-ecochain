"""Model switching Sec64-66 — version registry + switch history.

Honest semantics: `available` lists ONLY versions that really exist in code
(today: v1.0 everywhere — see README agent table). Switching to an unknown
version/agent is rejected instead of silently pretending. Agent factories
consult `get_active()` so future versions take effect for real; unknown
versions fall back to v1.0 with a warning.
"""
import logging
from datetime import datetime
from app.core.time import utcnow
from typing import Dict, List

logger = logging.getLogger(__name__)

# The only implementations that exist in code today.
AVAILABLE: Dict[str, List[str]] = {
    "ForestGuard": ["v1.0"],
    "FireRisk": ["v1.0"],
    "DisasterGuard": ["v1.0"],
    "CarbonGuard": ["v1.0"],
    "EUDRGuard": ["v1.0"],
}

_active: Dict[str, str] = {agent: versions[0] for agent, versions in AVAILABLE.items()}
_history: List[Dict] = []


def get_active(agent: str) -> str:
    return _active.get(agent, "v1.0")


def resolve_version(agent: str) -> str:
    """Version agent factories should run. Falls back to v1.0 with a warning."""
    ver = get_active(agent)
    if ver not in AVAILABLE.get(agent, ["v1.0"]):
        logger.warning("Unknown active version %s for %s — falling back to v1.0", ver, agent)
        return "v1.0"
    return ver


def switch(agent: str, version: str) -> str:
    if agent not in AVAILABLE:
        raise ValueError(f"Unknown agent: {agent}. Known: {sorted(AVAILABLE)}")
    if version not in AVAILABLE[agent]:
        raise ValueError(f"Version {version} does not exist for {agent}. Available: {AVAILABLE[agent]}")
    _active[agent] = version
    _history.append({"agent": agent, "version": version, "at": utcnow().isoformat()})
    del _history[:-20]
    return version


def switch_history(limit: int = 20):
    return _history[-limit:]


def list_models():
    return [
        {"agent": agent, "active": _active[agent], "available": AVAILABLE[agent]}
        for agent in AVAILABLE
    ]


def get_mode() -> str:
    from app.core.config import get_settings

    return "DEMO" if get_settings().is_demo else "REAL"


def describe_mode(instance_override: str | None = None) -> Dict:
    """Effective mode + where it comes from (env is persistent, override is not)."""
    if instance_override:
        return {
            "mode": instance_override,
            "source": "instance-override",
            "persistent": False,
            "note": "In-memory instance scope only — resets on restart; on serverless each instance may differ. Set DEMO_MODE env for a persistent change.",
        }
    from app.core.config import get_settings

    return {
        "mode": get_mode(),
        "source": "env DEMO_MODE",
        "persistent": True,
        "demo": get_settings().is_demo,
    }
