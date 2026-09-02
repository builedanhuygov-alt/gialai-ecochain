import os, json
os.environ["DATABASE_URL"]="sqlite:///:memory:"
os.environ["DEMO_MODE"]="true"
from fastapi.testclient import TestClient
from app.database import Base, engine, init_db
from app.main import create_app
def setup():
    Base.metadata.drop_all(bind=engine)
    app=create_app(); init_db()
    try: from app.seed import seed_demo; seed_demo()
    except: pass
    return TestClient(app)
def test_phase8():
    c=setup()
    # Data Fabric Sec2-3
    assert c.get("/api/data-fabric").status_code==200
    assert len(c.get("/api/data-sources").json())>=4
    # Provenance Sec4
    r=c.post("/api/data-provenance", json={"source":"Sentinel-2","collector":"sat","verification":"AI_DETECTED"})
    assert r.status_code==200
    # Lineage Sec5
    assert c.get("/api/data-lineage/rec-123").status_code==200
    # Quality Sec6-7
    assert len(c.get("/api/data-quality").json())>=4
    # Conflict Sec8
    r=c.post("/api/data-conflicts", json={"source_a":"A","source_b":"B"})
    assert r.status_code==200
    # Knowledge Graph Sec10-13
    assert c.get("/api/knowledge-graph").status_code==200
    assert c.get("/api/knowledge-graph/query?q=test").status_code==200
    assert c.get("/api/geosemantic-search?q=fire").status_code==200
    # Spatial Sec14 map Sec15 time machine Sec16-18
    assert c.get("/api/spatial/intelligence?op=buffer").status_code==200
    assert c.get("/api/map/layers").status_code==200
    assert c.get("/api/map/time-machine?time=2024-06").status_code==200
    assert c.get("/api/map/change-timeline/area1").status_code==200
    assert c.get("/api/digital-twin/4.0?area=Gia").status_code==200
    # Event stream Sec19-20
    assert c.post("/api/event-stream/publish", json={"event":"FOREST_CHANGE"}).status_code==200
    assert c.get("/api/event-stream").status_code==200
    # Incident fusion Sec22-28
    # create incident via alert
    unit=c.get("/api/forest/areas").json()[0]["id"]
    c.post("/api/disaster/analyze", json={"administrative_unit_id": unit, "risk_type":"FIRE","inputs":{"temperature":38}})
    r=c.get("/api/incidents")
    assert r.status_code==200
    if r.json():
        iid=r.json()[0]["id"]
        assert c.get(f"/api/incidents/{iid}").status_code==200
    assert c.get("/api/recovery/dashboard").status_code==200
    # Carbon ledger Sec40
    assert c.get("/api/carbon/ledger").status_code==200
    # Logistics network Sec41-44
    assert c.get("/api/logistics/network").status_code==200
    assert c.get("/api/logistics/resilience").status_code==200
    assert c.get("/api/supply-chain/graph").status_code==200
    # Community mobile Sec49
    assert c.post("/api/community/mobile-report", json={"user_id":"u1"}).status_code==200
    assert c.post("/api/evidence/hash", json={"content":"test"}).status_code==200
    # Delegation Sec68-69
    assert c.post("/api/admin/delegate", json={"from":"admin1","to":"admin2","scope":"commune"}).status_code==200
    # AI governance Sec70
    assert c.get("/api/ai/governance").status_code==200
    assert c.post("/api/incident-review", json={"incident_id":"inc1"}).status_code==200
    assert c.post("/api/after-action-report", json={}).status_code==200
    # Public Sec74
    assert c.get("/api/public/eco-report").status_code==200
    assert c.get("/api/public/open").status_code==200
    # API gateway Sec76-77
    assert c.get("/api/api-gateway").status_code==200
    assert c.post("/api/webhooks/subscribe", json={"url":"https://example.com"}).status_code==200
    assert c.get("/api/adapters").status_code==200
    # Notifications Sec80-82 + SLA Sec83
    assert c.get("/api/notifications/smart").status_code==200
    # need alert for SLA
    alerts=c.get("/api/alerts").json()
    if alerts:
        assert c.get(f"/api/sla/{alerts[0]['id']}").status_code==200
    # Strategic advisor Sec88
    assert c.post("/api/strategic/advise", json={"question":"investment priority"}).status_code==200
    assert c.post("/api/investment/simulate", json={"options":["Road","Forest"]}).status_code==200
    # Reports/Semantic Sec96-99
    assert c.get("/api/reports/draft").status_code==200
    assert c.get("/api/search/global?q=Gia").status_code==200
    assert c.get("/api/search/semantic?q=fire").status_code==200
    # Performance Sec104 health Sec109
    assert c.get("/api/performance").status_code==200
    assert c.get("/api/health/full").status_code==200
    # Tenant Sec106
    assert c.get("/api/tenant").status_code==200
    assert c.get("/api/backup/status").status_code==200
    print("Phase8 passed")
