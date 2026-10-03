"""Explain / priority / change: single-formula reuse, no second scorer."""
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient
from app.database import init_db
from app.main import create_app
from app.services.fire_risk import (
    CHECKLIST_4, FireRiskInput, compute_inspection_priority, explain,
    recommend_field_checks,
)


def setup():
    app = create_app()
    init_db()
    return TestClient(app)


def _day_input():
    return FireRiskInput(ndvi=0.3, ndmi=0.2, temperature=36, humidity=25,
                         rainfall=0, wind_speed=20, slope=25, hotspot_count=1,
                         firms_observed=True, community_count=2,
                         community_observed=True)


def test_contribution_sums_to_score():
    r = explain(_day_input())
    assert r["score"] is not None
    tong = sum(b["contribution"] for b in r["bars"])
    assert abs(tong - r["score"]) < 1.0
    assert [b["factor"] for b in r["top3"]] == [b["factor"] for b in r["bars"][:3]]
    assert len(r["top3"]) == 3


def test_sentences_change_with_data():
    a = explain(_day_input())
    b = explain(FireRiskInput(temperature=28, humidity=80, rainfall=12, wind_speed=3))
    ta = " ".join(x["mo_ta"] for x in a["top3"])
    tb = " ".join(x["mo_ta"] for x in b["top3"])
    assert ta != tb
    assert "36" in ta  # real temperature value inside the sentence


def test_missing_lowers_confidence_with_notice():
    r = explain(FireRiskInput(temperature=36, humidity=25))
    assert 0.0 < r["confidence"] < 1.0
    assert r["thieu"]
    assert any("Thiếu dữ liệu" in t for t in r["thieu"])


def test_empty_input_no_score():
    r = explain(FireRiskInput())
    assert r["score"] is None and r["confidence"] == 0.0
    assert r["thieu"]


def test_priority_triggers_and_levels():
    assert compute_inspection_priority(54, None)["du_dieu_kien"] is False
    assert compute_inspection_priority(55, None)["du_dieu_kien"] is True
    assert compute_inspection_priority(40, 3.0)["du_dieu_kien"] is True
    assert compute_inspection_priority(40, 3.1)["du_dieu_kien"] is False
    cao = compute_inspection_priority(80, None)
    assert cao["muc"] == "CAO" and "trong ngày" in cao["han"]
    tb = compute_inspection_priority(60, None)
    assert tb["muc"] == "TRUNG BÌNH" and "24 giờ" in tb["han"]
    gan = compute_inspection_priority(60, 2.0)
    assert gan["muc"] == "CAO" and gan["priority"] >= tb["priority"]
    assert 0 <= gan["priority"] <= 100


def test_checklist_has_4_steps_no_firefighting():
    assert len(CHECKLIST_4) == 4
    text = " ".join(CHECKLIST_4).lower()
    assert "chữa cháy" not in text and "dập lửa" not in text


def test_recommend_maps_top_factors():
    recs = recommend_field_checks(["firms_proximity", "wind"])
    assert len(recs) == 2
    assert any("điểm nóng" in r["viec"].lower() or "tại chỗ" in r["viec"] for r in recs)


def test_explain_endpoint_shape():
    c = setup()
    r = c.post("/api/fire-risk/explain", json={"temperature": 36, "humidity": 25,
                                               "rainfall": 0, "wind_speed": 20})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["score"] is not None and len(d["top3"]) == 3
    assert abs(sum(b["contribution"] for b in d["bars"]) - d["score"]) < 1.0


def test_change_endpoint_shape():
    c = setup()
    r = c.get("/api/fire-risk/change?lat=13.9&lon=108.3")
    assert r.status_code in (200, 503), r.text
    if r.status_code == 200:
        d = r.json()
        assert "tom_tat" in d and "chenh_lech" in d and "origin" in d
