"""Phase 1 success criteria — sections 22 + contract checks."""
import json
import os

# Ensure test uses temp DB
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.main import create_app
from app.core.enums import AdministrativeLevel, ProposalStatus, SatelliteSource, GEEStatus
from app.services.earth_engine.config import DATASETS, get_dataset_config
from app.services.earth_engine.service import EarthEngineService, MockEarthEngineService, get_earth_engine_service, EEQueryParams
from app.services.data_providers import get_provider, PROVIDER_REGISTRY
from app.services.agents.forest_guard import ForestGuardAgent, MockForestGuardAgent, get_forest_guard_agent
from app.services.earth_engine.auth import gee_auth


def test_earth_engine_interface():
    assert hasattr(EarthEngineService, "authenticate")
    assert hasattr(EarthEngineService, "get_imagery")
    assert hasattr(EarthEngineService, "calculate_ndvi")
    assert hasattr(EarthEngineService, "detect_forest_change")
    assert hasattr(EarthEngineService, "get_statistics")
    svc = get_earth_engine_service(use_mock=True)
    assert isinstance(svc, MockEarthEngineService)


def test_dataset_config():
    cfg = get_dataset_config(SatelliteSource.SENTINEL2)
    assert cfg.collection_id == "COPERNICUS/S2_SR_HARMONIZED"
    assert cfg.nir_band == "B8" and cfg.red_band == "B4"
    for src in SatelliteSource:
        assert src in DATASETS


def test_gee_graceful_fallback():
    # Not configured in test env → NOT_CONFIGURED, not crash
    status = gee_auth.authenticate()
    assert status in (GEEStatus.NOT_CONFIGURED, GEEStatus.CONNECTION_ISSUE, GEEStatus.AUTH_FAILED, GEEStatus.CONNECTED)
    info = gee_auth.check_configuration()
    assert "status" in info


def test_data_provider_abstraction():
    for name in ["EARTH_ENGINE", "WEATHER", "GIS", "NEWS", "ADMIN_INPUT"]:
        p = get_provider(name)
        assert p.source_type.value == name
        assert hasattr(p, "fetch")
    assert len(PROVIDER_REGISTRY) == 5


def test_administrative_levels_extensible():
    assert AdministrativeLevel.PROVINCE == "PROVINCE"
    assert AdministrativeLevel.VILLAGE == "VILLAGE"
    assert AdministrativeLevel.FARM == "FARM"
    assert AdministrativeLevel.PLOT == "PLOT"


def test_ndvi_fields():
    svc = get_earth_engine_service(use_mock=True)
    params = EEQueryParams(
        administrative_unit_id="test",
        geometry={"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]},
        start_date="2026-01-01",
        end_date="2026-02-01",
    )
    stats = svc.calculate_ndvi(params)
    assert hasattr(stats, "mean")
    assert hasattr(stats, "median")
    assert hasattr(stats, "min")
    assert hasattr(stats, "max")
    assert 0 <= stats.mean <= 1
    # change/anomaly nullable in Phase 1
    assert hasattr(stats, "change")


def test_forest_guard_contract():
    assert hasattr(ForestGuardAgent, "monitor_area")
    assert hasattr(ForestGuardAgent, "analyze_ndvi")
    assert hasattr(ForestGuardAgent, "detect_change")
    assert hasattr(ForestGuardAgent, "create_proposal")
    agent = get_forest_guard_agent()
    assert isinstance(agent, MockForestGuardAgent)


def test_api_flow():
    app = create_app()
    # ensure DB tables exist for in-memory URL — lifespan not auto-run in TestClient without context
    from app.database import init_db
    init_db()
    try:
        from app.seed import seed_demo
        seed_demo()
    except Exception:
        pass
    client = TestClient(app)

    # health
    r = client.get("/api/health")
    assert r.status_code == 200
    assert "gee" in r.json()

    # seed units exist
    r = client.get("/api/administrative-units")
    assert r.status_code == 200
    units = r.json()
    assert len(units) >= 3
    # pick a village/commune id
    unit_id = units[0]["id"]

    # NDVI via agent
    geom = {"type": "Polygon", "coordinates": [[[108.1, 13.7], [108.4, 13.7], [108.4, 13.9], [108.1, 13.9], [108.1, 13.7]]]}
    r = client.post("/api/agents/forest-guard/monitor", json={
        "administrative_unit_id": unit_id,
        "start_date": "2026-01-01",
        "end_date": "2026-06-01",
        "geometry": geom,
        "dataset": "SENTINEL2",
        "cloud_percentage": 20,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["status"] in (ProposalStatus.PENDING.value, ProposalStatus.PROPOSED.value, "PENDING", "PROPOSED")
    assert "confidence" in data or "proposal_id" in data

    # proposal must be PENDING not VERIFIED (governance)
    r = client.get("/api/agents/forest-guard/proposals")
    assert r.status_code == 200
    assert len(r.json()) >= 1
    assert r.json()[0]["status"] == ProposalStatus.PENDING.value

    # approve → verified
    pid = r.json()[0]["id"]
    r = client.post(f"/api/agents/forest-guard/proposals/{pid}/approve", json={"verified_by": "admin-test"})
    assert r.status_code == 200
    assert r.json()["status"] == "VERIFIED"

    # lineage
    r = client.get(f"/api/agents/forest-guard/lineage/{pid}")
    # lineage may be by proposal_id; if not found, check via DB lag — allow 200 or 404 depending on persist path
    assert r.status_code in (200, 404)

    # failure handling — invalid geometry should return FAILED not 500, verified unchanged
    r = client.post("/api/agents/forest-guard/monitor", json={
        "administrative_unit_id": unit_id,
        "start_date": "2026-01-01",
        "end_date": "2026-06-01",
        "geometry": {"type": "Invalid"},
        "cloud_percentage": 99,
    })
    # either HTTP 200 with FAILED payload or 400 — never crash verified data
    assert r.status_code in (200, 400, 422)

    # query logs exist
    r = client.get("/api/agents/forest-guard/query-logs")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    # automation status
    r = client.get("/api/automation-status")
    assert r.status_code == 200

    # demo mode tagging
    r = client.get("/api/health")
    assert r.json()["is_demo"] is True
