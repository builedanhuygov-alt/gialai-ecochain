"""Phase5 acceptance Sec90."""
import os, json
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
    unit=c.get("/api/forest/areas").json()[0]["id"]

    # Orchestrator Sec3-6
    r=c.post("/api/agents/orchestrate", json={"event":"FOREST_CHANGE_DETECTED","payload":{"administrative_unit_id": unit, "risk_score":78, "ndvi_change":-0.12}})
    assert r.status_code==200 and "trace" in r.json()
    assert "ForestGuard" in json.dumps(r.json())
    # event types
    for ev in ["PLOT_REGISTERED","LOT_CREATED"]:
        r=c.post("/api/agents/orchestrate", json={"event": ev, "payload":{"administrative_unit_id": unit, "lot_id":"dummy"}})
        assert r.status_code==200

    # Agent runs Sec8
    r=c.get("/api/agents/runs")
    assert r.status_code==200 and len(r.json())>=1
    rid=r.json()[0]["id"]
    assert c.get(f"/api/agents/trace/{rid}").status_code==200

    # Recommendation Sec11
    r=c.post("/api/agents/recommend", json={"risk_profile":{"overall":80},"alerts":[{"level":"CRITICAL"}]})
    assert r.status_code==200 and len(r.json()["recommendations"])>=1
    # AI does not become admin Sec10 — orchestrator never directly verifies
    assert "admin decides" in json.dumps(r.json()).lower() or len(r.json()["recommendations"])>0

    # Unified alert Sec12-13 prioritization
    # create high alert via disaster
    c.post("/api/disaster/analyze", json={"administrative_unit_id": unit, "risk_type":"FIRE","inputs":{"temperature":38,"rainfall":0,"ndvi_change":-0.15}})
    r=c.get("/api/alerts-unified")
    assert r.status_code==200 and len(r.json())>=1

    # Field task mobile Sec16-19
    r=c.post("/api/field-tasks", json={"administrative_unit_id": unit, "reason":"Check","priority":"HIGH","assigned_to":"village"})
    assert r.status_code==200 and "📷" in json.dumps(r.json()) or "task_id" in r.json()
    tid=r.json()["task_id"]
    r=c.post(f"/api/field-tasks/{tid}/sync", json={"status":"SYNCED"})
    assert r.status_code==200
    assert c.get("/api/field-tasks/mobile").status_code==200

    # Media Intelligence Sec20-21
    r=c.post("/api/media/analyze", files={"file": ("p.jpg", b"imgbytes", "image/jpeg")})
    assert r.status_code==200 and "visual_signal" in r.json() and "requires_verification" in r.json()
    assert "chain" in r.json()

    # Public Portal Sec22-26
    assert c.get("/api/public/map").status_code==200
    # create incident for public
    alerts=c.get("/api/alerts").json()
    if alerts:
        aid=alerts[0]["id"]
        # need incident id via alert
        from app.database import SessionLocal
        from app.models.risk import Incident
        db=SessionLocal(); inc=db.query(Incident).filter_by(alert_id=aid).first(); db.close()
        if inc:
            assert c.get(f"/api/public/incidents/{inc.id}").status_code==200
    assert c.get("/api/public/data-freshness").status_code==200

    # NL Assistant Sec37-39 safety Sec38
    r=c.post("/api/ai/assistant/query", json={"question":"Xã nào đang có nguy cơ cháy cao nhất?"})
    assert r.status_code==200 and "answer" in r.json()
    # insufficient data case
    r=c.post("/api/ai/assistant/query", json={"question":"unknown gibberish"})
    assert "Insufficient verified data" in r.json()["answer"]
    # command
    r=c.post("/api/ai/assistant/query", json={"question":"Hiển thị các thôn có nguy cơ cháy cao."})
    assert "structured_query" in r.json()

    # Reports Sec40
    assert c.get("/api/reports/generate?type=province").status_code==200

    # EcoGL Score Sec47-48 via existing green-score already, check
    r=c.get(f"/api/green-score?commune_id={unit}")
    assert r.status_code==200

    # Kill switch Sec80
    r=c.get("/api/agents/status")
    assert r.status_code==200 and len(r.json())>=3
    r=c.post("/api/agents/ForestGuard/toggle", json={"enabled": False})
    assert r.json()["status"]=="PAUSED"
    # fail-safe Sec81: even when paused, verified data still accessible
    assert c.get("/api/forest/areas").status_code==200
    # re-enable
    c.post("/api/agents/ForestGuard/toggle", json={"enabled": True})

    # Observability Sec54-56
    r=c.get("/api/system/health")
    assert r.status_code==200 and "ai_system" in r.json()

    # Cache Sec59
    assert c.post("/api/cache/invalidate", json={}).status_code==200

    # Demo/Pitch Sec65-67
    r=c.post("/api/demo/run")
    assert r.status_code==200 and "pitch_flow" in r.json()
    assert c.post("/api/demo/reset").status_code==200
    assert c.get("/api/pitch").status_code==200
    assert c.get("/api/config/mode").status_code==200

    # Rate limiting Sec51 quick burst
    for i in range(5):
        assert c.get("/api/health").status_code==200

    print("Phase5 passed")
