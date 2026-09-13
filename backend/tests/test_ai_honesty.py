"""AI honesty: smoke/vision/what-if fallbacks must NEVER fabricate detections,
confidences, bboxes, alerts or percentages."""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

import asyncio

from fastapi.testclient import TestClient

from app.database import Base, engine, init_db
from app.main import create_app


def setup():
    Base.metadata.drop_all(bind=engine)
    app = create_app()
    init_db()
    return TestClient(app)


def test_smoke_no_key_never_detects():
    from app.services.ai import smoke_detector as sd
    out = asyncio.run(sd.detect_smoke_from_tile(
        tile_url="https://server.arcgisonline.com/x/{z}/{y}/{x}", lat=13.9, lon=108.3,
        bbox="107.3,13.1,109.4,14.7"))
    assert out["status"] == "UNAVAILABLE"
    r = out["result"]
    assert r["is_smoke"] is False
    assert r["confidence"] is None and r["bbox"] is None and r["alert"] is None
    assert "GEMINI_API_KEY" in r["reason"] or "tải" in r["reason"]


def test_smoke_endpoint_no_fabrication():
    c = setup()
    r = c.post("/api/ai/smoke/detect", json={"tile_url": None, "lat": 13.9, "lon": 108.3})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "UNAVAILABLE"
    assert d["result"]["is_smoke"] is False
    assert d["result"]["alert"] is None
    blob = str(d)
    assert "0.87" not in blob and "CRITICAL" not in blob


def test_vision_fallback_does_not_confirm_fire():
    from app.services import llm_service as llm
    out = asyncio.run(llm.verify_fire_image(image_b64="e30=", gps={"lat": 13.9, "lon": 108.3}))
    # without a working key there must be no positive confirmation
    if out["status"] != "LIVE":
        assert out["status"] == "UNAVAILABLE"
        assert out["result"]["is_real"] is False
        assert out["result"]["confidence"] is None
        assert "0.82" not in str(out)


def test_what_if_advisor_no_invented_percent():
    from app.services import llm_service as llm
    out = asyncio.run(llm.what_if_advisor("H.Chu Prong", 3, 0.25))
    if out["status"] != "LIVE":
        assert out["status"] == "UNAVAILABLE"
        assert "23%" not in str(out) and "%" not in str(out.get("answer", ""))


def test_synthesis_fallback_labeled_demo():
    from app.services import llm_service as llm
    out = asyncio.run(llm.synthesis_pccc(fire_score=90, firms_count=5,
                                         weather={"temperature": 38, "wind_speed": 25, "humidity": 20},
                                         district="H.Test"))
    if out["provider"] != "Gemini" or out["status"] == "DEMO":
        assert out["status"] == "DEMO"
        assert out["risk_level"] == "CRITICAL"  # rule from the REAL score
        assert out["confidence"] <= 0.5
        assert "0.89" not in str(out)
