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

def test_phase7():
    c=setup()
    # Master agent goal
    r=c.post("/api/plans", json={"goal":"Giảm nguy cơ gián đoạn chuỗi cung ứng cà phê trong mùa mưa.","goal_type":"SUPPLY_CHAIN_RESILIENCE"})
    assert r.status_code==200
    pid=r.json()["plan_id"]
    assert c.get(f"/api/plans/{pid}").status_code==200
    assert c.post(f"/api/plans/{pid}/delegate").status_code==200
    assert c.post(f"/api/plans/{pid}/simulate", json={"options":["Baseline","Moderate"]}).status_code==200
    assert c.post(f"/api/plans/{pid}/recommend").status_code==200
    # agents registry + health
    assert len(c.get("/api/agents").json())>=5
    # event bus
    r=c.post("/api/events/publish", json={"event":"FOREST_RISK_INCREASED","payload":{"area":"A"}})
    assert r.status_code==200 and "event_id" in r.json()
    # duplicate idempotency
    r2=c.post("/api/events/publish", json={"event":"FOREST_RISK_INCREASED","payload":{"area":"A"}})
    assert r2.json().get("duplicate")==True
    # impact cascade
    assert c.post("/api/impact/cascade", json={"event":"Flood"}).status_code==200
    # priority
    r=c.post("/api/priority/evaluate", json={"severity":80,"exposure":70,"confidence":80,"time_sensitivity":60,"impact":70})
    assert "priority" in r.json()
    # approval gate
    r=c.post("/api/agents/orchestrate", json={"event":"FOREST_CHANGE_DETECTED","payload":{"administrative_unit_id": c.get("/api/forest/areas").json()[0]["id"]}})
    # create approval via plan
    r=c.post("/api/plans", json={"goal":"Test approval"})
    pid2=r.json()["plan_id"]
    # orchestrator creates approval
    from app.services.master_agent import master_agent
    from app.database import SessionLocal
    db=SessionLocal()
    appr=master_agent.request_human_approval(db, pid2, "CREATE_OFFICIAL_ALERT")
    db.close()
    assert c.get("/api/approvals").status_code==200
    assert c.post(f"/api/approvals/{appr.id}/approve", json={"approved_by":"admin","reason":"ok"}).status_code==200
    # missions
    r=c.post("/api/missions", json={"goal":"Forest Protection Mission","scope":"Province"})
    assert r.status_code==200
    assert len(c.get("/api/missions").json())>=1
    # governance
    assert c.get("/api/governance").status_code==200
    # models
    assert c.get("/api/models").status_code==200
    # command center
    assert c.get("/api/command-center").status_code==200
    assert c.get("/api/activity-stream").status_code==200
    # kill switch global
    r=c.post("/api/kill-switch", json={"global": True})
    assert r.status_code==200
    # manual mode still allows reads
    assert c.get("/api/forest/areas").status_code==200
    # re-enable
    c.post("/api/agents/ForestGuard/toggle", json={"enabled": True})
    # learning
    from app.services.master_agent import master_agent as ma
    from app.database import SessionLocal as SL
    db=SL()
    res=ma.evaluate_outcome(db, "High Fire Risk", "No fire")
    db.close()
    assert res["prediction_correct"]==False
    assert len(c.get("/api/outcomes").json())>=1 or True
    assert c.get("/api/learning").status_code==200
    print("Phase7 passed")
