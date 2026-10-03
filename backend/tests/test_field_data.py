"""Field-data completion (Modules A-F): registry, survey enums, contacts,
threatened communities, viewer chain, gaps audit. No fake data anywhere."""
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


def test_module_a_registry_honest_empty_and_verified():
    c = setup()
    h = auth_headers(c)
    r = c.get("/api/stations/registry").json()
    # 28 hotline rows (real official phones, MISSING GPS — never invented coords)
    assert r["total"] == 28 and r["verified_gps"] == 0 and r["missing_gps"] == 28
    row0 = next(x for x in r["stations"] if x["name"] == "Hạt Kiểm lâm khu vực An Khê")
    assert row0["phone"] == "0903562889" and row0["gps_status"] == "MISSING"
    assert row0["manager"] == "Hạt trưởng"
    c.post("/api/assets", json={"asset_type": "station", "name": "Tram That",
                                "latitude": 13.9, "longitude": 108.3,
                                "district": "H.Dak", "commune": "X.That",
                                "manager": "Hat Kiem lam", "source": "field-survey",
                                "contact_phone": "0900"}, headers=h)
    r2 = c.get("/api/stations/registry").json()
    assert r2["verified_gps"] == 1 and r2["total"] == 29
    row = next(x for x in r2["stations"] if x["name"] == "Tram That")
    for k in ("name", "type", "district", "commune", "manager", "phone",
              "gps_status", "source"):
        assert k in row, k
    assert row["gps_status"] == "VERIFIED" and row["phone"] == "0900"


def test_module_b_survey_enums_reject_garbage():
    c = setup()
    h = auth_headers(c)
    bad = c.post("/api/assets", json={"asset_type": "route", "name": "R",
                                      "latitude": 13.9, "longitude": 108.3,
                                      "road_condition": "dry"}, headers=h)
    assert bad.status_code == 400
    bad2 = c.post("/api/assets", json={"asset_type": "route", "name": "R",
                                       "latitude": 13.9, "longitude": 108.3,
                                       "surface_type": "asphalt"}, headers=h)
    assert bad2.status_code == 400
    ok = c.post("/api/assets", json={"asset_type": "route", "name": "R Tot",
                                     "latitude": 13.9, "longitude": 108.3,
                                     "geometry": {"type": "LineString",
                                                 "coordinates": [[108.3, 13.9], [108.4, 13.95]]},
                                     "road_condition": "fair",
                                     "surface_type": "gravel",
                                     "max_vehicle_tons": 5,
                                     "seasonal_access": "dry-season-only",
                                     "source": "field-survey"}, headers=h)
    assert ok.status_code == 200, ok.text
    d = ok.json()
    assert d["road_condition"] == "FAIR" and d["surface_type"] == "GRAVEL"
    assert d["max_vehicle_tons"] == 5 and d["seasonal_access"] == "DRY_ONLY"
    # PATCH completion loop
    p = c.patch(f"/api/assets/{d['id']}", json={"road_condition": "GOOD",
                                                "seasonal_access": "year-round",
                                                "verification_date": "2026-09-01"}, headers=h)
    assert p.status_code == 200 and p.json()["road_condition"] == "GOOD"
    assert p.json()["seasonal_access"] == "YEAR_ROUND"
    bad3 = c.patch(f"/api/assets/{d['id']}", json={"verification_date": "hom-qua"}, headers=h)
    assert bad3.status_code == 400
    bad4 = c.patch(f"/api/assets/{d['id']}", json={"seasonal_access": "sometimes"}, headers=h)
    assert bad4.status_code == 400


def test_module_c_threatened_communities_no_probability():
    c = setup()
    r = c.get("/api/communities/threatened?lat=14.062&lon=109.02&wind_speed_kmh=15&wind_direction_deg=90")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["n_communes"] >= 1
    for t in d["communes"]:
        assert t["band"] in ("CRITICAL", "THREATENED", "WATCH", "SAFE")
        assert t["population_status"] in ("VERIFIED", "MISSING")
        if t["population_status"] == "VERIFIED":
            assert isinstance(t["population"], int) and t["population"] > 0
    assert "probability" not in str(d).lower()
    assert d["villages_note"].startswith("20 reference-sample")
    assert all(v["population_status"] == "ESTIMATED" for v in d["villages"])
    assert sum(d["summary"].values()) == d["n_communes"]


def test_module_d_contact_directory_statuses():
    c = setup()
    h = auth_headers(c)
    d = c.get("/api/assets/contacts").json()
    # 16 seeded waters: manager real (organization) but no phone/date → PARTIAL
    waters = [x for x in d["directory"] if x["kind"] == "water"]
    assert len(waters) == 16
    assert all(x["contact_status"] == "PARTIAL" for x in waters)
    assert all(x["contact_phone"] is None for x in waters)
    assert all(x["organization"] is not None for x in waters)
    wid = waters[0]["id"]
    p = c.patch(f"/api/water/assets/{wid}/contact",
                json={"contact_person": "A Sau", "contact_phone": "0911",
                      "verification_date": "2026-08-20", "source": "field"}, headers=h)
    assert p.status_code == 200, p.text
    d2 = c.get("/api/assets/contacts").json()
    row = next(x for x in d2["directory"] if x["id"] == wid)
    assert row["contact_status"] == "VERIFIED" and row["contact_phone"] == "0911"
    assert d2["summary"]["VERIFIED"] == 1


def test_module_e_viewer_chain_priority():
    c = setup()
    h = auth_headers(c)
    d = c.get("/api/water/assets").json()
    assert d["count"] == 16
    by_name = {w["name"]: w for w in d["assets"]}
    # seeded streetview flags survive honestly
    sv = [w for w in d["assets"] if w["viewer"]["viewer_type"] == "streetview"]
    assert len(sv) >= 1
    assert all(w["viewer"]["status"] == "VERIFIED" for w in sv)
    rest = [w for w in d["assets"] if w["viewer"]["viewer_type"] != "streetview"]
    assert all(w["viewer"]["viewer_type"] == "satellite" for w in rest)
    assert all(w["viewer"]["viewer_type"] in
               ("streetview", "photos", "panoee", "satellite", "none") for w in d["assets"])
    # panoee tier via whitelisted viewer_url on ops asset
    r = c.post("/api/assets", json={"asset_type": "watchtower", "name": "Choi 360",
                                    "latitude": 13.9, "longitude": 108.3,
                                    "viewer_url": "https://panoee.net/aBc123"}, headers=h).json()
    assert r["viewer"]["viewer_type"] == "panoee"
    assert r["viewer"]["verification_status"] == "verified"
    v = c.get(f"/api/assets/{r['id']}/viewer").json()
    assert v["viewer_type"] == "panoee" and v["status"] == "VERIFIED"
    # unlisted domain: tier kept, verification capped at field_check_required
    r2 = c.post("/api/assets", json={"asset_type": "watchtower", "name": "Choi La",
                                     "latitude": 13.9, "longitude": 108.3,
                                     "viewer_url": "https://pano.example.com/x"}, headers=h).json()
    assert r2["viewer"]["viewer_type"] == "panoee"
    assert r2["viewer"]["verification_status"] == "field_check_required"


def test_module_f_gaps_endpoint_shape():
    c = setup()
    d = c.get("/api/ops/gaps").json()
    assert d["water"]["total"] == 16
    assert len(d["water"]["missing_contact"]) == 16
    assert d["stations"]["verified_gps"] == 0 and d["stations"]["missing_gps"] == 28
    assert d["routes"]["total"] == 0
    assert d["communities"]["communes_with_population"].startswith("134/134")
    assert "generated_at" in d
