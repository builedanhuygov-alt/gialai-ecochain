"""Forecast rating (CẤP I–V) — deterministic, measured-inputs-only honesty."""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import init_db
from app.main import create_app
from app.services.forecast_rating import rate_forecast, build_bulletin


def test_active_hotspots_force_level_v():
    r = rate_forecast(weather={"temperature": 25, "humidity": 70},
                      weather_available=True, hotspot_count=2, firms_available=True)
    assert r["level"] == "V"
    assert r["label"] == "Cực kỳ nguy hiểm"
    assert "FIRMS" in r["major_risk_driver"]
    assert r["recommended_action"][0].startswith("Đã có điểm nóng")


def test_extreme_heat_and_drought_is_iv():
    r = rate_forecast(weather={"temperature": 38, "humidity": 28, "wind_speed": 22},
                      weather_available=True, hotspot_count=0, firms_available=True,
                      dry_days=8, rain_14d_mm=2.0, rain_available=True)
    assert r["level"] == "IV"
    assert r["operational_status"] == "Sẵn sàng triển khai"


def test_dry_windy_is_iii():
    r = rate_forecast(weather={"temperature": 34, "humidity": 40, "wind_speed": 28},
                      weather_available=True, firms_available=True)
    assert r["level"] == "III"
    assert r["recommended_action"] == ["Nâng mức trực"]


def test_mild_signals_is_ii():
    r = rate_forecast(weather={"temperature": 32, "humidity": 55},
                      weather_available=True, firms_available=True)
    assert r["level"] == "II"


def test_calm_is_i_with_full_story():
    r = rate_forecast(weather={"temperature": 28, "humidity": 70, "rainfall": 5},
                      weather_available=True, firms_available=True,
                      dry_days=0, rain_14d_mm=12.0, rain_available=True,
                      water={"name": "Hồ A", "distance_km": 3.0})
    assert r["level"] == "I"
    assert r["data_coverage_status"] in ("Một phần", "Đầy đủ")
    assert "Theo dõi định kỳ" in r["recommended_action"]


def test_all_missing_stays_honest():
    r = rate_forecast()
    assert r["level"] == "I"  # safest default action, not a claim of safety
    assert r["major_risk_driver"] == "MISSING"
    assert r["data_coverage_status"] == "Hạn chế"
    assert any("FIELD_VERIFICATION_REQUIRED" in a for a in r["recommended_action"])
    assert r["firms_hotspots"] == "MISSING"
    assert set(r["sources"]) == {"Weather", "FIRMS", "GEE", "Sentinel"}


def test_zero_hotspots_without_firms_is_missing_not_clear():
    r = rate_forecast(hotspot_count=0, firms_available=False)
    assert r["components"]["ignition"] == "MISSING"


def test_deterministic_no_jitter():
    kw = dict(weather={"temperature": 36, "humidity": 33, "wind_speed": 20},
              weather_available=True, hotspot_count=0, firms_available=True,
              dry_days=9, rain_available=True, ndvi=0.4)
    assert rate_forecast(**kw) == rate_forecast(**kw)


def test_bulletin_has_no_percent():
    r = rate_forecast(weather={"temperature": 30, "humidity": 50},
                      weather_available=True, firms_available=True)
    b = build_bulletin("Xã A", "xã", r, {"temperature": 30, "condition": "Ít mưa"}, "23:41")
    assert "%" not in b
    assert "CẤP II" in b
    assert "23:41" in b
    for must in ("FIRMS", "Nhiệt độ", "Điều kiện", "Độ phủ", "Yếu tố chính", "Khuyến nghị"):
        assert must in b


def test_level_labels_match_brief():
    assert [rate_forecast.__module__]  # import sanity
    from app.services.forecast_rating import LEVEL_LABELS
    assert LEVEL_LABELS == {"I": "Thấp", "II": "Trung bình", "III": "Cao",
                            "IV": "Nguy hiểm", "V": "Cực kỳ nguy hiểm"}


def test_endpoint_forecast_rating_shape():
    app = create_app()
    init_db()
    c = TestClient(app)
    r = c.get("/api/fire/forecast-rating", params={"administrative_unit_id": "Xã A", "lat": 13.9, "lon": 108.3, "scope": "commune"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["scope"] == "commune"
    rating = d["rating"]
    assert rating["level"] in ("I", "II", "III", "IV", "V")
    for k in ("label", "major_risk_driver", "supporting_factors", "operational_status",
              "recommended_action", "data_coverage_status", "sources", "components"):
        assert k in rating, k
    assert isinstance(d["bulletin"], str) and "CẤP" in d["bulletin"]
