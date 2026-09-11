"""Tactical decision helpers — all deterministic, all explainable.

Every number below must be traceable to an input:
 - water scoring: weighted, weights published, unscored factors listed
 - threat bands: pure ETA thresholds, no hidden model
 - FWI: standard Van Wagner FFMC/ISI, same-day only (previous-day FFMC
   assumed 85 and LABELED as such — no multi-day carryover without history)
 - travel: straight-line distance / assumed rural speed (documented)
Road-network routing (pgRouting) is the documented upgrade once road data +
Postgres exist; until then NO fake turn-by-turn is ever returned.
"""
import math
from typing import Any, Dict, List, Optional

# Water score weights (sum 1.0). Factors without data are NEVER silently
# zeroed — they are listed in `unscored` and excluded from the total.
WATER_WEIGHTS = {
    "distance": 0.35,      # nearer is better
    "capacity": 0.25,      # bigger tank is better
    "direction_safety": 0.20,  # upwind of fire is safer for crews
    "verification": 0.20,  # active status + GPS present
}
ASSUMED_RURAL_SPEED_KMH = 30.0  # documented assumption for travel_time

# Threat bands by estimated hours until fire reaches the asset.
THREAT_BANDS = [(1.0, "CRITICAL"), (3.0, "THREATENED"), (6.0, "WATCH")]
# -> else "SAFE"


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def bearing_deg(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Bearing FROM point 1 TO point 2, degrees from north."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def score_water_sources(fire_lon: float, fire_lat: float, wind_toward_deg: float,
                        waters: List[Dict]) -> Dict[str, Any]:
    """Rank water assets into Priority A/B/C with a published formula.

    direction_safety: asset upwind of the fire (wind blows fire AWAY from
    crews) scores 100; directly downwind scores 0; linear in between.
    verification: 100 if status active (all listed assets are), +GPS always
    present by schema. Road access / terrain / infrastructure are NOT scored
    (no data) — listed under `unscored_factors`, never hidden in the total.
    """
    scored = []
    for w in waters:
        try:
            d = haversine_km(fire_lon, fire_lat, float(w["longitude"]), float(w["latitude"]))
        except Exception:
            continue
        s_dist = max(0.0, 100.0 - d * 8.0)  # 0km=100, ~12.5km+=0
        cap = w.get("capacity_liters") or 0
        try:
            s_cap = min(100.0, float(cap) / 100.0)  # 10.000L = 100
        except Exception:
            s_cap = 0.0
        # angle between wind-toward vector and fire->asset vector
        to_asset = bearing_deg(fire_lon, fire_lat, float(w["longitude"]), float(w["latitude"]))
        ang = abs((to_asset - (wind_toward_deg % 360.0) + 180.0) % 360.0 - 180.0)
        s_dir = round(ang / 180.0 * 100.0, 1)  # 180° (upwind) = 100
        s_ver = 100.0 if (w.get("status") == "active") else 40.0
        total = round(s_dist * WATER_WEIGHTS["distance"] + s_cap * WATER_WEIGHTS["capacity"]
                      + s_dir * WATER_WEIGHTS["direction_safety"] + s_ver * WATER_WEIGHTS["verification"], 1)
        scored.append({
            "id": w.get("id"), "name": w.get("name"), "distance_km": round(d, 2),
            "capacity_liters": cap, "components": {"distance": round(s_dist, 1), "capacity": round(s_cap, 1),
                                                  "direction_safety": s_dir, "verification": s_ver},
            "score": total,
        })
    scored.sort(key=lambda x: x["score"], reverse=True)
    for i, s in enumerate(scored):
        s["priority"] = "A" if i == 0 and s["score"] >= 50 else ("B" if s["score"] >= 35 else "C")
    return {
        "weights": WATER_WEIGHTS,
        "unscored_factors": ["road_access (no road data)", "terrain (no DEM live)",
                             "infrastructure (no dataset)"],
        "ranked": scored,
    }


