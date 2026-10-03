"""Part B fire simulator + A3 seasonal enum + B8 plan wind override."""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import Base, engine, init_db
from app.main import create_app
from tests.helpers import auth_headers


def setup():
    Base.metadata.drop_all(bind=engine)
    app = create_app()
    init_db()
    try:
        from app.seed import seed_demo
        seed_demo()
    except Exception:
        pass
    return TestClient(app)


def test_scenario_ros_factors_published():
    from app.services import spread as s
    out = s.scenario_ros(0.5, 35.0, 0.0, 1000.0)
    assert out["factors"]["temperature"] == 1.1
    assert out["factors"]["rain"] == 1.0
    assert out["factors"]["fuel"] == 1.3
    assert out["ros_kmh"] <= 3.0
    assert "formula" in out
    wet = s.scenario_ros(0.5, 30.0, 20.0, 0.0)
    assert wet["factors"]["rain"] == 0.5
    assert wet["ros_kmh"] < 0.5
    # None inputs = neutral, no crash
    n = s.scenario_ros(0.5, None, None, None)
    assert n["ros_kmh"] == 0.5


def test_simulate_fire_full_impact():
    c = setup()
    h = auth_headers(c)
    line = {"type": "LineString", "coordinates": [[109.0, 14.05], [109.05, 14.07]]}
    c.post("/api/assets", json={"asset_type": "route", "name": "DT",
                                "latitude": 14.05, "longitude": 109.0,
                                "geometry": line, "road_condition": "GOOD",
                                "surface_type": "GRAVEL"}, headers=h)
    r = c.post("/api/simulate/fire", json={
        "lon": 109.02, "lat": 14.06, "wind_speed_kmh": 20,
        "wind_direction_deg": 90, "temperature_c": 36, "rain_mm": 0,
        "forest_loss_ha": 500})
    assert r.status_code == 200, r.text
    d = r.json()
    assert [s["hour"] for s in d["spread"]["steps"]] == [1.0, 3.0, 6.0]
    assert {s["color"] for s in d["spread"]["steps"]} == {"#F97316", "#FACC15", "#525252"}
    assert d["ros"]["factors"]["temperature"] > 1.0
    assert "formula" in d["ros"]
    assert d["wind_layer"] == {"direction_deg": 90.0, "speed_kmh": 20.0}
    assert d["impact"]["area_affected_ha"] > 0
    assert "communities" in d and "villages" in d
    assert len(d["water_threats"]) == 16
    assert all("color" in t for t in d["operational_threats"] + d["water_threats"])
    rt = next(x for x in d["routes"] if x["route_name"] == "DT")
    assert rt["band"] in ("CRITICAL", "THREATENED", "WATCH", "SAFE")
    assert "impacted in" in rt["panel"] or "outside" in rt["panel"]
    w0 = d["waters"][0]
    assert "current" in w0 and "simulated" in w0 and "travel_minutes" in w0["current"]
    assert "probability" not in str(d).lower()
    # missing lon/lat → 400, never a fake default fire
    assert c.post("/api/simulate/fire", json={}).status_code == 400


def test_b8_plan_wind_override_regenerates():
    c = setup()
    a = c.post("/api/v1/fires/response-plan", json={"lon": 109.02, "lat": 14.06}).json()
    b = c.post("/api/v1/fires/response-plan", json={
        "lon": 109.02, "lat": 14.06,
        "wind_speed_kmh": 40, "wind_direction_deg": 270}).json()
    assert a["spread"]["wind_source"] != "scenario override (simulator)"
    assert b["spread"]["wind_source"] == "scenario override (simulator)"
    assert b["spread"]["steps"][0]["length_km"] > a["spread"]["steps"][0]["length_km"]


def test_k_plan_contract_threatened_deployment_intel():
    c = setup()
    d = c.post("/api/v1/fires/response-plan", json={"lon": 109.02, "lat": 14.06}).json()
    for key in ("threatened_communities", "deployment_plan", "earth_intelligence",
                "primary_station", "backup_station", "primary_water", "backup_water",
                "primary_route", "backup_route", "threatened_assets",
                "eta_minutes", "command_status"):
        assert key in d, key
    assert len(d["threatened_communities"]) >= 1
    tc = d["threatened_communities"][0]
    assert tc["band"] in ("CRITICAL", "THREATENED", "WATCH", "SAFE")
    assert tc["distance_km"] is not None and tc["eta_hours"] is not None
    assert tc["population_status"] in ("VERIFIED", "MISSING")
    orders = [s["order"] for s in d["deployment_plan"]]
    assert orders == sorted(orders) and len(orders) >= 1
    ei = d["earth_intelligence"]
    for key in ("terrain_driver", "fuel_driver", "weather_driver", "access_driver",
                "recommended_action", "operational_insights"):
        assert key in ei, key
    assert "probability" not in str(d).lower()
    b = d["analyst_bulletin"]
    for key in ("phan_tich_dia_hinh", "tac_dong_cong_dong", "ke_hoach_trieu_dong",
                "rui_ro_van_hanh"):
        assert key in b, key


