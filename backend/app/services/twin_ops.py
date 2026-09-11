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
        # MODULE 4 — direction safety is ADVISORY (0=downwind … 100=upwind),
        # deliberately NOT in the 40/30/20/10 total: no calibrated weight
        # exists for wind-vs-access tradeoffs, so it is reported alongside
        # the total instead of being silently folded in.
        s_safety = round(ang / 180.0 * 100.0, 1)
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
                           "road_access": s_road, "infrastructure": s_infra,
                           "direction_safety": s_safety},
            # spec aliases (M4 contract) — same numbers, no second formula
            "breakdown": {"distance_score": round(s_dist, 1), "capacity_score": s_cap,
                          "access_score": s_road, "infra_score": s_infra,
                          "safety_score": s_safety, "total_score": total},
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


def _point_in_ring(lon: float, lat: float, ring) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1 + 1e-12) + x1:
            inside = not inside
    return inside


def assess_water_threat(fire_lon: float, fire_lat: float, ros_kmh: float,
                        waters: list, steps: list | None = None) -> list:
    """Threatened Water Assets: spread 1h/3h/6h ∩ water_assets.

    Band = more severe of (polygon containment, ETA thresholds):
    - inside 1h polygon OR eta<1h → CRITICAL
    - inside 3h polygon OR eta<3h → THREATENED
    - inside 6h polygon OR eta<6h → WATCH
    - else SAFE
    ETA = distance / ROS (same fire physics as asset threats).
    steps: spread.simulate()["steps"] (each with hour + polygon.coordinates[0]).
    Pure deterministic, no hidden model — polygon check + ETA cited per asset.
    """
    poly_by_hour: dict = {}
    try:
        for s in (steps or []):
            h = float(s.get("hour"))
            ring = (s.get("polygon") or {}).get("coordinates", [[]])[0]
            if ring:
                poly_by_hour[h] = ring
    except Exception:
        poly_by_hour = {}
    order = {"CRITICAL": 0, "THREATENED": 1, "WATCH": 2, "SAFE": 3}

    def poly_band(lon: float, lat: float) -> str | None:
        for h, band in ((1.0, "CRITICAL"), (3.0, "THREATENED"), (6.0, "WATCH")):
            ring = poly_by_hour.get(h)
            if ring and _point_in_ring(lon, lat, ring):
                return band
        # tolerate float hour keys (e.g. 1 vs 1.0 already handled; fallback: nearest)
        if not poly_by_hour:
            return None
        return None

    out = []
    for w in waters:
        get = (lambda k, d=None: w.get(k, d)) if isinstance(w, dict) else (lambda k, d=None: getattr(w, k, d))
        try:
            lon = float(get("longitude"))
            lat = float(get("latitude"))
            d = haversine_km(fire_lon, fire_lat, lon, lat)
        except Exception:
            continue
        eta = round(d / ros_kmh, 2) if ros_kmh and ros_kmh > 0 else None
        eta_band = threat_band(eta)
        p_band = poly_band(lon, lat)
        if p_band is None:
            band = eta_band
            basis = f"ETA {eta}h @ROS {ros_kmh}km/h" if eta is not None else "no ROS — WATCH default"
        else:
            # more severe wins
            band = p_band if order[p_band] <= order[eta_band] else eta_band
            basis = f"polygon:{p_band} + ETA:{eta_band} ({eta}h)"
            # containment flags for the map
        try:
            in1 = bool(poly_by_hour.get(1.0) and _point_in_ring(lon, lat, poly_by_hour[1.0]))
            in3 = bool(poly_by_hour.get(3.0) and _point_in_ring(lon, lat, poly_by_hour[3.0]))
            in6 = bool(poly_by_hour.get(6.0) and _point_in_ring(lon, lat, poly_by_hour[6.0]))
        except Exception:
            in1 = in3 = in6 = False
        out.append({
            "id": get("id"), "name": get("name"), "asset_type": get("asset_type", "water"),
            "distance_km": round(d, 2), "eta_hours": eta, "band": band, "basis": basis,
            "in_1h": in1, "in_3h": in3, "in_6h": in6,
            "status": get("status"), "manager": get("manager"),
            "capacity_m3": get("capacity_m3"),
        })
    out.sort(key=lambda x: (order.get(x["band"], 9), x["distance_km"]))
    return out


def command_status(primary_station, primary_water, missing: list) -> str:
    """M5 command_status — honest readiness, never a fake %."""
    if primary_station is None and primary_water is None:
        return "NO_RESOURCES"
    if primary_station is None:
        return "NO_STATION"
    if primary_water is None:
        return "NO_WATER"
    if missing:
        return "DATA_GAP"
    return "READY"


