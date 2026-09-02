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
def test_phase9():
    c=setup()
    # Twin states Sec3
    r=c.post("/api/digital-twin/state", json={"entity_type":"Forest","entity_id":"f1","state":"CURRENT","payload":{"forest":92}})
    assert r.status_code==200
    assert c.get("/api/digital-twin/states/f1").status_code==200
    # What-if Sec4
    r=c.post("/api/what-if", json={"question":"Điều gì xảy ra nếu mùa mưa năm nay lớn hơn bình thường 20%?"})
    assert r.status_code==200 and "scenario_id" in r.json()
    # Scenario builder Sec5 types Sec6
    r=c.post("/api/scenarios", json={"name":"Test Scenario","type":"CLIMATE","params":{"rainfall":"+20%"}})
    assert r.status_code==200
    sid=r.json()["id"]
    assert c.get("/api/scenarios").status_code==200
    assert c.get(f"/api/scenarios/{sid}").status_code==200
    # fork/versioning Sec70
    r=c.post(f"/api/scenarios/{sid}/fork", json={"change":"test"})
    assert r.status_code==200 and r.json()["version"]==2
    # compare Sec8 score Sec9 scorecard Sec10
    r=c.post("/api/scenarios/compare", json={"ids":[sid]})
    assert r.status_code==200
    assert c.get(f"/api/scenarios/{sid}/scorecard").status_code==200
    # cascading Sec13 temporal Sec16 spatial Sec15
    assert c.post("/api/simulate/cascade", json={"scenario":"Flood"}).status_code==200
    assert c.post("/api/simulate/compound", json={"factors":["Drought","Heatwave"]}).status_code==200
    # Future models
    assert c.get("/api/future/forest/f1").status_code==200
    assert c.get("/api/future/carbon/f1").status_code==200
    assert "Medium" in json.dumps(c.get("/api/future/carbon/f1").json())
    assert c.get("/api/future/agriculture/f1").status_code==200
    assert c.get("/api/future/harvest").status_code==200
    assert c.get("/api/future/logistics").status_code==200
    assert c.post("/api/future/eudr/plot1").status_code==200
    # Pareto Sec28
    assert c.post("/api/pareto", json={"candidates":[{"cost":10}]}).status_code==200
    # Investment Sec32-34
    assert c.post("/api/infrastructure/simulate", json={"investment":50000000000,"target":"Road"}).status_code==200
    assert c.post("/api/investment/optimize", json={"budget":100000000000}).status_code==200
    assert c.get("/api/investment/budget-what-if").status_code==200
    # Commune/village Sec36
    areas=c.get("/api/forest/areas").json()
    cid=[a for a in areas if a["level"]=="COMMUNE"][0]["id"]
    assert c.post(f"/api/simulate/commune/{cid}", json={}).status_code==200
    vid=[a for a in areas if a["level"]=="VILLAGE"][0]["id"]
    assert c.post(f"/api/simulate/village/{vid}", json={}).status_code==200
    # Emergency Sec39-42
    assert c.post("/api/emergency/simulate", json={}).status_code==200
    assert c.post("/api/emergency/resource-allocate", json={"teams":5,"required":8}).status_code==200
    assert c.post("/api/emergency/evacuation", json={}).status_code==200
    # Future map Sec45 side-by-side Sec47 scenario map Sec46
    assert c.get("/api/future/map?horizon=NOW").status_code==200
    assert c.get(f"/api/scenario/map/{sid}").status_code==200
    assert c.get("/api/map/side-by-side").status_code==200
    assert c.get("/api/scenario/timeline").status_code==200
    # Target gap roadmap Sec49-53
    assert c.get("/api/target/2030").status_code==200
    assert c.get(f"/api/gap-analysis/{cid}").status_code==200
    assert c.post("/api/roadmap/generate", json={}).status_code==200
    assert c.post("/api/policy/sandbox", json={"policy":"A"}).status_code==200
    # Explainability Sec57 assumptions Sec58 confidence Sec59
    r=c.get(f"/api/explain/{sid}")
    assert r.status_code==200 and "Why?" in json.dumps(r.json()) or "why" in json.dumps(r.json()).lower()
    # Reproducible Sec68
    assert c.get(f"/api/simulation/{sid}/repro").status_code==200
    # Collaborative Sec71
    assert c.post(f"/api/scenario/{sid}/comment", json={"comment":"test"}).status_code==200
    # Decision record Sec73
    assert c.post("/api/decision/record", json={"decision":"approve","scenario":sid}).status_code==200
    # Outcome Sec74
    assert c.get(f"/api/outcome/{sid}").status_code==200
    # Trade-off Sec80 no-action Sec79
    assert c.get(f"/api/scenario/no-action/{sid}").status_code==200
    assert c.get(f"/api/trade-off/{sid}").status_code==200
    # NL simulator Sec82
    r=c.post("/api/nl/simulate", json={"text":"Mô phỏng tình huống mưa lớn 30%, một tuyến quốc lộ bị gián đoạn 48 giờ và sản lượng cà phê giảm 10%."})
    assert r.status_code==200 and "parsed" in r.json()
    # Data gap Sec85
    assert c.get("/api/data-gap").status_code==200
    # Public future Sec89 hero demo Sec90
    assert c.get("/api/public/future-map").status_code==200
    r=c.post("/api/demo/hero", json={})
    assert r.status_code==200 and "baseline" in r.json()
    print("Phase9 passed")
