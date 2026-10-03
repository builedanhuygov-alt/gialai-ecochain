"""Part B — fire-scenario simulator API (decision support, NOT physics).

POST /api/simulate/fire takes What-if sliders (ignition + wind + temperature +
rain + fuel load) and returns spread ellipses + threatened communities/assets +
route impacts + water access current-vs-simulated + wind layer + impact panel,
in ONE round trip. No probabilities, no mock GPS, no fake road network.
"""
import json as _json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.database import get_db

router = APIRouter(tags=["FireSim"])

# B1 ellipse colors + B3/B4 band colors (single mapping).
STEP_COLORS = {0.0: "#DC2626", 1.0: "#F97316", 3.0: "#FACC15", 6.0: "#525252", 12.0: "#1E293B"}
BAND_COLORS = {"CRITICAL": "#DC2626", "THREATENED": "#F97316",
               "WATCH": "#FACC15", "SAFE": "#3B82F6"}


def _route_vertices(geometry_text):
    try:
        g = _json.loads(geometry_text) if geometry_text else None
    except Exception:
        return []
    if not g:
        return []
    lines = [g["coordinates"]] if g.get("type") == "LineString" else g.get("coordinates", [])
    pts = []
    for line in lines or []:
        for p in line or []:
            try:
                pts.append((float(p[0]), float(p[1])))
            except Exception:
                continue
    return pts


