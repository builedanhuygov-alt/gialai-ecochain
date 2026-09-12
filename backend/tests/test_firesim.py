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
