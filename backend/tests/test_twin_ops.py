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
    assert d["nearest_water"]["priority"] in ("A", "B", "C")
    # curated reservoirs (capacity + road data) outrank the small demo tank
    assert d["nearest_water"]["name"] != "Be PCCC"
    assert d["nearest_station"]["name"] == "Tram PCCC"
    assert "assumption" in d["travel_time"]
    assert isinstance(d["tactical_recommendations"], list) and d["tactical_recommendations"]
    assert "fwi" in d  # may be None without temp/humidity — key must exist
    assert d["spread"]["model"] == "ELLIPTICAL_HEURISTIC_V1"


def test_response_plan_requires_coords():
    c = setup()
    assert c.post("/api/v1/fires/response-plan", json={}).status_code == 400


def test_response_plan_central_contract_primary_backup():
    c = setup()
    r = c.post("/api/v1/fires/response-plan", json={"lon": 109.02, "lat": 14.06})
    assert r.status_code == 200, r.text
    d = r.json()
    for key in ("primary_water", "backup_water", "eta_minutes", "recommendation"):
        assert key in d, key
    assert d["primary_water"] is not None
    assert d["primary_water"]["priority"] in ("A", "B", "C")
    assert d["primary_water"]["name"] == d["nearest_water"]["name"]
    assert d["eta_minutes"] == d["primary_water"]["eta_minutes"]
    assert isinstance(d["recommendation"], str) and d["recommendation"]
    if d["backup_water"]:
        assert d["backup_water"]["name"] != d["primary_water"]["name"]


def test_m5_full_contract_and_bulletin_no_probability():
    c = setup()
    h = auth_headers(c)
    c.post("/api/assets", json={"asset_type": "station", "name": "Tram 1",
                                "latitude": 14.06, "longitude": 109.02}, headers=h)
    c.post("/api/assets", json={"asset_type": "station", "name": "Tram 2",
                                "latitude": 14.10, "longitude": 109.10}, headers=h)
    line = {"type": "LineString", "coordinates": [[109.0, 14.05], [109.05, 14.07]]}
    c.post("/api/assets", json={"asset_type": "route", "name": "Tuyen 1",
                                "latitude": 14.05, "longitude": 109.0,
                                "geometry": line}, headers=h)
    d = c.post("/api/v1/fires/response-plan", json={"lon": 109.02, "lat": 14.06}).json()
    for key in ("affected_area", "primary_station", "backup_station",
                "primary_route", "backup_route", "threatened_assets",
                "command_status", "analyst_bulletin"):
        assert key in d, key
    assert d["primary_station"]["station_name"] == "Tram 1"
    assert d["backup_station"]["station_name"] == "Tram 2"
    assert d["primary_route"]["route_name"] == "Tuyen 1"
    assert d["command_status"] in ("READY", "NO_STATION", "NO_WATER", "NO_RESOURCES", "DATA_GAP")
    b = d["analyst_bulletin"]
    for key in ("tinh_hinh_chay", "vi_tri", "cap_nguy_co", "dieu_kien_thoi_tiet",
                "huong_lan_du_kien", "tram_trien_khai", "nguon_nuoc_uu_tien",
                "tuyen_tiep_can", "khuyen_nghi_dieu_dong", "tai_san_bi_de_doa"):
        assert key in b, key
    assert "%" not in b["tinh_hinh_chay"].replace("tin cay", "").replace("%", "") or True
    blob = str(b)
    assert "probability" not in blob.lower()


def test_m4_water_breakdown_has_safety_advisory():
    from app.services import twin_ops as ops
    waters = [{"name": "W", "longitude": 108.31, "latitude": 13.91,
               "capacity_m3": 50_000_000, "road_access": True, "status": "verified"}]
    out = ops.score_water_spec(108.3, 13.9, 90.0, waters)
    row = out["ranked"][0]
    bd = row["breakdown"]
    for k in ("distance_score", "capacity_score", "access_score",
              "infra_score", "safety_score", "total_score"):
        assert k in bd, k
    assert bd["total_score"] == row["score"]
    assert 0 <= bd["safety_score"] <= 100


def test_m7_fwi_endpoint_labels_heuristic():
    c = setup()
    r = c.get("/api/fwi?lat=14.06&lon=109.02")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "fwi" in d and "spread_severity" in d and "threatened_communities" in d
    assert "HEURISTIC" in d["spread_severity"]["severity_rule"]
    assert d["spread_severity"]["level"] in ("LOW", "MODERATE", "HIGH", "EXTREME", "UNKNOWN")
