"""Operational assets: ranger-entered GPS, nearest-water math, validation."""
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
    return TestClient(app)


def test_asset_crud_and_validation():
    c = setup()
    h = auth_headers(c)
    assert c.post("/api/assets", json={"asset_type": "water", "name": "X"}).status_code == 401
    bad = c.post("/api/assets", json={"asset_type": "ufo", "name": "X", "latitude": 1, "longitude": 1}, headers=h)
    assert bad.status_code == 400
    bad2 = c.post("/api/assets", json={"asset_type": "water", "name": "X", "latitude": 999, "longitude": 1}, headers=h)
    assert bad2.status_code == 400
    r = c.post("/api/assets", json={"asset_type": "water", "name": "Be Chua Chay A",
                                    "latitude": 13.9, "longitude": 108.3,
                                    "capacity_liters": 5000}, headers=h)
    assert r.status_code == 200, r.text
    wid = r.json()["id"]
    assert r.json()["created_by"] == "tadmin"
    lst = c.get("/api/assets").json()
    assert any(a["id"] == wid for a in lst)
    assert c.get("/api/assets?asset_type=firetruck").json() == []


def test_nearest_water_and_station():
    c = setup()
    h = auth_headers(c)
    c.post("/api/assets", json={"asset_type": "water", "name": "Be Gan", "latitude": 13.91,
                                "longitude": 108.31, "capacity_liters": 2000}, headers=h)
    c.post("/api/assets", json={"asset_type": "water", "name": "Be Xa", "latitude": 14.5,
                                "longitude": 109.0}, headers=h)
    c.post("/api/assets", json={"asset_type": "station", "name": "Tram A",
                                "latitude": 13.85, "longitude": 108.25}, headers=h)
    w = c.get("/api/assets/nearest?lat=13.9&lon=108.3&asset_type=water").json()
    assert w["asset"]["name"] == "Be Gan"
    assert 0 < w["distance_km"] < 5
    s = c.get("/api/assets/nearest?lat=13.9&lon=108.3").json()
    assert s["asset"] is not None and s["distance_km"] is not None
    empty = c.get("/api/assets/nearest?lat=13.9&lon=108.3&asset_type=camera").json()
    assert empty["asset"] is None
    assert "chưa có" in empty["note"].lower()


def test_brief_includes_asset_keys():
    c = setup()
    h = auth_headers(c)
    c.post("/api/assets", json={"asset_type": "water", "name": "Be Brief",
                                "latitude": 13.9, "longitude": 108.3}, headers=h)
    r = c.get("/api/fire/brief?administrative_unit_id=Test&lat=13.9&lon=108.3")
    assert r.status_code == 200
    d = r.json()
    assert "nearest_water" in d and "nearest_station" in d
    assert d["nearest_water"]["name"] == "Be Brief"


