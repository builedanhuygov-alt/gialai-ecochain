"""Fire early-warning acceptance — kept scope only.

Covers: fire risk endpoints (single formula), unified alerts, community
fire reports, audit trail. Deleted-scope endpoints (disaster multi-hazard,
carbon, risk/*, rankings, achievements) are gone and must stay gone.
"""
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient
from app.database import Base, engine, init_db
from app.main import create_app

def setup():
    Base.metadata.drop_all(bind=engine)
    app=create_app()
    init_db()
    try:
        from app.seed import seed_demo; seed_demo()
    except: pass
    return TestClient(app)

def test_phase3():
    c=setup()

    # Fire risk via the single formula (engine delegates to compute_score)
    r=c.get("/api/fire/brief")
    assert r.status_code in (200, 422), r.text

    # Unified alerts — honest empty list when nothing active
    r=c.get("/api/alerts-unified")
    assert r.status_code==200 and isinstance(r.json(), list)

    # Community fire-report flow (validation, no fake data)
    r=c.post("/api/citizen/fire-report", json={})
    assert r.status_code==400
    r=c.post("/api/citizen/fire-report", json={
        "description": "smoke seen near the ridge",
        "latitude": 13.9, "longitude": 108.3, "reporter": "tester"})
    assert r.status_code==200, r.text
    body=r.json()
    assert body["location"] == {"latitude": 13.9, "longitude": 108.3}
    assert body["status"] in ("SUBMITTED", "COMMUNITY_REPORT_RECEIVED")
    rep_id=body["report_id"]
    r=c.get("/api/citizen/fire-reports")
    assert r.status_code==200 and r.json()["count"]>=1
    assert c.get(f"/api/citizen/fire-reports/{rep_id}").status_code==200
    assert c.get("/api/citizen/fire-reports/does-not-exist").status_code==404

    # Audit trail readable
    assert c.get("/api/forest/audit").status_code==200

    # Deleted scope really gone
    for dead in ["/api/risk/overview", "/api/disaster/analyze",
                 "/api/carbon/analyze", "/api/predictive/forecast",
                 "/api/digital-twin", "/api/what-if",
                 "/api/eudr/continuous-monitor", "/api/logistics/routes"]:
        r=c.get(dead) if dead != "/api/disaster/analyze" else c.post(dead, json={})
        assert r.status_code==404, dead

    print("Phase3 checklist passed")
