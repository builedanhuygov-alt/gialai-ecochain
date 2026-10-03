"""Backtest: metrics correct on a dataset with known answers; DEMO labels enforced."""
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient
from app.database import Base, engine, init_db
from app.main import create_app
from app.services.backtest import build_grid, evaluate, roc_points


def setup():
    Base.metadata.drop_all(bind=engine)
    app = create_app()
    init_db()
    return TestClient(app)


def _records():
    # 4 scored records: TP, FP, TN, FN + 1 unscored (skipped)
    return [
        {"cell_id": "a", "date": "2026-09-01", "score": 80, "fire_day": "2026-09-02"},  # TP lead 1
        {"cell_id": "b", "date": "2026-09-01", "score": 75, "fire_day": None},          # FP
        {"cell_id": "c", "date": "2026-09-01", "score": 20, "fire_day": None},          # TN
        {"cell_id": "d", "date": "2026-09-01", "score": 30, "fire_day": "2026-09-03"},  # FN
        {"cell_id": "e", "date": "2026-09-01", "score": None, "fire_day": None},        # skipped
    ]


def test_evaluate_known_answers():
    m = evaluate(_records(), 60)
    assert m["confusion"] == {"tp": 1, "fp": 1, "tn": 1, "fn": 1}
    assert m["precision"] == 0.5
    assert m["recall"] == 0.5
    assert m["f1"] == 0.5
    assert m["false_alarm_rate"] == 0.5
    assert m["mean_lead_time_days"] == 1.0
    assert m["n_samples"] == 5 and m["n_skipped_no_score"] == 1


def test_roc_covers_thresholds():
    pts = roc_points(_records())
    assert [p["threshold"] for p in pts] == [10, 20, 30, 40, 50, 60, 70, 80, 90]
    at60 = next(p for p in pts if p["threshold"] == 60)
    assert at60["tpr"] == 0.5 and at60["fpr"] == 0.5


def test_grid_covers_bbox():
    cells = build_grid(cell_km=5.0)
    assert len(cells) > 500  # Gia Lai at 5 km
    xs = [c["cx"] for c in cells]
    assert min(xs) >= 107.45 and max(xs) <= 109.37


def test_calculate_endpoint_shape_and_rules():
    c = setup()
    r = c.post("/api/fire-risk/calculate", json={"temperature": 38, "humidity": 20})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["origin"] == "USER_INPUT"
    assert d["score"] is not None and d["level"] in ("I", "II", "III", "IV", "V")
    assert 0.0 < d["data_completeness"] < 1.0
    assert isinstance(d["advice"], list) and d["advice"]
    assert "THỬ NGHIỆM" in d["label"]
    # drier must not score lower (monotonicity smoke test)
    r2 = c.post("/api/fire-risk/calculate", json={"temperature": 38, "humidity": 60})
    assert r2.json()["score"] <= d["score"]
    r4 = c.post("/api/fire-risk/calculate", json={"temperature": 38, "humidity": 20, "rainfall": 10})
    r5 = c.post("/api/fire-risk/calculate", json={"temperature": 38, "humidity": 20, "rainfall": 0})
    assert r5.json()["score"] >= r4.json()["score"]  # more drought never scores lower
    # empty body -> no score, not a fake number
    r3 = c.post("/api/fire-risk/calculate", json={})
    assert r3.json()["score"] is None
    # bad input -> 400
    assert c.post("/api/fire-risk/calculate", json={"temperature": "hot"}).status_code == 400


def test_backtest_validates_and_runs_background():
    c = setup()
    assert c.get("/api/fire-risk/backtest?start=2026-09-10&end=2026-09-01").status_code == 400
    assert c.get("/api/fire-risk/backtest?start=2026-01-01&end=2026-12-31").status_code == 400
    assert c.get("/api/fire-risk/backtest?threshold=999").status_code == 422
    r = c.get("/api/fire-risk/backtest?start=2026-09-01&end=2026-09-02&threshold=60")
    assert r.status_code in (200, 202), r.text
    if r.status_code == 200:
        d = r.json()
        assert d["origin"] in ("LIVE", "DEMO / SIMULATED")
        assert "precision" in d and "confusion" in d and "roc" in d
        assert d["period"]["start"] == "2026-09-01"
