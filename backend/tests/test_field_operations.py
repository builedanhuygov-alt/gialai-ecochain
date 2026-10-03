"""Focused acceptance tests for the field-verified operations contract."""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import Base, engine, init_db
from app.main import create_app
from tests.helpers import auth_headers


def setup():
    Base.metadata.drop_all(bind=engine)
    app = create_app()
    init_db()
    return TestClient(app)


def test_worklists_import_idempotently_and_expose_required_contract():
    client = setup()
    response = client.get("/api/operations/tasks")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] >= 50
    gps = next(task for task in data["tasks"] if task["task_id"] == "GPS-01")
    assert gps["status"] == "PENDING"
    assert {"lat", "lon", "verification_date", "verified_by"}.issubset(gps["required_fields"])

    headers = auth_headers(client)
    imported = client.post("/api/operations/tasks/import", headers=headers)
    assert imported.status_code == 200
    assert imported.json()["imported"] == 0


def test_gps_verification_requires_device_evidence_and_identity():
    client = setup()
    headers = auth_headers(client)
    base = {
        "status": "VERIFIED",
        "verified_by": "field-team-01",
        "verification_date": "2026-09-14",
        "evidence_ref": "photo://gps-01",
        "evidence": {
            "gps_source": "device",
            "lat": 13.9,
            "lon": 108.3,
            "timestamp": "2026-09-14T08:00:00Z",
            "asset_photo": "photo://gps-01",
        },
    }
    missing_identity = {**base, "verified_by": ""}
    assert client.post("/api/operations/tasks/GPS-01/verify", json=missing_identity, headers=headers).status_code == 400

    copied_pin = {**base, "evidence": {**base["evidence"], "gps_source": "google_maps"}}
    assert client.post("/api/operations/tasks/GPS-01/verify", json=copied_pin, headers=headers).status_code == 400

    accepted = client.post("/api/operations/tasks/GPS-01/verify", json=base, headers=headers)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "VERIFIED"


def test_readiness_uses_only_explicit_verified_items_and_runtime_is_blocked():
    client = setup()
    headers = auth_headers(client)
    response = client.get("/api/operations/readiness", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["verification_status"]["GPS"]["status"] == "MISSING"
    assert data["verification_status"]["FIRMS"]["status"] == "BLOCKED"
    assert data["decision"]["status"] == "NO-GO"
    assert "score" not in str(data).lower()