"""Curated water assets: seed integrity + spec scoring + nearest ETA."""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import Base, engine, init_db
from app.main import create_app
from app.services import twin_ops as ops


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


def test_seed_has_16_real_waters():
    setup()
    from app.database import SessionLocal
    from app.models.water import WaterAsset
    db = SessionLocal()
    try:
        rows = db.query(WaterAsset).all()
        assert len(rows) == 16, len(rows)
        names = {w.name for w in rows}
        assert "Ayun Hạ" in names and "Ialy" in names and "Hồ Ia Hrung" in names
        # capacities are real magnitudes, not placeholders
        ialy = next(w for w in rows if w.name == "Ialy")
        assert ialy.capacity_m3 == 1037000000
        assert ialy.manager == "EVN"
        # most resolve to real communes (a few border reservoirs fall outside)
        linked = [w for w in rows if w.commune_code]
        assert len(linked) >= 12, len(linked)
        # dead goo.gl links were NOT stored
        assert all((w.google_maps_url is None) for w in rows)
    finally:
        db.close()


def test_spec_scoring_bands_and_formula():
    waters = [
        {"name": "Big Near", "longitude": 108.31, "latitude": 13.91,
         "capacity_m3": 250_000_000, "road_access": True, "status": "verified"},
        {"name": "Far Small", "longitude": 109.5, "latitude": 14.5,
         "capacity_m3": 50000, "road_access": False, "status": "verified"},
        {"name": "Unverified", "longitude": 108.31, "latitude": 13.91,
         "capacity_m3": 999_000_000, "road_access": True, "status": "cần xác minh"},
    ]
    out = ops.score_water_spec(108.3, 13.9, 90.0, waters)
    by_name = {s["name"]: s for s in out["ranked"]}
    assert by_name["Big Near"]["priority"] == "A"
    assert by_name["Far Small"]["priority"] == "C"
    # unverified is ALWAYS C no matter how big
    assert by_name["Unverified"]["priority"] == "C"
    assert out["weights"] == {"distance": 0.40, "capacity": 0.30,
                              "road_access": 0.20, "infrastructure": 0.10}
    assert "formula" in out


def test_water_endpoints_and_eta():
    c = setup()
    r = c.get("/api/water/assets")
    assert r.status_code == 200 and r.json()["count"] == 16
    r2 = c.get("/api/water/assets?asset_type=hydro")
    assert r2.json()["count"] == 4
    n = c.get("/api/water/nearest?lat=14.04&lon=109.18&top=2&avg_speed_kmh=30").json()
    assert len(n["ranked"]) <= 2
    top = n["ranked"][0]
    assert top["priority"] in ("A", "B", "C")
    assert top["eta_minutes"] == round(top["distance_km"] * 1.3 / 30 * 60, 1)
    assert "eta_assumption" in n


def test_response_plan_uses_spec_ranking():
    c = setup()
    r = c.post("/api/v1/fires/response-plan", json={"lon": 109.18, "lat": 14.04, "avg_speed_kmh": 30})
    assert r.status_code == 200, r.text
    d = r.json()
    wr = d["water_ranking"]
    assert wr["weights"]["distance"] == 0.40
    assert all(s["priority"] in ("A", "B", "C") for s in wr["ranked"])
    assert d["nearest_water"] is None or "priority" in d["nearest_water"]