def threat_band(eta_hours: Optional[float]) -> str:
    if eta_hours is None:
        return "WATCH"
    for limit, band in THREAT_BANDS:
        if eta_hours < limit:
            return band
    return "SAFE"


def assess_asset_threat(fire_lon: float, fire_lat: float, ros_kmh: float,
                        assets: List[Dict]) -> List[Dict]:
    """Per-asset distance / ETA / availability / band. ETA = dist / ROS."""
    out = []
    for a in assets:
        try:
            d = haversine_km(fire_lon, fire_lat, float(a["longitude"]), float(a["latitude"]))
        except Exception:
            continue
        eta = round(d / ros_kmh, 2) if ros_kmh and ros_kmh > 0 else None
        out.append({
            "id": a.get("id"), "name": a.get("name"), "asset_type": a.get("asset_type"),
            "distance_km": round(d, 2), "eta_hours": eta,
            "band": threat_band(eta),
            "availability": "OPERATIONAL" if a.get("status") == "active" else "UNAVAILABLE",
        })
    order = {"CRITICAL": 0, "THREATENED": 1, "WATCH": 2, "SAFE": 3}
    out.sort(key=lambda x: (order.get(x["band"], 9), x["distance_km"]))
    return out


def ffmc_isi_same_day(temp_c: float, humidity_pct: float, wind_kmh: float,
                      rain_mm: float = 0.0, prev_ffmc: float = 85.0) -> Dict[str, Any]:
    """Van Wagner Canadian FWI, FFMC + ISI only, same-day.

    prev_ffmc=85 is the standard starting value, LABELED in the output —
    without multi-day history there is no DMC/DC carryover, so full FWI/BUI
    are NOT computed (returning them would be fabrication).
    """
    fo = max(0.0, min(101.0, prev_ffmc))
    mo = 147.2 * (101.0 - fo) / (59.5 + fo)
    r = max(0.0, rain_mm)
    if r > 0.5:
        rf = r - 0.5
        mr = mo + 42.5 * rf * math.exp(-100.0 / (251.0 - mo)) * (1.0 - math.exp(-6.93 / rf))
        mo = min(mr, 250.0)
    h, t, w = humidity_pct, temp_c, wind_kmh
    ed = 0.942 * (h ** 0.679) + 11.0 * math.exp((h - 100.0) / 10.0) + 0.18 * (21.1 - t) * (1.0 - math.exp(-0.115 * h))
    if mo > ed:
        ko = 0.424 * (1.0 - (h / 100.0) ** 1.7) + 0.0694 * math.sqrt(w) * (1.0 - (h / 100.0) ** 8)
        kd = ko * 0.0579 * math.exp(0.0365 * t)
        m = ed + (mo - ed) * (10.0 ** (-kd))
    else:
        ew = 0.618 * (h ** 0.753) + 10.0 * math.exp((h - 100.0) / 10.0) + 0.18 * (21.1 - t) * (1.0 - math.exp(-0.115 * h))
        if mo < ew:
            kl = 0.424 * (1.0 - ((100.0 - h) / 100.0) ** 1.7) + 0.0694 * math.sqrt(w) * (1.0 - (((100.0 - h) / 100.0) ** 8))
            kw = kl * 0.0579 * math.exp(0.0365 * t)
            m = ew - (ew - mo) * (10.0 ** (-kw))
        else:
            m = mo
    ffmc = 59.5 * (250.0 - m) / (147.2 + m)
    fm = 147.2 * (101.0 - ffmc) / (59.5 + ffmc)
    ff = 19.115 * math.exp(-0.1386 * fm) * (1.0 + (fm ** 5.31) / 4.93e7)
    isi = ff * math.exp(0.05039 * w)
    return {
        "ffmc": round(ffmc, 1), "isi": round(isi, 1),
        "method": "Van Wagner (FFMC/ISI same-day)",
        "assumption": f"previous-day FFMC assumed {prev_ffmc} (no multi-day history); DMC/DC/BUI not computed",
    }


