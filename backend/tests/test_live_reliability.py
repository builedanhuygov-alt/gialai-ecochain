"""FIRMS artificial-heat filter + commune-levels failure accounting.

Regression tests for live-experience bugs: a hotspot on an airport runway
must never become a fire alarm, and partially-failed batch calls must say so.
"""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import init_db
from app.main import create_app
from app.services.fire_risk_engine import FireRiskEngine
from app.services.firms_service import flag_artificial_heat


def setup():
    app = create_app()
    init_db()
    try:
        from app.seed import seed_demo
        seed_demo()
    except Exception:
        pass
    return TestClient(app)


def test_runway_hotspot_flagged_forest_hotspot_not():
    runway = {"latitude": 13.9550, "longitude": 109.0442, "brightness": 350,
              "confidence": "h", "satellite": "VIIRS"}
    forest = {"latitude": 13.9000, "longitude": 108.3000, "brightness": 350,
              "confidence": "h", "satellite": "VIIRS"}
    out = flag_artificial_heat([runway, forest])
    assert out[0]["suspect_artificial"] is True
    assert out[0]["artificial_source"]["name"] == "Sân bay Phù Cát"
    assert out[0]["artificial_source"]["distance_km"] < 3.5
    assert out[1]["suspect_artificial"] is False
    assert "artificial_source" not in out[1]


def test_analyze_ignores_flagged_hotspots():
    eng = FireRiskEngine()
    flagged = {"latitude": 13.9550, "longitude": 109.0442, "suspect_artificial": True}
    r = eng.analyze("unit-x", satellite={"ndvi": 0.6}, weather={"temperature": 30},
                    terrain={"slope": 10}, hotspots=[flagged])
    assert "firms" in r["missing"], r
    assert r.get("filtered_artificial") == 1
    genuine = {"latitude": 13.9, "longitude": 108.3}
    r2 = eng.analyze("unit-x", satellite={"ndvi": 0.6}, weather={"temperature": 30},
                     terrain={"slope": 10}, hotspots=[genuine])
    assert "firms" not in r2["missing"]
    assert r2.get("filtered_artificial") == 0


def test_commune_levels_reports_failed_units():
    c = setup()
    r = c.post("/api/fire/commune-levels", json={"units": [
        {"id": "ok1", "name": "Xã A", "lat": 13.7, "lon": 108.2},
        {"id": "bad1", "name": "Broken", "lat": "not-a-number", "lon": "nope"},
    ]})
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == 1 and d["failed"] == 1
    assert d["levels"][0]["key"] == "ok1"


def test_ai_chat_never_raw_500():
    """Chatbot must answer (200) or fail with structured 503 — never crash."""
    c = setup()
    r = c.post("/api/ai/chat", json={"query": "Gia Lai có cháy không?"})
    assert r.status_code in (200, 503), r.text
    if r.status_code == 503:
        assert "reason" in r.json()
    else:
        assert "request_id" in r.json()


def test_search_matches_without_diacritics_and_code():
    """Vietnamese users type without diacritics — 'Phu My' must find Phù Mỹ."""
    c = setup()
    r = c.get("/api/search/global?q=Phu My")
    assert r.status_code == 200
    names = [h["name"] for h in r.json()["results"]]
    assert any("Phù Mỹ" in n for n in names), names
    r2 = c.get("/api/search/global?q=GL-121")
    assert r2.status_code == 200
    assert any(h["name"] == "Xã Phù Mỹ Đông" for h in r2.json()["results"])


def test_village_alerts_skip_artificial_heat():
    """The airport-runway false positive must not raise village alerts."""
    from app.services.village_fire import check_villages_within_20km
    runway_fire = {"latitude": 13.95926, "longitude": 109.02085,
                   "acq_date": "2026-09-10", "confidence": "n",
                   "suspect_artificial": True,
                   "artificial_source": {"name": "Sân bay Phù Cát", "distance_km": 2.35}}
    assert check_villages_within_20km([runway_fire]) == []
    real_fire = {"latitude": 13.90, "longitude": 108.30,
                 "acq_date": "2026-09-10", "confidence": "h"}
    alerts = check_villages_within_20km([real_fire])
    assert len(alerts) > 0
    assert all("village" in a and "distance_km" in a for a in alerts)