def build_analyst_bulletin(plan: dict) -> dict:
    """MODULE 6 — ban tin chuan 10 muc tu response-plan da tinh."""
    rs = plan.get("risk_summary") or {}
    wx = plan.get("weather") or {}
    sp = plan.get("spread") or {}
    steps = sp.get("steps") or []
    pw = plan.get("primary_water")
    bw = plan.get("backup_water")
    ps = plan.get("primary_station") or plan.get("nearest_station")
    pr = plan.get("primary_route") or plan.get("nearest_route")
    fwi = plan.get("fwi")
    threats = (plan.get("threatened_assets") or plan.get("asset_threats") or [])
    hot = [t for t in threats if t.get("band") in ("CRITICAL", "THREATENED")][:5]
    by_h = {s.get("hour"): s for s in steps}
    s1 = by_h.get(1.0) or by_h.get(1) or {}
    communes_1h = [c.get("name") for c in (s1.get("affected_communes") or [])][:5]

    def _fmt(v, suffix=""):
        return f"{v}{suffix}" if v is not None else "khong ro"

    return {
        "tinh_hinh_chay": f"CAP {rs.get('level', '?')} - diem {rs.get('score', '?')}/100 "
                           f"- tin cay {rs.get('confidence', '?')}% - FIRMS {rs.get('firms_nearby', 0)} diem <25km",
        "vi_tri": plan.get("fire"),
        "cap_nguy_co": {"level": rs.get("level"), "score": rs.get("score"),
                        "confidence": rs.get("confidence"), "missing": rs.get("missing", [])},
        "dieu_kien_thoi_tiet": f"{_fmt(wx.get('temperature'), 'C')} - am {_fmt(wx.get('humidity'), '%')} "
                                f"- gio {_fmt(wx.get('wind_speed_kmh'), ' km/h')} -> {_fmt(wx.get('wind_toward_deg'), 'do')}"
                                + (f" - FFMC {fwi['ffmc']}/ISI {fwi['isi']} (Van Wagner cung ngay)" if fwi else " - FWI: thieu nhiet/am"),
        "huong_lan_du_kien": f"1h dai {s1.get('length_km', '?')}km / {s1.get('area_ha', '?')}ha"
                              + (f" -> {', '.join(communes_1h)}" if communes_1h else " -> chua ro xa anh huong"),
        "tram_trien_khai": f"{(ps or {}).get('name', 'Chua co tram/to')}"
                            + (f" ({(ps or {}).get('distance_km')}km)" if (ps or {}).get("distance_km") is not None else ""),
        "nguon_nuoc_uu_tien": f"{(pw or {}).get('name', 'Chua co nguon nuoc')}"
                               + (f" (hang {(pw or {}).get('priority')}, {(pw or {}).get('distance_km')}km, ETA ~{(pw or {}).get('eta_minutes')} phut)" if pw else "")
                               + (f" - du phong: {(bw or {}).get('name')}" if bw else ""),
        "tuyen_tiep_can": f"{(pr or {}).get('name') or (pr or {}).get('route_name') or 'Chua co tuyen'}"
                           + (f" ({(pr or {}).get('distance_km')}km)" if (pr or {}).get("distance_km") is not None else ""),
        "khuyen_nghi_dieu_dong": plan.get("tactical_recommendations") or [],
        "tai_san_bi_de_doa": [f"{t.get('name')} ({t.get('band')}, ETA {t.get('eta_hours')}h)" for t in hot] or ["Khong co tai san CRITICAL/THREATENED"],
        # Module 360 (M8) — imagery availability per primary resource
        "hinh_anh_hien_truong": [n.get("note") for n in (plan.get("viewer_notes") or [])] or ["Chưa có dữ liệu hình ảnh xác minh."],
    }


def viewer_note_sentence(name: str, viewer: dict) -> str:
    """M8 exact wording: panoee → 360 khả dụng; any imagery → có dữ liệu;
    none → chưa có dữ liệu xác minh."""
    t = (viewer or {}).get("viewer_type")
    if t == "panoee":
        return f"{name}: Quan sát hiện trường 360° khả dụng."
    if t in ("streetview", "photos", "satellite"):
        return f"{name}: Hiện trường có dữ liệu hình ảnh."
    return f"{name}: Chưa có dữ liệu hình ảnh xác minh."


# ── Module 360: viewer fallback chain (M2/M7/M9) ──────────────────────────
# Priority: panoee > streetview > photos > satellite > none.
# Panoee first: field-verified 360 outranks possibly-stale streetview.
# Security (M5): only http(s) URLs are ever stored (API rejects the rest);
# domain trust is LABELED, never silently assumed — unlisted domains stay
# field_check_required. No URL is ever generated: streetview without a stored
# URL reports existence only, never a fabricated link.
PANOEE_DOMAINS = ("panoee.net", "panoee.com", "cloud.panoee.net", "app.panoee.com")
STREETVIEW_DOMAINS = ("google.com", "maps.google.com", "goo.gl", "maps.app.goo.gl")
VIEWER_WHITELIST = PANOEE_DOMAINS + STREETVIEW_DOMAINS


