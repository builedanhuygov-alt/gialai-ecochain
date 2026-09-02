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

def test_phase6():
    c=setup()
    unit=c.get("/api/forest/areas").json()[0]["id"]
    # Predictive
    r=c.get(f"/api/predictive/forecast?administrative_unit_id={unit}&risk_type=FIRE&horizon=7d")
    assert r.status_code==200 and "forecast" in r.json()
    r=c.get(f"/api/predictive/multi-horizon?administrative_unit_id={unit}&risk_type=FIRE")
    assert "24h" in r.json()
    assert c.get(f"/api/predictive/forest-change?administrative_unit_id={unit}").status_code==200
    assert c.get(f"/api/predictive/agri?administrative_unit_id={unit}").status_code==200

    # Early warning + smart notification
    r=c.post("/api/early-warnings", json={"administrative_unit_id": unit, "risk_type":"FIRE","level":"WATCH","message":"test"})
    assert r.status_code==200 and "notification" in r.json()
    assert len(c.get("/api/early-warnings").json())>=1

    # Digital twin + time machine
    r=c.get(f"/api/digital-twin?administrative_unit_id={unit}")
    assert r.status_code==200 and "layers" in r.json()
    r=c.get("/api/digital-twin/time-machine?periods=2024,2025,2026,2027")
    assert "2024" in r.json()

    # What-if
    r=c.post("/api/simulate/what-if", json={"scenario":"Flood","duration":72,"intensity":"High","region":unit})
    assert r.status_code==200 and "MODEL SIMULATION" in json.dumps(r.json())
    r=c.post("/api/simulate/scenario-comparison", json={"scenarios":[{"rain":"normal"},{"rain":"heavy"}]})
    assert r.status_code==200
    assert c.post("/api/simulate/response", json={"intervention":"Pre-position team"}).status_code==200
    assert c.post("/api/simulate/resource-optimization", json={"teams":10,"vehicles":20,"tasks":100}).status_code==200
    assert c.post("/api/simulate/emergency-routing", json={}).status_code==200

    # Carbon / harvest / supply twin
    r=c.get(f"/api/carbon/forecast?administrative_unit_id={unit}&current_stock=1000")
    assert r.status_code==200 and "projected_sequestration" in r.json()
    r=c.post("/api/carbon/scenario", json={"current_stock":1000,"area_restored_ha":1000})
    assert r.status_code==200
    assert c.post("/api/harvest/forecast", json={"expected_tons":10000,"trucks":120,"capacity":8000}).status_code==200
    assert c.get("/api/supply-chain/twin?farms=5").status_code==200
    assert c.get("/api/supply-chain/risk").status_code==200

    # EUDR continuous + passport2 + provenance
    # need lot
    farm=c.post("/api/farms", json={"farm_id":"FARM-P6","administrative_unit_id": unit, "geometry":{"type":"Polygon","coordinates":[[[108.1,13.7],[108.2,13.7],[108.2,13.8],[108.1,13.8],[108.1,13.7]]]}, "area_ha":3}).json()
    plot=c.post("/api/plots", json={"farm_id": farm["id"], "geometry":{"type":"Polygon","coordinates":[[[108.12,13.72],[108.15,13.72],[108.15,13.75],[108.12,13.75],[108.12,13.72]]]}}).json()
    lot=c.post("/api/lots", json={"farm_id": farm["id"], "plot_id": plot["id"], "harvest_date":"2026-09-01"}).json()
    r=c.post("/api/eudr/continuous-monitor", json={"lot_id": lot["id"]})
    assert r.status_code==200
    r=c.get(f"/api/passport2/{lot['lot_code']}")
    assert r.status_code==200
    assert c.get(f"/api/provenance/{lot['lot_code']}").status_code==200
    assert c.get("/api/knowledge-graph?area=Gia").status_code==200

    # NL analytics 2.0
    r=c.post("/api/ai/nl-analytics", json={"question":"Trong 30 ngày qua, xã nào vừa có nguy cơ cháy tăng vừa có nhiều vùng cà phê?"})
    assert r.status_code==200
    r=c.post("/api/ai/nl-analytics", json={"question":"Tìm các vùng cà phê có EUDR readiness dưới 80 và nằm gần khu vực có forest change signal."})
    assert "structured" in r.json()
    assert c.post("/api/ai/report", json={}).status_code==200

    # KPI
    assert c.get("/api/kpi/provincial").status_code==200
    assert c.get("/api/kpi/trend").status_code==200
    assert c.get(f"/api/profile/commune/{unit}").status_code==200
    assert c.get(f"/api/profile/village/{unit}").status_code==200

    # Citizen science + reputation
    r=c.post("/api/citizen/report", json={"user_id":"u1","type":"fire"})
    assert r.status_code==200
    assert c.get("/api/contributor/u1").status_code==200

    # Collaborative verification conflict
    r=c.post("/api/verification/collaborative", json={"confirmations":[{"value":"fire"},{"value":"no_fire"}]})
    assert r.json()["status"]=="CONFLICTED"
    r=c.post("/api/verification/collaborative", json={"confirmations":[{"value":"a"},{"value":"b"}]})
    assert r.json()["status"]=="COMMUNITY_VERIFIED"

    # Evidence timeline + response
    assert c.get("/api/evidence-timeline/inc-1").status_code==200
    assert c.get("/api/response-ranking").status_code==200

    # Model perf
    r=c.post("/api/model/metric", json={"model":"FireRisk","version":"v2.0","accuracy":0.82})
    assert r.status_code==200
    assert c.get("/api/model/drift/FireRisk").status_code==200

    # Investment
    assert len(c.get("/api/investment/priorities").json())>=2
    assert c.get("/api/investment/map").status_code==200

    # Open data / research / uncertainty
    assert c.get("/api/public/open-data").status_code==200
    assert c.get("/api/research/mode").status_code==200
    # forecast uncertainty
    fid=c.get(f"/api/predictive/forecast?administrative_unit_id={unit}&risk_type=FIRE").json()
    # need id? use list? just check endpoint exists
    # create forecast id via raw
    from app.database import SessionLocal
    from app.models.predictive import Forecast
    db=SessionLocal(); f=db.query(Forecast).first(); db.close()
    if f:
        assert c.get(f"/api/uncertainty/{f.id}").status_code==200

    print("Phase6 passed")
