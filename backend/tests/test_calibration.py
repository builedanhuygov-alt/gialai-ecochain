"""Model believability — confidence must track REAL inputs, not defaults."""
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"
from app.services.fire_risk_engine import FireRiskEngine, score_to_level
from app.services.agents.carbon_guard import carbon_guard
from app.services.agents.disaster_guard import disaster_guard
from app.services.earth_engine.change_detection import risk_from_change

eng = FireRiskEngine()


def test_no_inputs_low_confidence_and_full_missing():
    r = eng.analyze("unit-x")
    assert r["confidence"] < 60, r
    assert set(r["missing"]) == {"satellite", "weather", "terrain", "firms", "community"}
    assert 0 <= r["risk_score"] <= 100


def test_full_inputs_high_confidence_no_missing():
    r = eng.analyze(
        "unit-x",
        satellite={"ndvi": 0.3, "ndmi": 0.2},
        weather={"temperature": 36, "humidity": 25, "rainfall": 0, "wind_speed": 20},
        terrain={"slope": 25, "elevation": 500},
        hotspots=[{"latitude": 13.9, "longitude": 108.3}],
        community=3,
    )
    assert r["confidence"] > 75, r
    assert r["missing"] == []
    assert r["warning_level"] in ("IV", "V")  # dry + hot + windy + hotspots


def test_thresholds_unified_20_40_60_80():
    assert score_to_level(20).value == "I"
    assert score_to_level(21).value == "II"
    assert score_to_level(60).value == "III"
    assert score_to_level(80).value == "IV"
    assert score_to_level(81).value == "V"


def test_carbon_flags_estimated_inputs():
    r = carbon_guard.analyze("unit-x")
    assert set(r["estimated_inputs"]) == {"forest_area_ha", "ndvi", "ndvi_change"}
    assert r["confidence"] <= 65
    r2 = carbon_guard.analyze("unit-x", forest_area_ha=1200, ndvi=0.65, ndvi_change=-0.05)
    assert r2["estimated_inputs"] == []
    assert r2["confidence"] > 65


def test_disaster_reports_estimated_inputs():
    r = disaster_guard.analyze("unit-x", "FLOOD", None, {})
    assert "rainfall" in r["estimated_inputs"] and "elevation" in r["estimated_inputs"]
    r2 = disaster_guard.analyze("unit-x", "FLOOD", None, {"rainfall": 120, "elevation": 60})
    assert r2["estimated_inputs"] == []


# ── Real Gia Lai grounding ──────────────────────────────────────────

def _seeded_db():
    from app.database import Base, engine, init_db, SessionLocal
    Base.metadata.drop_all(bind=engine)
    init_db()
    from app.seed import seed_demo
    seed_demo()
    return SessionLocal()


def test_historical_fires_join_real_communes():
    """The 5 documented Hè-2026 fires must resolve to REAL commune units
    (is_demo=False) with real polygon boundaries — not free-text slugs."""
    from app.models.fire import OfficialFireWarning
    from app.models.administrative import AdministrativeUnit
    db = _seeded_db()
    try:
        warns = db.query(OfficialFireWarning).all()
        assert len(warns) == 5, f"expected 5 historical fires, got {len(warns)}"
        for w in warns:
            u = db.get(AdministrativeUnit, w.administrative_unit_id)
            assert u is not None, f"fire {w.id} is UNJOINED (key={w.administrative_unit_id})"
            assert u.is_demo is False, f"fire joined to demo placeholder {u.name}"
            g = u.geometry_dict()
            assert g is not None and g["type"] in ("Polygon", "MultiPolygon")
    finally:
        db.close()


def test_fire_coords_inside_their_communes():
    """Fires with press-documented GPS coords must fall inside their linked
    commune polygon (point-in-polygon proof the join is geographically true)."""
    from app.models.fire import OfficialFireWarning
    from app.models.administrative import AdministrativeUnit
    from app.seed import _geom_contains
    db = _seeded_db()
    try:
        spots = [w for w in db.query(OfficialFireWarning).all()
                 if "Vũng Chua" in (w.scope or "") or "Cát Thành" in (w.scope or "")]
        assert len(spots) == 2
        for w in spots:
            u = db.get(AdministrativeUnit, w.administrative_unit_id)
            assert u is not None
            g = u.geometry_dict()
            assert g is not None
            # coords documented in the press scope text
            lon, lat = (109.1956, 13.7389) if "Vũng Chua" in w.scope else (109.1792, 14.0417)
            assert _geom_contains(g, lon, lat), f"{u.name} polygon does not contain ({lon},{lat})"
    finally:
        db.close()