def test_m_scenario_filters_road_closure_and_water_capacity():
    c = setup()
    h = auth_headers(c)
    line = {"type": "LineString", "coordinates": [[109.0, 14.05], [109.05, 14.07]]}
    r1 = c.post("/api/assets", json={"asset_type": "route", "name": "R1",
                                     "latitude": 14.05, "longitude": 109.0,
                                     "geometry": line}, headers=h).json()
    r2 = c.post("/api/assets", json={"asset_type": "route", "name": "R2",
                                     "latitude": 14.1, "longitude": 109.1,
                                     "geometry": line}, headers=h).json()
    base = {"lon": 109.02, "lat": 14.06}
    d0 = c.post("/api/v1/fires/response-plan", json=base).json()
    assert d0["primary_route"]["route_name"] == "R1"
    d1 = c.post("/api/v1/fires/response-plan",
                json={**base, "exclude_route_ids": [r1["id"]]}).json()
    assert d1["primary_route"]["route_name"] == "R2"
    assert d1["scenario"]["closed_routes"] == ["R1"]
    # water capacity filter promotes big reservoirs only
    big = c.post("/api/v1/fires/response-plan",
                 json={**base, "min_water_capacity_m3": 100_000_000}).json()
    assert all((w.get("capacity_m3") or 0) >= 100_000_000
               for w in big["water_ranking"]["ranked"])
    assert len(big["scenario"]["excluded_waters"]) > 0
    # simulate endpoint honors the same scenario params
    s = c.post("/api/simulate/fire", json={**base, "closed_route_ids": [r1["id"]],
                                           "min_water_capacity_m3": 100_000_000}).json()
    assert s["routes"] and all(x["id"] != r1["id"] or x["closed"] for x in s["routes"])
    assert s["scenario"]["excluded_waters"]


def test_h_communities_distance_eta():
    c = setup()
    d = c.get("/api/communities/threatened?lat=14.062&lon=109.02").json()
    assert "ros_kmh" in d and d["ros_kmh"] > 0
    assert len(d["communes"]) >= 1
    for t in d["communes"]:
        assert t["distance_km"] is not None and t["eta_hours"] is not None


def test_officer_top5_checklist_behavior_no_percent():
    c = setup()
    d = c.post("/api/simulate/fire", json={"lon": 109.02, "lat": 14.06}).json()
    for key in ("top_actions", "checklist", "fire_behavior", "deployment_plan",
                "protection_plan", "story", "wind_corridor"):
        assert key in d, key
    assert len(d["top_actions"]) == 5
    titles = [a["title"] for a in d["top_actions"]]
    assert titles == ["Deploy station", "Use water source", "Use access route",
                      "Protect community", "Prepare backup water source"]
    for a in d["top_actions"]:
        assert a["confidence"] in ("LOW", "MODERATE", "HIGH")
        assert "reason" in a and "required_assets" in a
    assert "%" not in str(d["top_actions"])
    ch = d["checklist"]
    assert set(ch) == {"immediate", "short_term", "medium_term"}
    assert sum(len(v) for v in ch.values()) >= 1
    bh = d["fire_behavior"]
    assert bh["behavior"] in ("wind-driven", "terrain-driven", "fuel-driven", "mixed")
    assert "why" in bh and "direction" in bh
    # plan carries the same officer outputs
    p = c.post("/api/v1/fires/response-plan", json={"lon": 109.02, "lat": 14.06}).json()
    assert len(p["top_actions"]) == 5 and "checklist" in p and "fire_behavior" in p
    assert "protection_plan" in p and "story" in p
    ei = p["earth_intelligence"]
    for key in ("major_risk_driver", "major_bottleneck", "best_intervention",
                "critical_asset", "critical_community"):
        assert key in ei, key
    b = p["analyst_bulletin"]
    for key in ("hanh_dong_uu_tien", "giai_thich_chay"):
        assert key in b, key
    assert len(b["hanh_dong_uu_tien"]) == 5
    assert "wind-driven" in b["giai_thich_chay"] or "mixed" in b["giai_thich_chay"] \
        or "terrain-driven" in b["giai_thich_chay"] or "fuel-driven" in b["giai_thich_chay"]
    assert all("shield" in t and "nearest_water" in t for t in p["threatened_communities"])


def test_shield_terrain_caps_category():
    from app.services import twin_ops as ops
    assert ops.terrain_difficulty(None) == "UNKNOWN"
    assert ops.terrain_difficulty({"mean_slope_deg": 25}) == "HIGH"
    base = ops.community_shield("WATCH", 10, True, 8, True, "SAFE", 5000)
    assert base["shield"] == "WATCH"
    steep = ops.community_shield("WATCH", 10, True, 8, True, "SAFE", 5000,
                                 {"mean_slope_deg": 25})
    assert steep["shield"] == "VULNERABLE"
    assert steep["components"]["terrain_difficulty"] == "HIGH"
    assert steep["components"]["population"] == 5000


def test_protection_priority_rules():
    from app.services import twin_ops as ops
    assert ops.protection_priority("CRITICAL", "community", False) == "PROTECT_NOW"
    assert ops.protection_priority("THREATENED", "station", False) == "PROTECT_NOW"
    assert ops.protection_priority("THREATENED", "route", False) == "MONITOR"
    assert ops.protection_priority("WATCH", "water", False) == "MONITOR"
    assert ops.protection_priority("SAFE", "water", False) == "LOW_PRIORITY"
