"""Single source of truth for wildfire risk scoring (GIALAI EcoChain).

Everything that displays a risk score/level (dashboard, map, alerts,
backtest, what-if, grid) must go through :func:`compute_score`.

Rules:
- Pure + deterministic: no randomness, no hidden defaults counted as data.
- Missing factors are EXCLUDED and remaining weights are renormalized
  (``renormalize=True``). Legacy callers that need the old neutral-default
  behaviour pass ``renormalize=False``.
- ``estimated_inputs`` lists every factor computed from a fallback default.
- ``data_completeness`` in [0,1] must be shown on UI next to the score.
- ``origin`` is caller-supplied provenance: "LIVE", "USER_INPUT" or
  "DEMO / SIMULATED". This module never invents provenance.
- Labels: Vietnamese fire-warning levels I..V, thresholds 20/40/60/80.
- Disclaimer: "Chi so tham khao, trong so chua hieu chuan"
  (reference index, weights not calibrated — see backtest module).
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.fire_risk_config import WEIGHTS

LEVELS = ("I", "II", "III", "IV", "V")
THRESHOLD_LEVELS = ((20, "I"), (40, "II"), (60, "III"), (80, "IV"), (100, "V"))
VALID_ORIGINS = ("LIVE", "USER_INPUT", "DEMO / SIMULATED")


def score_to_level(score: int) -> str:
    if score <= 20:
        return "I"
    if score <= 40:
        return "II"
    if score <= 60:
        return "III"
    if score <= 80:
        return "IV"
    return "V"


# Neutral computation stand-ins. Used ONLY for arithmetic when
# renormalize=False (legacy). NEVER counted as real data.
_DEFAULTS = {
    "ndvi": 0.6, "ndmi": 0.3, "nbr": 0.2,
    "temperature": 30.0, "humidity": 60.0, "rainfall": 5.0, "wind_speed": 10.0,
    "slope": 10.0, "elevation": 300.0,
}


@dataclass
class FireRiskInput:
    """All inputs optional. None = not observed (missing)."""

    ndvi: Optional[float] = None
    ndmi: Optional[float] = None
    nbr: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    rainfall: Optional[float] = None
    wind_speed: Optional[float] = None
    slope: Optional[float] = None
    elevation: Optional[float] = None
    hotspot_count: int = 0  # real FIRMS detections after artificial filtering
    firms_observed: bool = False  # True if the FIRMS source was actually queried
    community_count: int = 0  # verified community confirmations
    community_observed: bool = False
    historical_fire: bool = False
    historical_observed: bool = False


@dataclass
class FireRiskResult:
    score: Optional[int]  # None when nothing was observed
    level: Optional[str]  # I..V or None
    factors: Dict[str, str]  # human-readable drivers, e.g. {"Fuel Dryness": "+30%"}
    breakdown: Dict[str, float]  # per-factor 0..100 sub-scores (observed only)
    weights_used: Dict[str, float]  # renormalized weights actually applied
    missing: List[str]  # factor names without real data
    estimated_inputs: List[str]  # raw input names filled from defaults
    data_completeness: float  # 0..1 fraction of factors observed
    origin: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "score": self.score,
            "level": self.level,
            "factors": self.factors,
            "breakdown": self.breakdown,
            "weights_used": self.weights_used,
            "missing": self.missing,
            "estimated_inputs": self.estimated_inputs,
            "data_completeness": round(self.data_completeness, 3),
            "origin": self.origin,
            "disclaimer": "Chi so tham khao, trong so chua hieu chuan",
        }


def _factor_scores(inp: FireRiskInput) -> Dict[str, float]:
    """Per-factor 0..100 sub-scores. Mirrors the legacy engine formula."""
    ndvi = inp.ndvi if inp.ndvi is not None else _DEFAULTS["ndvi"]
    ndmi = inp.ndmi if inp.ndmi is not None else _DEFAULTS["ndmi"]
    nbr = inp.nbr if inp.nbr is not None else _DEFAULTS["nbr"]
    temp = inp.temperature if inp.temperature is not None else _DEFAULTS["temperature"]
    humidity = inp.humidity if inp.humidity is not None else _DEFAULTS["humidity"]
    rainfall = inp.rainfall if inp.rainfall is not None else _DEFAULTS["rainfall"]
    wind = inp.wind_speed if inp.wind_speed is not None else _DEFAULTS["wind_speed"]
    slope = inp.slope if inp.slope is not None else _DEFAULTS["slope"]

    fuel = max(0.0, min(100.0, (0.7 - ndvi) * 120 + (0.4 - ndmi) * 80))
    if nbr is not None and nbr < -0.1:
        fuel = min(100.0, fuel + 5)
    weather = max(0.0, min(100.0, (temp - 28) * 4 + (60 - humidity) * 0.8))
    firms = 70.0 if inp.hotspot_count > 0 else 10.0
    wind_s = min(100.0, wind * 3)
    rain = max(0.0, min(100.0, (10 - rainfall) * 6))
    terrain = min(100.0, slope * 2)
    hist = 50.0 + (20.0 if inp.historical_fire else 0.0) + (inp.community_count * 5)
    return {
        "fuel_dryness": fuel,
        "weather_danger": weather,
        "firms_proximity": firms,
        "wind": wind_s,
        "rainfall_deficit": rain,
        "terrain": terrain,
        "historical_community": hist,
    }


# Which raw inputs back each factor (for estimated_inputs tracking).
_FACTOR_INPUTS = {
    "fuel_dryness": ("ndvi", "ndmi", "nbr"),
    "weather_danger": ("temperature", "humidity"),
    "firms_proximity": (),
    "wind": ("wind_speed",),
    "rainfall_deficit": ("rainfall",),
    "terrain": ("slope",),
    "historical_community": (),
}


def _factor_observed(factor: str, inp: FireRiskInput) -> bool:
    if factor == "fuel_dryness":
        return inp.ndvi is not None  # NDVI presence marks satellite observed
    if factor == "weather_danger":
        return inp.temperature is not None
    if factor == "firms_proximity":
        return inp.firms_observed
    if factor == "wind":
        return inp.wind_speed is not None
    if factor == "rainfall_deficit":
        return inp.rainfall is not None
    if factor == "terrain":
        return inp.slope is not None
    if factor == "historical_community":
        return inp.historical_observed or inp.community_observed
    return False


def compute_score(inp: FireRiskInput, *, origin: str = "LIVE", renormalize: bool = True) -> FireRiskResult:
    """Compute the wildfire risk score. Deterministic, no randomness."""
    if origin not in VALID_ORIGINS:
        raise ValueError(f"origin must be one of {VALID_ORIGINS}")
    sub = _factor_scores(inp)
    observed = {f: _factor_observed(f, inp) for f in sub}
    missing = [f for f, ok in observed.items() if not ok]

    raw = {f: inp.__dict__.get(k) for f in _FACTOR_INPUTS for k in _FACTOR_INPUTS[f]}
    estimated = sorted({k for f in missing for k in _FACTOR_INPUTS[f] if raw.get(k) is None})
    if renormalize:
        usable = [f for f in sub if observed[f]]
        if not usable:
            return FireRiskResult(
                score=None, level=None, factors={}, breakdown={},
                weights_used={}, missing=missing, estimated_inputs=estimated,
                data_completeness=0.0, origin=origin,
            )
        wsum = sum(WEIGHTS[f] for f in usable)
        weights = {f: WEIGHTS[f] / wsum for f in usable}
        total = sum(sub[f] * weights[f] for f in usable)
        breakdown = {f: round(sub[f], 2) for f in usable}
    else:
        weights = dict(WEIGHTS)
        total = sum(sub[f] * WEIGHTS[f] for f in sub)
        breakdown = {f: round(v, 2) for f, v in sub.items()}

    score = int(max(0, min(100, total)))
    level = score_to_level(score)

    # Human-readable drivers (only from observed factors).
    factors: Dict[str, str] = {}
    labels = {
        "fuel_dryness": "Fuel Dryness", "weather_danger": "Weather danger",
        "firms_proximity": "FIRMS proximity", "wind": "Wind",
        "rainfall_deficit": "Rainfall deficit", "terrain": "Terrain",
        "historical_community": "History/community",
    }
    if observed["fuel_dryness"] and sub["fuel_dryness"] > 60:
        factors[labels["fuel_dryness"]] = "+30%"
    if observed["weather_danger"] and sub["weather_danger"] > 60:
        factors[labels["weather_danger"]] = "+20%"
    if observed["firms_proximity"] and sub["firms_proximity"] > 50:
        factors[labels["firms_proximity"]] = "+15%"
    if observed["wind"] and (inp.wind_speed or 0) > 18:
        factors[labels["wind"]] = "+10%"
    if observed["rainfall_deficit"] and (inp.rainfall if inp.rainfall is not None else 99) < 2:
        factors[labels["rainfall_deficit"]] = "+10%"
    if observed["terrain"] and (inp.slope or 0) > 20:
        factors[labels["terrain"]] = "+10%"
    if inp.nbr is not None and inp.nbr < -0.25:
        factors["NBR burn scar"] = "detected"

    completeness = sum(1 for ok in observed.values() if ok) / len(observed)
    return FireRiskResult(
        score=score, level=level, factors=factors, breakdown=breakdown,
        weights_used={k: round(v, 4) for k, v in weights.items()},
        missing=missing, estimated_inputs=estimated,
        data_completeness=completeness, origin=origin,
    )


def input_from_legacy(
    satellite: Optional[Dict[str, Any]] = None,
    weather: Optional[Dict[str, Any]] = None,
    terrain: Optional[Dict[str, Any]] = None,
    hotspots: Optional[List[Dict[str, Any]]] = None,
    community: int = 0,
    historical: Optional[Dict[str, Any]] = None,
    sources_available: Optional[Dict[str, bool]] = None,
) -> FireRiskInput:
    """Adapt the legacy analyze() argument shape to FireRiskInput."""
    satellite = satellite or {}
    weather = weather or {}
    terrain = terrain or {}
    raw = hotspots or []
    real = [h for h in raw if not h.get("suspect_artificial")]
    src = sources_available or {}
    firms_obs = src.get("firms", bool(real)) if sources_available else bool(real)
    return FireRiskInput(
        ndvi=satellite.get("ndvi"), ndmi=satellite.get("ndmi"), nbr=satellite.get("nbr"),
        temperature=weather.get("temperature"), humidity=weather.get("humidity"),
        rainfall=weather.get("rainfall"), wind_speed=weather.get("wind_speed"),
        slope=terrain.get("slope"), elevation=terrain.get("elevation"),
        hotspot_count=len(real), firms_observed=firms_obs,
        community_count=community or 0, community_observed=bool(community),
        historical_fire=bool(historical), historical_observed=historical is not None,
    )