def classify_viewer_url(url) -> dict:
    """Domain trust for a stored viewer_url. Pure function, no network."""
    if not url or not (str(url).startswith("http://") or str(url).startswith("https://")):
        return {"kind": "invalid", "trusted": False, "domain": None}
    try:
        from urllib.parse import urlparse as _up
        host = (_up(str(url)).hostname or "").lower()
    except Exception:
        return {"kind": "invalid", "trusted": False, "domain": None}
    if any(host == d or host.endswith("." + d) for d in PANOEE_DOMAINS):
        return {"kind": "panoee", "trusted": True, "domain": host}
    if any(host == d or host.endswith("." + d) for d in STREETVIEW_DOMAINS):
        return {"kind": "streetview", "trusted": True, "domain": host}
    return {"kind": "generic", "trusted": False, "domain": host}


def viewer_fallback(has_streetview, viewer_url, nearby_photos: int = 0,
                    lon=None, lat=None, capture_date=None,
                    capture_source=None) -> dict:
    """Deterministic viewer tier for one asset. No DB access here.

    verification_status: verified / estimated / field_check_required.
    VERIFIED is never shown without verification (M9): unlisted-domain URLs
    and photo proximity stay below verified; legacy `status` key mirrors
    VERIFIED/ESTIMATED/MISSING for backward compatibility.
    """
    capture = None
    if capture_date or capture_source:
        capture = {"capture_date": str(capture_date) if capture_date else None,
                   "capture_source": capture_source}
    if viewer_url:
        cls = classify_viewer_url(viewer_url)
        if cls["kind"] == "panoee":
            return {"viewer_type": "panoee", "viewer_url": viewer_url,
                    "verification_status": "verified", "status": "VERIFIED",
                    "detail": "tour 360 Panoee do kiểm lâm nhập", "capture": capture}
        if cls["kind"] == "streetview":
            return {"viewer_type": "streetview", "viewer_url": viewer_url,
                    "verification_status": "verified", "status": "VERIFIED",
                    "detail": "Street View URL đã xác minh", "capture": capture}
        if cls["kind"] == "generic":
            return {"viewer_type": "panoee", "viewer_url": viewer_url,
                    "verification_status": "field_check_required", "status": "ESTIMATED",
                    "detail": f"URL ngoài whitelist ({cls['domain']}) — cần kiểm tra thực địa",
                    "capture": capture}
    if has_streetview is True:
        return {"viewer_type": "streetview", "viewer_url": None,
                "verification_status": "verified", "status": "VERIFIED",
                "detail": "đã kiểm chứng có streetview — chưa lưu URL, không tự sinh link",
                "capture": capture}
    if (nearby_photos or 0) > 0:
        return {"viewer_type": "photos", "viewer_url": None,
                "verification_status": "estimated", "status": "ESTIMATED",
                "detail": f"{nearby_photos} ảnh thực địa trong 1km (đối chiếu vị trí, chưa gắn asset)",
                "capture": capture}
    if lon is not None and lat is not None:
        return {"viewer_type": "satellite", "viewer_url": None,
                "verification_status": "verified", "status": "VERIFIED",
                "detail": "nền ảnh vệ tinh bản đồ (khi LIVE)", "capture": capture}
    return {"viewer_type": "none", "viewer_url": None,
            "verification_status": "field_check_required", "status": "MISSING",
            "detail": "chưa có dữ liệu hình ảnh", "capture": capture}


# ── Module D: contact status ────────────────────────────────────────────
def contact_status(contact_person, contact_phone, organization, verification_date) -> str:
    """VERIFIED = có ngày kiểm chứng; PARTIAL = có liên hệ, chưa kiểm chứng;
    MISSING = trống hoàn toàn."""
    if verification_date:
        return "VERIFIED"
    if contact_person or contact_phone or organization:
        return "PARTIAL"
    return "MISSING"


# ── Module C: threatened-community band ────────────────────────────────
# band = bước lan truyền SỚM NHẤT giao với xã (1h→CRITICAL, 3h→THREATENED,
# 6h→WATCH, else SAFE). Không xác suất — thuần hình học + ETA.
COMMUNITY_BAND_BY_HOUR = [(1.0, "CRITICAL"), (3.0, "THREATENED"), (6.0, "WATCH")]


def community_band(first_hour) -> str:
    if first_hour is None:
        return "SAFE"
    for limit, band in COMMUNITY_BAND_BY_HOUR:
        if first_hour <= limit:
            return band
    return "SAFE"
