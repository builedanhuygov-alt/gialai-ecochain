"""Viewer 360 (Panoee-first): priority, whitelist, verification, detail page,
AI notes, new asset types. Only real media is ever shown."""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import Base, engine, init_db
from app.main import create_app
from app.services import twin_ops as ops
from tests.helpers import auth_headers


def setup():
    Base.metadata.drop_all(bind=engine)
    app = create_app()
    init_db()
    try:
        from app.seed import seed_demo
        seed_demo()
    except Exception:
        pass
    return TestClient(app)


def test_priority_panoee_first():
    # panoee URL beats streetview flag (field 360 outranks possibly-stale SV)
    v = ops.viewer_fallback(True, "https://panoee.net/tour123", 5, 108.3, 13.9)
    assert v["viewer_type"] == "panoee" and v["verification_status"] == "verified"
    # streetview flag alone (no URL): existence reported, NO generated link
    v2 = ops.viewer_fallback(True, None, 0, 108.3, 13.9)
    assert v2["viewer_type"] == "streetview" and v2["viewer_url"] is None
    # google-domain URL opens streetview tier with the stored URL
    v3 = ops.viewer_fallback(False, "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=13.9,108.3",
                             0, 108.3, 13.9)
    assert v3["viewer_type"] == "streetview" and v3["verification_status"] == "verified"
    # unlisted URL: never VERIFIED
    v4 = ops.viewer_fallback(False, "https://videos.example.com/x", 0, 108.3, 13.9)
    assert v4["verification_status"] == "field_check_required"
    # photos proximity is ESTIMATED, never verified
    v5 = ops.viewer_fallback(False, None, 3, 108.3, 13.9)
    assert v5["viewer_type"] == "photos" and v5["verification_status"] == "estimated"
    # coords only → satellite; nothing → none/field_check_required
    assert ops.viewer_fallback(False, None, 0, 108.3, 13.9)["viewer_type"] == "satellite"
    v6 = ops.viewer_fallback(False, None, 0, None, None)
    assert v6["viewer_type"] == "none" and v6["verification_status"] == "field_check_required"


def test_classify_domains():
    assert ops.classify_viewer_url("https://panoee.net/abc")["kind"] == "panoee"
    assert ops.classify_viewer_url("https://cloud.panoee.net/x")["trusted"] is True
    assert ops.classify_viewer_url("https://maps.google.com/abc")["kind"] == "streetview"
    assert ops.classify_viewer_url("ftp://x")["kind"] == "invalid"
    assert ops.classify_viewer_url(None)["trusted"] is False


def test_viewer_note_sentences_exact():
    assert ops.viewer_note_sentence("Ho A", {"viewer_type": "panoee"}) == \
        "Ho A: Quan sát hiện trường 360° khả dụng."
    assert ops.viewer_note_sentence("Ho B", {"viewer_type": "satellite"}) == \
        "Ho B: Hiện trường có dữ liệu hình ảnh."
    assert ops.viewer_note_sentence("Ho C", {"viewer_type": "none"}) == \
        "Ho C: Chưa có dữ liệu hình ảnh xác minh."


def test_asset_detail_endpoint_ops_and_water():
    c = setup()
    h = auth_headers(c)
    r = c.post("/api/assets", json={"asset_type": "watchtower", "name": "Choi D",
                                    "latitude": 13.9, "longitude": 108.3,
                                    "viewer_url": "https://panoee.net/t1",
                                    "capture_source": "flycam-doi-1",
                                    "capture_date": "2026-08-01"}, headers=h)
    assert r.status_code == 200, r.text
    d = c.get(f"/api/assets/{r.json()['id']}/detail").json()
    assert d["kind"] == "operational" and d["viewer"]["viewer_type"] == "panoee"
    assert d["viewer"]["capture"] == {"capture_date": "2026-08-01 00:00:00",
                                      "capture_source": "flycam-doi-1"}
    w = c.get("/api/water/assets").json()["assets"][0]
    dw = c.get(f"/api/assets/{w['id']}/detail").json()
    assert dw["kind"] == "water" and "viewer" in dw
    assert c.get("/api/assets/nope/detail").status_code == 404


def test_plan_has_viewer_notes_and_bulletin_imagery():
    c = setup()
    d = c.post("/api/v1/fires/response-plan", json={"lon": 109.02, "lat": 14.06}).json()
    assert "viewer_notes" in d and isinstance(d["viewer_notes"], list)
    assert d["primary_water"] is not None and "viewer" in d["primary_water"]
    assert "hinh_anh_hien_truong" in d["analyst_bulletin"]
    assert any("hình ảnh" in n["note"] or "360" in n["note"] for n in d["viewer_notes"])


def test_new_asset_types_accepted():
    c = setup()
    h = auth_headers(c)
    for t in ("community_hall", "risk_point"):
        r = c.post("/api/assets", json={"asset_type": t, "name": f"X {t}",
                                        "latitude": 13.9, "longitude": 108.3}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["viewer"]["viewer_type"] == "satellite"


def test_registry_hotline_count_and_phones():
    c = setup()
    r = c.get("/api/stations/registry").json()
    assert r["total"] == 28 and r["missing_gps"] == 28
    phones = [x["phone"] for x in r["stations"]]
    assert "0982448557" in phones and "0913602445" in phones and "0988128638" in phones
    assert all(x["gps_status"] == "MISSING" for x in r["stations"])
    d = c.get("/api/assets/contacts").json()
    assert d["total"] == 16 + 28
    reg = [x for x in d["directory"] if x["id"] is None]
    assert len(reg) == 28 and all(x["contact_status"] == "PARTIAL" for x in reg)
