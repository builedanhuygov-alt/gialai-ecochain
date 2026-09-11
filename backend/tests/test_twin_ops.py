"""Tactical engine: explainable scoring, bands, standard FWI."""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import Base, engine, init_db
from app.main import create_app
from app.services import twin_ops as ops
from tests.helpers import auth_headers


def test_water_ranking_prefers_near_big_upwind():
    waters = [
        {"id": "far", "name": "Be Xa", "longitude": 109.5, "latitude": 14.5,
         "status": "active", "capacity_liters": 20000},
        {"id": "near", "name": "Be Gan", "longitude": 108.31, "latitude": 13.91,
         "status": "active", "capacity_liters": 5000},
    ]
    # wind blowing toward east (90): Be Gan is ~NEAR fire, scores first
    out = ops.score_water_sources(108.3, 13.9, 90.0, waters)
    assert out["ranked"][0]["id"] == "near"
    assert out["ranked"][0]["priority"] in ("A", "B", "C")
    assert "weights" in out and "distance" in out["weights"]
    assert any("road" in u for u in out["unscored_factors"])
    comps = out["ranked"][0]
    assert set(comps) >= {"score", "priority", "components", "distance_km"}


def test_threat_bands_by_eta():
    assets = [{"id": "a", "name": "Tram", "asset_type": "station", "status": "active",
               "longitude": 108.3, "latitude": 13.9}]
    # fire on top of the asset with fast ROS -> CRITICAL
    out = ops.assess_asset_threat(108.31, 13.91, 2.0, assets)
    assert out[0]["band"] in ("CRITICAL", "THREATENED")
    assert out[0]["availability"] == "OPERATIONAL"
    # far away, slow ROS -> SAFE
    out2 = ops.assess_asset_threat(107.0, 12.0, 0.2, assets)
    assert out2[0]["band"] == "SAFE"
    assert out2[0]["eta_hours"] is not None


def test_ffmc_isi_sanity_and_labels():
    # hot dry windy day must score high; method + assumption always labeled
    r = ops.ffmc_isi_same_day(38.0, 20.0, 25.0, 0.0)
    assert r["ffmc"] > 88, r
    assert r["isi"] > 5, r
    assert "Van Wagner" in r["method"] and "85" in r["assumption"]
    wet = ops.ffmc_isi_same_day(22.0, 95.0, 5.0, 20.0)
    assert wet["ffmc"] < r["ffmc"]


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


def test_response_plan_shape_and_honesty():
    c = setup()
    h = auth_headers(c)
    c.post("/api/assets", json={"asset_type": "water", "name": "Be PCCC",
                                "latitude": 13.91, "longitude": 108.31,
                                "capacity_liters": 8000}, headers=h)
    c.post("/api/assets", json={"asset_type": "station", "name": "Tram PCCC",
                                "latitude": 13.85, "longitude": 108.25}, headers=h)
    r = c.post("/api/v1/fires/response-plan", json={"lon": 108.3, "lat": 13.9})
    assert r.status_code == 200, r.text
    d = r.json()
    for key in ("risk_summary", "weather", "spread", "nearest_station", "nearest_water",
                "water_ranking", "travel_time", "asset_threats", "tactical_recommendations",
                "generated_at"):
        assert key in d, key
    assert d["nearest_water"]["name"] == "Be PCCC"
    assert d["nearest_station"]["name"] == "Tram PCCC"
    assert "assumption" in d["travel_time"]
    assert isinstance(d["tactical_recommendations"], list) and d["tactical_recommendations"]
    assert "fwi" in d  # may be None without temp/humidity — key must exist
    assert d["spread"]["model"] == "ELLIPTICAL_HEURISTIC_V1"


def test_response_plan_requires_coords():
    c = setup()
    assert c.post("/api/v1/fires/response-plan", json={}).status_code == 400