def travel_minutes(distance_km: float, speed_kmh: float = ASSUMED_RURAL_SPEED_KMH) -> float:
    return round(distance_km / speed_kmh * 60.0, 1)


# ── Curated water scoring per ops spec (40/30/20/10, A/B/C) ──────────
# distance: 100 at 0km → 0 at 25km+ (linear, published)
# capacity tiers: >=100M=100, >=10M=80, >=1M=60, >=100K=40, >0=20, unknown=0
# road_access: True=100 else 0 (unknown counts as no — documented)
# infra: verified=100 else 0 (manager known is necessary but not sufficient)
# Priority: A if score>=80, B if 50-79, C if <50 OR status != verified.
SPEC_WATER_WEIGHTS = {"distance": 0.40, "capacity": 0.30, "road_access": 0.20, "infrastructure": 0.10}
ROAD_FACTOR = 1.3  # winding-road multiplier for ETA (documented assumption)


def _capacity_score(cap_m3) -> float:
    try:
        c = float(cap_m3)
    except Exception:
        return 0.0
    if c >= 100_000_000:
        return 100.0
    if c >= 10_000_000:
        return 80.0
    if c >= 1_000_000:
        return 60.0
    if c >= 100_000:
        return 40.0
    if c > 0:
        return 20.0
    return 0.0


def score_water_spec(fire_lon: float, fire_lat: float, wind_toward_deg: float,
                     waters: list) -> dict:
    """Spec scoring over curated water_assets (+compatible dicts).

    Each entry needs: name, longitude, latitude, capacity_m3 (or None),
    road_access (bool), status. Returns ranked list with components shown.
    """
    scored = []
    for w in waters:
        get = (lambda k, d=None: w.get(k, d)) if isinstance(w, dict) else (lambda k, d=None: getattr(w, k, d))
        try:
            d = haversine_km(fire_lon, fire_lat, float(get("longitude")), float(get("latitude")))
        except Exception:
            continue
        s_dist = max(0.0, 100.0 - d * 4.0)
        s_cap = _capacity_score(get("capacity_m3"))
        s_road = 100.0 if get("road_access") else 0.0
        verified = str(get("status") or "") == "verified"
        s_infra = 100.0 if verified else 0.0
        total = round(s_dist * SPEC_WATER_WEIGHTS["distance"] + s_cap * SPEC_WATER_WEIGHTS["capacity"]
                      + s_road * SPEC_WATER_WEIGHTS["road_access"] + s_infra * SPEC_WATER_WEIGHTS["infrastructure"], 1)
        to_w = bearing_deg(fire_lon, fire_lat, float(get("longitude")), float(get("latitude")))
        ang = abs((to_w - (wind_toward_deg % 360.0) + 180.0) % 360.0 - 180.0)
        downwind = ang < 45.0
        if not verified or total < 50:
            prio = "C"
        elif total >= 80:
            prio = "A"
        else:
            prio = "B"
        scored.append({
            "id": get("id"), "name": get("name"), "asset_type": get("asset_type", "water"),
            "distance_km": round(d, 2),
            "capacity_m3": get("capacity_m3"), "road_access": bool(get("road_access")),
            "status": get("status"), "manager": get("manager"),
            "components": {"distance": round(s_dist, 1), "capacity": s_cap,
                           "road_access": s_road, "infrastructure": s_infra},
            "score": total, "priority": prio, "downwind": downwind,
        })
    scored.sort(key=lambda x: ({"A": 0, "B": 1, "C": 2}[x["priority"]], -x["score"]))
    return {
        "weights": SPEC_WATER_WEIGHTS,
        "formula": "0.40*distance + 0.30*capacity + 0.20*road + 0.10*infra; A>=80, B 50-79, C<50 hoặc chưa xác minh",
        "ranked": scored,
    }


def road_eta_minutes(distance_km: float, speed_kmh: float = ASSUMED_RURAL_SPEED_KMH) -> float:
    """ETA with winding-road factor (documented, not pgRouting)."""
    return round(distance_km * ROAD_FACTOR / speed_kmh * 60.0, 1)