def test_burn_signature_thresholds_anchored_on_real_fires():
    """risk_from_change thresholds sanity-checked against documented burns:
    - Cát Thành 133ha stand-replacing burn => severe NDVI drop => CRITICAL
    - Vũng Chua 4.23ha undergrowth burn => strong local signal => HIGH+
    - ±2% seasonal wobble => LOW (must not alert on noise)."""
    s, lvl = risk_from_change(-0.30, -45.0)
    assert lvl.value == "CRITICAL", (s, lvl)
    s, lvl = risk_from_change(-0.12, -18.0)
    assert lvl.value in ("HIGH", "CRITICAL"), (s, lvl)
    s, lvl = risk_from_change(-0.02, -3.0)
    assert lvl.value == "LOW", (s, lvl)
    s, lvl = risk_from_change(+0.05, +8.0)
    assert lvl.value == "LOW", (s, lvl)


def test_factory_returns_gee_agent_only_when_truly_connected(monkeypatch):
    """get_forest_guard_agent must not have dead branches: GEE agent iff
    (not demo AND configured AND connected), else Mock."""
    from app.services.agents.forest_guard import (
        get_forest_guard_agent, MockForestGuardAgent, GEEForestGuardAgent)
    from app.core.config import get_settings, Settings
    from app.services.earth_engine.auth import gee_auth
    from app.core.enums import GEEStatus

    s = get_settings()
    assert isinstance(get_forest_guard_agent(use_mock=True), MockForestGuardAgent)
    assert isinstance(get_forest_guard_agent(use_mock=False), GEEForestGuardAgent)
    # test env is DEMO_MODE=true => auto must be Mock
    assert isinstance(get_forest_guard_agent(), MockForestGuardAgent)

    # simulate a connected production app (is_demo/gee_configured/auth status
    # are read-only properties, so patch the underlying field + class property)
    monkeypatch.setattr(s, "demo_mode", False)
    monkeypatch.setattr(Settings, "gee_configured", property(lambda self: True))
    monkeypatch.setattr(gee_auth, "_status", GEEStatus.CONNECTED)
    assert isinstance(get_forest_guard_agent(), GEEForestGuardAgent)
    monkeypatch.setattr(gee_auth, "_status", GEEStatus.NOT_CONFIGURED)
    assert isinstance(get_forest_guard_agent(), MockForestGuardAgent)


def test_detect_change_real_uses_live_ndvi_not_mock():
    """detect_change_real must consume the service's NDVI (not seeded mocks)
    and score it with the shared heuristic."""
    from app.services.earth_engine.change_detection import detect_change_real
    from app.services.earth_engine.service import NDVIStatistics, EEImageryResult

    class StubSvc:
        def calculate_ndvi(self, params):
            # severe decline AFTER, healthy BEFORE — like a real burn scar
            mean = 0.30 if params.start_date >= "2026-08-01" else 0.62
            return NDVIStatistics(mean=mean, median=mean, min=0.1, max=0.8,
                                  std_dev=0.05, pixel_count=5000)

        def get_imagery(self, params):
            return EEImageryResult(query_id="q", image_count=5,
                                   dataset="COPERNICUS/S2_SR_HARMONIZED",
                                   processing_time_ms=1)

    geom = {"type": "Point", "coordinates": [108.3, 13.9]}
    out = detect_change_real("GL-121", geom, ("2026-06-01", "2026-07-01"),
                             ("2026-08-01", "2026-09-01"), StubSvc())
    assert out["method"] == "REAL_NDVI"
    assert out["ndvi_before"] == 0.62 and out["ndvi_after"] == 0.30
    assert out["classification"] in ("HIGH", "CRITICAL"), out
    assert out["confidence"] >= 70, out  # 5+5 images, low cloud, stable std


def test_current_summary_reads_real_open_meteo_keys():
    """Open-Meteo uses temperature_2m/wind_speed_10m — never invent defaults."""
    from app.services.weather_service import current_summary
    live = {"current": {"temperature_2m": 36.5, "precipitation": 0.0,
                        "wind_speed_10m": 18.0, "wind_direction_10m": 45},
            "hourly": {"relative_humidity_2m": [28, 27, 26]}}
    s = current_summary(live)
    assert s == {"temperature": 36.5, "humidity": 28,
                 "rainfall": 0.0, "wind_speed": 18.0, "wind_direction": 45}
    empty = current_summary({"current": {}})
    assert all(v is None for v in empty.values())
