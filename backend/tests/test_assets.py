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