@router.post("/simulate/fire")
def simulate_fire(body: dict, db: Session = Depends(get_db)):
    """Scenario sliders → ellipses 1/3/6h + full tactical impact.

    Required: lon, lat. Optional: wind_speed_kmh (15), wind_direction_deg (45),
    slope_deg (12), temperature_c, rain_mm, forest_loss_ha, hours ([1,3,6]),
    closed_route_ids (list — scenario road closure), min_water_capacity_m3.
    """
    from app.models.ops import OperationalAsset
    from app.models.water import WaterAsset
    from app.services import spread as spread_svc
    from app.services import twin_ops as ops
    from app.services.village_fire import VILLAGES
    from app.api.routes.villages import _commune_demographics

    try:
        lon = float(body["lon"])
        lat = float(body["lat"])
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(400, "lon/lat required and numeric")
    wind = float(body.get("wind_speed_kmh", 15.0))
    wdir = float(body.get("wind_direction_deg", 45.0))
    slope = float(body.get("slope_deg", 12.0))
    hours = body.get("hours", [1.0, 3.0, 6.0])
    try:
        hours = sorted({float(h) for h in hours})[:4] or [1.0, 3.0, 6.0]
    except Exception:
        hours = [1.0, 3.0, 6.0]
    closed_ids = set(body.get("closed_route_ids") or [])
    try:
        min_cap = body.get("min_water_capacity_m3")
        min_cap = float(min_cap) if min_cap not in (None, "") else None
    except Exception:
        min_cap = None

    # B1: scenario ROS with published factors (heuristic, labeled).
    base_ros = spread_svc.head_ros_kmh(wind, slope)
    scen = spread_svc.scenario_ros(base_ros, body.get("temperature_c"),
                                   body.get("rain_mm"), body.get("forest_loss_ha"))
    sim = spread_svc.simulate(lon, lat, wind, wdir, slope, hours,
                              ros_override_kmh=scen["ros_kmh"])
    ros = scen["ros_kmh"]
    for s in sim["steps"]:
        s["color"] = STEP_COLORS.get(s["hour"], "#F97316")
        s["affected_communes"] = spread_svc.affected_communes(
            s["polygon"]["coordinates"][0], spread_svc.load_commune_shapes())

    # Route spread bands + vertices FIRST (shared by shield scoring below
    # and route output later). Rings come straight from sim steps.
    rings = {s["hour"]: s["polygon"]["coordinates"][0] for s in sim["steps"]}
    route_vertex_cache = []
    for r in db.query(OperationalAsset).filter(
            OperationalAsset.asset_type == "route",
            OperationalAsset.status == "active").all():
        pts = _route_vertices(r.geometry)
        if not pts:
            continue
        earliest = None
        for hr in sorted(rings):
            ring = rings[hr]
            if any(ops._point_in_ring(px, py, ring) for px, py in pts):
                earliest = hr
                break
        route_vertex_cache.append({
            "id": r.id, "route_name": r.name, "vertices": pts,
            "band": ops.community_band(earliest), "earliest": earliest,
            "road_condition": getattr(r, "road_condition", None),
            "surface_type": getattr(r, "surface_type", None),
        })

    # B7 communities (A1 logic, scenario spread) + Module 7 shield scores.
    from app.api.routes.villages import commune_centroids
    demo = _commune_demographics()
    cent = commune_centroids()
    first_hour: dict = {}
    for s in sim["steps"]:
        for c in s["affected_communes"]:
            if c.get("code") and c["code"] not in first_hour:
                first_hour[c["code"]] = s["hour"]
    # support inputs for shield scoring (Module 7 shared helper)
    _wgeo = [{"name": w.name, "longitude": w.longitude, "latitude": w.latitude,
              "status": w.status} for w in db.query(WaterAsset).all()]
    _sgeo = [{"name": a.name, "longitude": a.longitude, "latitude": a.latitude}
             for a in db.query(OperationalAsset).filter(
                 OperationalAsset.asset_type.in_(["station", "team", "watchtower"]),
                 OperationalAsset.status == "active").all()]
    communities = []
    for code, hr in sorted(first_hour.items(), key=lambda kv: kv[1]):
        d = demo.get(code, {})
        cx, cy = cent.get(code, (None, None))
        dist = round(ops.haversine_km(lon, lat, cx, cy), 2) if cx is not None else None
        eta = round(dist / ros, 2) if dist is not None and ros else None
        band = ops.community_band(hr)
        sup = ops.nearest_support(cx, cy, _wgeo, _sgeo, route_vertex_cache) if cx is not None else {}
        shield = ops.community_shield(band, (sup or {}).get("water_eta_min"),
                                      bool((sup or {}).get("water_ok")),
                                      (sup or {}).get("station_eta_min"),
                                      bool((sup or {}).get("has_station")),
                                      (sup or {}).get("route_band"), d.get("population"))
        communities.append({
            "code": code, "commune": d.get("name"), "population": d.get("population"),
            "population_status": "VERIFIED" if d.get("population") is not None else "MISSING",
            "first_hour": hr, "band": band,
            "color": BAND_COLORS[band],
            "distance_km": dist, "eta_hours": eta,
            "shield": shield["shield"], "shield_components": shield["components"],
            "nearest_water": (sup or {}).get("water_name"),
            "nearest_station": (sup or {}).get("station_name"),
        })
    aff_codes = set(first_hour)
    villages = [{**v, "population_status": "ESTIMATED",
                 "band": ops.community_band(first_hour.get(v.get("code"))),
                 "color": BAND_COLORS[ops.community_band(first_hour.get(v.get("code")))]}
                for v in VILLAGES if v.get("code") in aff_codes]

    # Threatened assets (ops + water) with colors.
    op_rows = [{"id": a.id, "name": a.name, "asset_type": a.asset_type,
                "status": a.status, "latitude": a.latitude, "longitude": a.longitude}
               for a in db.query(OperationalAsset).all()]
    op_threats = ops.assess_asset_threat(lon, lat, ros, op_rows)
    w_rows = [{"id": w.id, "name": w.name, "asset_type": w.asset_type,
               "longitude": w.longitude, "latitude": w.latitude,
               "capacity_m3": w.capacity_m3, "road_access": w.road_access,
               "status": w.status, "manager": w.manager}
              for w in db.query(WaterAsset).all()]
    w_threats = ops.assess_water_threat(lon, lat, ros, w_rows, sim["steps"])
    for t in op_threats + w_threats:
        t["color"] = BAND_COLORS.get(t["band"], "#3B82F6")

    # B4 route impacts: earliest containing step per vertex (reuses cache).
    # Closed scenario routes keep their spread band but are flagged CLOSED —
    # closure affects dispatch choice, never the physics.
    routes = []
    for c in route_vertex_cache:
        band, earliest = c["band"], c["earliest"]
        closed = c["id"] in closed_ids
        routes.append({
            "id": c["id"], "route_name": c["route_name"],
            "road_condition": c["road_condition"],
            "surface_type": c["surface_type"],
            "impacted_in_hours": earliest,
            "band": band, "color": "#6B7280" if closed else BAND_COLORS[band],
            "closed": closed,
            "panel": ("Đóng theo kịch bản — dùng tuyến dự phòng" if closed
                      else (f"Route expected impacted in {earliest} hours"
                            if earliest is not None else "Route outside simulated spread")),
        })
    # Module 6 alternative routes: nearest SAFE route by vertex distance.
    for r in routes:
        if r["band"] == "SAFE" or r["closed"]:
            r["alternative_route"] = None
            continue
        me = next((c for c in route_vertex_cache if c["id"] == r["id"]), None)
        best, best_d = None, None
        for c in route_vertex_cache:
            if c["id"] == r["id"]:
                continue
            alt = next((x for x in routes if x["id"] == c["id"]), None)
            if not alt or alt["band"] != "SAFE" or alt["closed"]:
                continue
            for ax, ay in c["vertices"]:
                for mx, my in (me["vertices"] if me else []):
                    try:
                        dd = ops.haversine_km(ax, ay, mx, my)
                    except Exception:
                        continue
                    if best_d is None or dd < best_d:
                        best_d, best = alt["route_name"], dd
        r["alternative_route"] = best
        r["alternative_distance_km"] = round(best_d, 2) if best_d is not None else None
        if best:
            r["panel"] += f" — tuyến thay thế: {best} (~{round(best_d, 1)} km)"
        else:
            r["panel"] += " — KHÔNG có tuyến SAFE thay thế (FIELD_VERIFICATION_REQUIRED)"

    # B5 water access: current vs simulated. min_water_capacity_m3 excludes
    # small sources from dispatch consideration (labeled, not deleted).
    speed = 30.0
    waters = []
    excluded_waters = []
    for w in db.query(WaterAsset).all():
        try:
            too_small = min_cap is not None and float(w.capacity_m3 or 0) < min_cap
        except Exception:
            too_small = False
        if too_small:
            excluded_waters.append(w.name)
            continue
        d = ops.haversine_km(lon, lat, w.longitude, w.latitude)
        eta = ops.road_eta_minutes(d, speed)
        verified = (w.status == "verified")
        cur_avail = "AVAILABLE" if verified else "UNVERIFIED"
        sim_band = next((t["band"] for t in w_threats if t["id"] == w.id), "SAFE")
        sim_avail = sim_band if sim_band != "SAFE" else cur_avail
        waters.append({
            "id": w.id, "name": w.name, "distance_km": round(d, 2),
            "current": {"travel_minutes": eta, "availability": cur_avail},
            "simulated": {"travel_minutes": eta, "availability": sim_avail,
                          "band": sim_band, "color": BAND_COLORS[sim_band]},
            "note": (f"Trong vùng lan {sim_band} — cân nhắc nguồn khác"
                     if sim_band != "SAFE" else "Ngoài vùng lan mô phỏng"),
        })

    # B7 impact panel aggregates.
    areas = [s.get("area_ha") or 0 for s in sim["steps"]]
    stations_hit = [t for t in op_threats
                    if t.get("asset_type") in ("station", "team", "watchtower")
                    and t["band"] != "SAFE"]
    # Module 5 wind corridor: axis length = longest step, half-width from LB.
    _longest = max([s.get("length_km") or 0 for s in sim["steps"]] or [0])
    _widest = max([s.get("width_km") or 0 for s in sim["steps"]] or [0])
    corridor = ops.wind_corridor(lon, lat, wdir, max(_longest, 0.5), max(_widest / 2, 0.2))
    _cring = corridor["polygon"]["coordinates"][0]
    _inside = []
    for c in communities:
        cc = cent.get(c["code"])
        if cc and ops.corridor_contains(_cring, cc[0], cc[1]):
            _inside.append(c["commune"])
    corridor["communes_inside"] = _inside
    # Module 8 protection plan: water + stations/towers + routes + communities.
    _strat = {w["id"] for w in waters if w["simulated"]["band"] in ("CRITICAL", "THREATENED")}
    _prot_in = ([{**t, "eta_hours": t.get("eta_hours")} for t in op_threats]
                + [{**t, "eta_hours": t.get("eta_hours")} for t in w_threats]
                + [{"id": r["id"], "name": r["route_name"], "asset_type": "route",
                    "band": r["band"], "distance_km": None,
                    "eta_hours": r["impacted_in_hours"]} for r in routes]
                + [{"id": cm["code"], "name": cm["commune"], "asset_type": "community",
                    "band": cm["band"], "distance_km": None,
                    "eta_hours": cm.get("eta_hours")} for cm in communities])
    protection = ops.protection_plan(_prot_in, _strat)
    # Module 11 story: same payload drives narrative + timeline.
    _w_by_dist = sorted(waters, key=lambda w: w["distance_km"])
    _st_cands = sorted([t for t in op_threats if t.get("asset_type") in ("station", "team")],
                       key=lambda t: t.get("distance_km") or 9e9)
    story = ops.tactical_story(
        {"lon": lon, "lat": lat}, sim["steps"], communities, routes, waters,
        {"primary_water": {"name": _w_by_dist[0]["name"],
                           "eta_minutes": _w_by_dist[0]["current"]["travel_minutes"]} if _w_by_dist else {},
         "primary_station": {"station_name": _st_cands[0]["name"]} if _st_cands else {}})
    # Module 1 officer + Module 2 checklist + Module 6 behavior (all cited).
    _open_routes = [r for r in routes if not r["closed"]]
    _pw = {"name": _w_by_dist[0]["name"], "priority": None,
           "distance_km": _w_by_dist[0]["distance_km"],
           "capacity_m3": None,
           "eta_minutes": _w_by_dist[0]["current"]["travel_minutes"]} if _w_by_dist else None
    _bw = {"name": _w_by_dist[1]["name"], "distance_km": _w_by_dist[1]["distance_km"],
           "eta_minutes": _w_by_dist[1]["current"]["travel_minutes"]} if len(_w_by_dist) > 1 else None
    _ps = ({"station_name": _st_cands[0]["name"], "station_type": _st_cands[0]["asset_type"],
            "distance_km": _st_cands[0]["distance_km"],
            "eta_minutes": ops.travel_minutes(_st_cands[0]["distance_km"])}
           if _st_cands else None)
    _pr = _open_routes[0] if _open_routes else None
    top_actions = ops.operations_officer(
        _ps, None, _pw, _bw, _pr,
        [r["route_name"] for r in routes if r["closed"]],
        communities, communities)
    _depl = ops.deployment_plan(_ps, None, _pw, _bw, _pr, op_threats + w_threats)
    checklist = ops.operational_checklist(
        _depl, op_threats + w_threats, communities)
    behavior = ops.fire_behavior(
        wind, slope, scen.get("factors", {}), round(wdir % 360, 1),
        [c["commune"] for c in communities][:4])
    impact = {
        "area_affected_ha": max(areas) if areas else 0,
        "communities_threatened": len(communities),
        "communes": [c["commune"] for c in communities][:8],
        "water_impacted": [w["name"] for w in waters if w["simulated"]["band"] != "SAFE"],
        "stations_impacted": [t["name"] for t in stations_hit],
        "routes_impacted": [r["route_name"] for r in routes if r["band"] != "SAFE"],
        "progression": {str(s["hour"]): {"length_km": s["length_km"], "area_ha": s["area_ha"]}
                        for s in sim["steps"]},
        "ros_kmh": ros,
    }
    return {
        "ignition": {"lon": lon, "lat": lat},
        "scenario": {"wind_speed_kmh": wind, "wind_direction_deg": wdir % 360,
                     "slope_deg": slope, "temperature_c": body.get("temperature_c"),
                     "rain_mm": body.get("rain_mm"), "forest_loss_ha": body.get("forest_loss_ha"),
                     "closed_route_ids": sorted(closed_ids),
                     "min_water_capacity_m3": min_cap,
                     "excluded_waters": excluded_waters},
        "ros": scen,
        "spread": sim,
        "wind_layer": {"direction_deg": wdir % 360, "speed_kmh": wind},
        "communities": communities, "villages": villages,
        "operational_threats": op_threats, "water_threats": w_threats,
        "routes": routes, "waters": waters,
        "wind_corridor": corridor,
        "protection_plan": protection,
        "story": story,
        "top_actions": top_actions,
        "checklist": checklist,
        "fire_behavior": behavior,
        "deployment_plan": _depl,
        "impact": impact,
        "generated_at": utcnow().isoformat(),
    }
