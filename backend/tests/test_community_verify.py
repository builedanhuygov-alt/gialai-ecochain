"""Community verification rules: no self-confirm, no repeats (user/device),
1 km radius, 24 h window. Correct 400/403 codes."""
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from datetime import timedelta
from fastapi.testclient import TestClient
from app.database import Base, engine, init_db
from app.main import create_app
from app.core.time import utcnow


def setup():
    Base.metadata.drop_all(bind=engine)
    app = create_app()
    init_db()
    return TestClient(app)


def _report(c, reporter="alice", lat=13.9, lon=108.3):
    r = c.post("/api/citizen/fire-report", json={
        "description": "smoke on the ridge", "latitude": lat,
        "longitude": lon, "reporter": reporter})
    assert r.status_code == 200, r.text
    return r.json()["report_id"]


def _confirm(c, rid, user, lat=13.9005, lon=108.3005, **kw):
    body = {"user_id": user, "latitude": lat, "longitude": lon,
            "confirmed": True, **kw}
    return c.post(f"/api/citizen/fire-reports/{rid}/confirm", json=body)


def test_two_confirms_verify_report():
    c = setup()
    rid = _report(c)
    r1 = _confirm(c, rid, "bob")
    assert r1.status_code == 200, r1.text
    assert r1.json()["confirms"] == 1
    assert r1.json()["report_status"] != "COMMUNITY_VERIFIED"
    r2 = _confirm(c, rid, "carol", lat=13.9002, lon=108.3001)
    assert r2.status_code == 200, r2.text
    assert r2.json()["confirms"] == 2
    assert r2.json()["report_status"] == "COMMUNITY_VERIFIED"
    lst = c.get(f"/api/citizen/fire-reports/{rid}/confirmations").json()
    assert lst["count"] == 2 and lst["confirms"] == 2


def test_reporter_cannot_self_confirm():
    c = setup()
    rid = _report(c, reporter="alice")
    r = _confirm(c, rid, "alice")
    assert r.status_code == 403, r.text


def test_same_user_cannot_confirm_twice():
    c = setup()
    rid = _report(c)
    assert _confirm(c, rid, "bob").status_code == 200
    r = _confirm(c, rid, "bob", lat=13.9001, lon=108.3001)
    assert r.status_code == 400, r.text


def test_same_device_cannot_confirm_twice():
    c = setup()
    rid = _report(c)
    r1 = _confirm(c, rid, "bob", device_id="dev-1")
    assert r1.status_code == 200, r1.text
    r2 = _confirm(c, rid, "carol", device_id="dev-1")
    assert r2.status_code == 400, r2.text


def test_confirmation_outside_radius_rejected():
    c = setup()
    rid = _report(c, lat=13.9, lon=108.3)
    # ~5 km away
    r = _confirm(c, rid, "bob", lat=13.945, lon=108.3)
    assert r.status_code == 400, r.text
    assert "too far" in r.text


def test_confirmation_after_24h_rejected():
    c = setup()
    rid = _report(c)
    from app.database import SessionLocal
    from app.models.community import CitizenReport
    db = SessionLocal()
    rep = db.get(CitizenReport, rid)
    rep.created_at = utcnow() - timedelta(hours=25)
    db.commit(); db.close()
    r = _confirm(c, rid, "bob")
    assert r.status_code == 400, r.text
    assert "expired" in r.text


def test_confirmation_requires_identity_and_gps():
    c = setup()
    rid = _report(c)
    r = c.post(f"/api/citizen/fire-reports/{rid}/confirm",
               json={"latitude": 13.9, "longitude": 108.3})
    assert r.status_code == 400
    r = c.post(f"/api/citizen/fire-reports/{rid}/confirm",
               json={"user_id": "bob"})
    assert r.status_code == 400
    assert c.post("/api/citizen/fire-reports/nope/confirm",
                  json={"user_id": "bob", "latitude": 13.9,
                        "longitude": 108.3}).status_code == 404
