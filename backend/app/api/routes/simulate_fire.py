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
STEP_COLORS = {0.0: "#DC2626", 1.0: "#F97316", 3.0: "#FACC15", 6.0: "#525252"}
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
    slope_deg (12), temperature_c, rain_mm, forest_loss_ha, hours ([1,3,6]).
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

    # B7 communities (A1 logic, scenario spread).
    demo = _commune_demographics()
    first_hour: dict = {}
    for s in sim["steps"]:
        for c in s["affected_communes"]:
            if c.get("code") and c["code"] not in first_hour:
                first_hour[c["code"]] = s["hour"]
    communities = []
    for code, hr in sorted(first_hour.items(), key=lambda kv: kv[1]):
        d = demo.get(code, {})
        communities.append({
            "code": code, "commune": d.get("name"), "population": d.get("population"),
            "population_status": "VERIFIED" if d.get("population") is not None else "MISSING",
            "first_hour": hr, "band": ops.community_band(hr),
            "color": BAND_COLORS[ops.community_band(hr)],
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

    # B4 route impacts: earliest containing step per vertex.
    rings = {s["hour"]: s["polygon"]["coordinates"][0] for s in sim["steps"]}
    routes = []
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
        band = ops.community_band(earliest)
        routes.append({
            "id": r.id, "route_name": r.name,
            "road_condition": getattr(r, "road_condition", None),
            "surface_type": getattr(r, "surface_type", None),
            "impacted_in_hours": earliest,
            "band": band, "color": BAND_COLORS[band],
            "panel": (f"Route expected impacted in {earliest} hours"
                      if earliest is not None else "Route outside simulated spread"),
        })

    # B5 water access: current vs simulated.
    speed = 30.0
    waters = []
    for w in db.query(WaterAsset).all():
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
                     "rain_mm": body.get("rain_mm"), "forest_loss_ha": body.get("forest_loss_ha")},
        "ros": scen,
        "spread": sim,
        "wind_layer": {"direction_deg": wdir % 360, "speed_kmh": wind},
        "communities": communities, "villages": villages,
        "operational_threats": op_threats, "water_threats": w_threats,
        "routes": routes, "waters": waters,
        "impact": impact,
        "generated_at": utcnow().isoformat(),
    }
