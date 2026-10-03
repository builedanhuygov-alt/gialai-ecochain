"""Closed field loop: RBAC, lifecycle, results, side effects, stats."""
import io
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient
from app.database import Base, engine, init_db
from app.main import create_app


def _jpeg(color=(120, 40, 30)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (640, 480), color).save(buf, format="JPEG")
    return buf.getvalue()


def setup():
    Base.metadata.drop_all(bind=engine)
    app = create_app()
    init_db()
    return TestClient(app)


def _users(c):
    c.post("/api/auth/register", json={"username": "boss", "password": "secret123"})
    c.post("/api/auth/register", json={"username": "ranger1", "password": "secret123"})
    c.post("/api/auth/register", json={"username": "viewer1", "password": "secret123"})
    from app.database import SessionLocal
    from app.models.user import User
    db = SessionLocal()
    db.query(User).filter_by(username="ranger1").first().role = "ranger"
    db.commit(); db.close()

    def token(u):
        r = c.post("/api/auth/login", data={"username": u, "password": "secret123"})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}
    return token("boss"), token("ranger1"), token("viewer1")


def _create(c, h, **kw):
    body = {"area": "Test ridge", "latitude": 13.9, "longitude": 108.3,
            "risk_at_creation": 72, "priority": "HIGH", **kw}
    return c.post("/api/missions", json=body, headers=h)


def _to_progress(c, h, mid, assignee="ranger1"):
    assert c.patch(f"/api/missions/{mid}/status", json={"status": "ASSIGNED", "assignee": assignee}, headers=h).status_code == 200
    assert c.patch(f"/api/missions/{mid}/status", json={"status": "IN_PROGRESS"}, headers=h).status_code == 200


def test_rbac_create():
    c = setup()
    admin, ranger, viewer = _users(c)
    assert c.post("/api/missions", json={"area": "X"}).status_code == 401
    assert _create(c, viewer).status_code == 403
    assert _create(c, admin).status_code == 200
    assert _create(c, ranger).status_code == 200
    # validation
    assert c.post("/api/missions", json={}, headers=admin).status_code == 400
    assert c.post("/api/missions", json={"area": "X", "risk_at_creation": 999}, headers=admin).status_code == 400


def test_lifecycle_forward_only():
    c = setup()
    admin, _, _ = _users(c)
    mid = _create(c, admin).json()["id"]
    # illegal jump
    assert c.patch(f"/api/missions/{mid}/status", json={"status": "DONE"}, headers=admin).status_code == 400
    assert c.patch(f"/api/missions/{mid}/status", json={"status": "NOPE"}, headers=admin).status_code == 400
    _to_progress(c, admin, mid)
    assert c.patch(f"/api/missions/{mid}/status", json={"status": "ASSIGNED"}, headers=admin).status_code == 400
    # checklist
    r = c.patch(f"/api/missions/{mid}/checklist", json={"done": [0, 2]}, headers=admin)
    assert r.status_code == 200 and r.json()["checklist_done"] == [0, 2]
    assert c.patch(f"/api/missions/{mid}/checklist", json={"done": [99]}, headers=admin).status_code == 400


def test_false_alarm_result_and_stats():
    c = setup()
    admin, _, _ = _users(c)
    mid = _create(c, admin).json()["id"]
    # result requires IN_PROGRESS
    r = c.post(f"/api/missions/{mid}/result", json={"outcome": "FALSE_ALARM", "latitude": 13.9, "longitude": 108.3}, headers=admin)
    assert r.status_code == 400
    _to_progress(c, admin, mid)
    # bad outcome / missing gps
    assert c.post(f"/api/missions/{mid}/result", json={"outcome": "MAYBE", "latitude": 13.9, "longitude": 108.3}, headers=admin).status_code == 400
    assert c.post(f"/api/missions/{mid}/result", json={"outcome": "FALSE_ALARM"}, headers=admin).status_code == 400
    # far away
    assert c.post(f"/api/missions/{mid}/result", json={"outcome": "FALSE_ALARM", "latitude": 14.5, "longitude": 108.3}, headers=admin).status_code == 400
    r = c.post(f"/api/missions/{mid}/result", json={"outcome": "FALSE_ALARM", "note": "nothing burning", "latitude": 13.9001, "longitude": 108.3001}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "DONE"
    assert r.json()["result"]["outcome"] == "FALSE_ALARM"
    # second result rejected
    assert c.post(f"/api/missions/{mid}/result", json={"outcome": "FALSE_ALARM", "latitude": 13.9, "longitude": 108.3}, headers=admin).status_code == 400
    s = c.get("/api/missions-stats/summary").json()
    assert s["missions_total"] >= 1
    assert s["results"]["FALSE_ALARM"] >= 1
    assert s["false_alarm_rate"] == 1.0
    assert s["by_risk_band"]["high"]["false_alarm_rate"] == 1.0
    assert "not adjusted automatically" in s["note"]


def test_confirmed_fire_creates_report_and_alert():
    c = setup()
    admin, _, _ = _users(c)
    mid = _create(c, admin).json()["id"]
    _to_progress(c, admin, mid)
    # upload a real photo first
    up = c.post("/api/evidence", files={"file": ("f.jpg", _jpeg(), "image/jpeg")},
                data={"source": "field", "uploader_id": "ranger1", "lat": "13.9001", "lng": "108.3001"})
    assert up.status_code == 200, up.text
    phash = up.json()["file_hash"]
    r = c.post(f"/api/missions/{mid}/result",
               json={"outcome": "CONFIRMED_FIRE", "note": "flames visible",
                     "photo_hash": phash, "latitude": 13.9001, "longitude": 108.3001},
               headers=admin)
    assert r.status_code == 200, r.text
    se = r.json()["side_effects"]
    assert se.get("report_id") and se.get("alert_id")
    # verified community report exists
    rep = c.get(f"/api/citizen/fire-reports/{se['report_id']}")
    assert rep.status_code == 200 and rep.json()["status"] == "COMMUNITY_VERIFIED"
    # photo reuse rejected on another mission
    mid2 = _create(c, admin).json()["id"]
    _to_progress(c, admin, mid2)
    r2 = c.post(f"/api/missions/{mid2}/result",
                json={"outcome": "FALSE_ALARM", "photo_hash": phash,
                      "latitude": 13.9001, "longitude": 108.3001}, headers=admin)
    assert r2.status_code == 400
    # unknown photo hash rejected
    r3 = c.post(f"/api/missions/{mid2}/result",
                json={"outcome": "FALSE_ALARM", "photo_hash": "nope",
                      "latitude": 13.9001, "longitude": 108.3001}, headers=admin)
    assert r3.status_code == 400


def test_missions_honest_empty_and_checklist():
    c = setup()
    _users(c)
    d = c.get("/api/missions").json()
    assert d["missions"] == [] and d["count"] == 0
    t = c.get("/api/missions/checklist").json()
    assert len(t["steps"]) == 5
    assert c.get("/api/missions/nope").status_code == 404