def test_route_geometry_and_viewer_url():
    c = setup()
    h = auth_headers(c)
    line = {"type": "LineString", "coordinates": [[108.0, 13.9], [108.1, 13.95]]}
    r = c.post("/api/assets", json={"asset_type": "route", "name": "Tuyen A",
                                    "latitude": 13.9, "longitude": 108.0,
                                    "geometry": line,
                                    "viewer_url": "https://pano.example.com/a"}, headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["geometry"]["type"] == "LineString"
    assert d["viewer_url"] == "https://pano.example.com/a"
    bad = c.post("/api/assets", json={"asset_type": "route", "name": "Bad",
                                      "latitude": 13.9, "longitude": 108.0,
                                      "geometry": {"type": "Point", "coordinates": [1, 2]}}, headers=h)
    assert bad.status_code == 400
    bad2 = c.post("/api/assets", json={"asset_type": "camera", "name": "Cam",
                                       "latitude": 13.9, "longitude": 108.0,
                                       "viewer_url": "ftp://x"}, headers=h)
    assert bad2.status_code == 400


def test_nearest_station_with_eta_and_honest_empty():
    c = setup()
    h = auth_headers(c)
    empty = c.get("/api/assets/nearest-station?lat=13.9&lon=108.3").json()
    assert empty["asset"] is None and empty["eta_minutes"] is None
    c.post("/api/assets", json={"asset_type": "station", "name": "Tram Gan",
                                "latitude": 13.91, "longitude": 108.31}, headers=h)
    c.post("/api/assets", json={"asset_type": "team", "name": "To Xa",
                                "latitude": 14.5, "longitude": 109.0}, headers=h)
    s = c.get("/api/assets/nearest-station?lat=13.9&lon=108.3&avg_speed_kmh=30").json()
    assert s["asset"]["name"] == "Tram Gan"
    assert 0 < s["distance_km"] < 5
    assert s["eta_minutes"] == round(s["distance_km"] * 1.3 / 30 * 60, 1)
    assert "eta_assumption" in s


def test_nearest_route_vertex_distance_and_honest_empty():
    c = setup()
    h = auth_headers(c)
    empty = c.get("/api/assets/nearest-route?lat=13.9&lon=108.3").json()
    assert empty["asset"] is None
    line = {"type": "LineString", "coordinates": [[108.0, 13.9], [108.1, 13.95]]}
    c.post("/api/assets", json={"asset_type": "route", "name": "Tuyen Gan",
                                "latitude": 13.9, "longitude": 108.0,
                                "geometry": line}, headers=h)
    r = c.get("/api/assets/nearest-route?lat=13.9&lon=108.05").json()
    assert r["asset"]["name"] == "Tuyen Gan"
    assert 0 <= r["distance_km"] < 10


def test_m1_stations_nearest_spec_contract():
    c = setup()
    h = auth_headers(c)
    empty = c.get("/api/stations/nearest?lat=13.9&lon=108.3").json()
    assert empty["station_name"] is None and empty["contact"] is None
    c.post("/api/assets", json={"asset_type": "station", "name": "Tram Spec",
                                "latitude": 13.91, "longitude": 108.31,
                                "contact": "0123-456"}, headers=h)
    s = c.get("/api/stations/nearest?lat=13.9&lon=108.3").json()
    for k in ("station_name", "station_type", "distance_km", "eta_minutes",
              "contact", "operational_status"):
        assert k in s, k
    assert s["station_name"] == "Tram Spec" and s["contact"] == "0123-456"
    assert s["operational_status"] == "active"


def test_m2_routes_nearest_spec_contract_no_fake_pgrouting():
    c = setup()
    h = auth_headers(c)
    empty = c.get("/api/routes/nearest?lat=13.9&lon=108.3").json()
    assert empty["route_name"] is None and "BLOCKED" in empty["pgrouting"]
    line = {"type": "LineString", "coordinates": [[108.0, 13.9], [108.1, 13.95]]}
    c.post("/api/assets", json={"asset_type": "route", "name": "Tuyen Spec",
                                "latitude": 13.9, "longitude": 108.0,
                                "geometry": line, "route_type": "dirt",
                                "road_condition": "FAIR"}, headers=h)
    r = c.get("/api/routes/nearest?lat=13.9&lon=108.05").json()
    for k in ("route_name", "distance_km", "route_type", "road_condition", "geometry"):
        assert k in r, k
    assert r["route_name"] == "Tuyen Spec" and r["road_condition"] == "FAIR"
    assert "fastest_route" not in r and "safest_route" not in r


def test_m3_unified_threatened_assets():
    c = setup()
    h = auth_headers(c)
    c.post("/api/assets", json={"asset_type": "station", "name": "Tram Hot",
                                "latitude": 14.062, "longitude": 109.02}, headers=h)
    d = c.get("/api/assets/threatened?lat=14.062&lon=109.02&wind_speed_kmh=15&wind_direction_deg=90").json()
    for k in ("operational_threats", "water_threats", "communes_per_step", "summary"):
        assert k in d, k
    assert any(t["name"] == "Tram Hot" and t["band"] == "CRITICAL"
               for t in d["operational_threats"])
    assert {s["hour"] for s in d["communes_per_step"]} == {1.0, 3.0, 6.0}
