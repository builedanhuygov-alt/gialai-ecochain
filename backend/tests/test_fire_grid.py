"""Grid endpoint: GeoJSON cells, scoring rules, DEMO labeling."""
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient
from app.database import Base, engine, init_db
from app.main import create_app


def setup():
    Base.metadata.drop_all(bind=engine)
    app = create_app()
    init_db()
    return TestClient(app)


def test_grid_small_bbox_shape():
    c = setup()
    # tiny bbox -> few cells, fast
    r = c.get("/api/fire-risk/grid?bbox=108.2,13.8,108.4,13.9&cell_km=5")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["type"] == "FeatureCollection"
    assert 1 <= len(d["features"]) <= 60
    f0 = d["features"][0]
    assert f0["geometry"]["type"] == "Polygon"
    p = f0["properties"]
    for k in ("cell_id", "score", "level", "top_factors", "origin", "data_completeness"):
        assert k in p, k
    assert p["origin"] in ("LIVE", "DEMO / SIMULATED")
    if p["score"] is not None:
        assert p["level"] in ("I", "II", "III", "IV", "V")
    assert "meta" in d and d["meta"]["origin"] in ("LIVE", "DEMO / SIMULATED")


def test_grid_demo_scenario_labeled():
    c = setup()
    r = c.get("/api/fire-risk/grid?bbox=108.2,13.8,108.4,13.9&cell_km=5&scenario=demo")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["meta"]["origin"] == "DEMO / SIMULATED"
    assert all(f["properties"]["origin"] == "DEMO / SIMULATED" for f in d["features"])
    # deterministic: same request, same scores
    r2 = c.get("/api/fire-risk/grid?bbox=108.2,13.8,108.4,13.9&cell_km=5&scenario=demo")
    assert [f["properties"]["score"] for f in r2.json()["features"]] == \
           [f["properties"]["score"] for f in d["features"]]


def test_grid_validates():
    c = setup()
    assert c.get("/api/fire-risk/grid?bbox=nope").status_code == 400
    # whole province at 1 km -> too many cells
    assert c.get("/api/fire-risk/grid?cell_km=1").status_code == 400


def test_grid_without_firms_key_stays_honest(monkeypatch):
    """No FIRMS key: endpoint still 200, firms factor missing — never fake fires."""
    from app.core.config import Settings
    monkeypatch.setattr(Settings, "effective_firms_key", property(lambda self: None))
    c = setup()
    r = c.get("/api/fire-risk/grid?bbox=108.2,13.8,108.4,13.9&cell_km=5")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "unavailable" in (d["meta"]["fires"] or "").lower() or d["meta"]["fires"] == "0 live FIRMS points" or "FIRMS" in d["meta"]["fires"]
