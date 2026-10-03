"""Alert center + field tasks + public portal + reports (kept scope)."""
import os
os.environ["DATABASE_URL"]="sqlite:///:memory:"
os.environ["DEMO_MODE"]="true"
from fastapi.testclient import TestClient
from app.database import Base, engine, init_db
from app.main import create_app
def setup():
    Base.metadata.drop_all(bind=engine)
    app=create_app(); init_db()
    try:
        from app.seed import seed_demo; seed_demo()
    except: pass
    return TestClient(app)

def test_phase5():
    c=setup()

    # Unified alerts (empty is honest when no alerts)
    r=c.get("/api/alerts-unified")
    assert r.status_code==200 and isinstance(r.json(), list)

    # Field task mobile flow
    r=c.post("/api/field-tasks", json={"administrative_unit_id": "unit-x", "reason":"Check","priority":"HIGH","assigned_to":"village"})
    assert r.status_code==200 and "task_id" in r.json()
    tid=r.json()["task_id"]
    r=c.post(f"/api/field-tasks/{tid}/sync", json={"status":"SYNCED"})
    assert r.status_code==200
    assert c.get("/api/field-tasks/mobile").status_code==200

    # Public Portal
    assert c.get("/api/public/map").status_code==200
    assert c.get("/api/public/data-freshness").status_code==200

    # Reports
    assert c.get("/api/reports/generate?type=province").status_code==200

    # Observability: only counted values, no invented success rates
    r=c.get("/api/system/health")
    assert r.status_code==200
    body=r.json()
    assert "agent_runs_total" in body and "agent_failures" in body
    assert "ai_system" not in body

    # Cache + config
    assert c.post("/api/cache/invalidate", json={}).status_code==200
    assert c.get("/api/config/mode").status_code==200

    # Rate limiting quick burst
    for i in range(5):
        assert c.get("/api/health").status_code==200

    print("Phase5 passed")
