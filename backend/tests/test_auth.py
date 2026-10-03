"""Auth flow — register (first user = admin), login, me."""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import init_db
from app.main import create_app


def _client():
    from app.database import Base, engine

    Base.metadata.drop_all(bind=engine)
    app = create_app()
    init_db()
    return TestClient(app)


def test_register_login_me():
    c = _client()
    r = c.post("/api/auth/register", json={"username": "admin1", "password": "secret123"})
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "admin"  # first user bootstrap

    r = c.post("/api/auth/register", json={"username": "viewer1", "password": "secret123"})
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "viewer"

    r = c.post("/api/auth/register", json={"username": "admin1", "password": "secret123"})
    assert r.status_code == 400  # duplicate

    r = c.post("/api/auth/login", data={"username": "admin1", "password": "wrongpass"})
    assert r.status_code == 401

    r = c.post("/api/auth/login", data={"username": "admin1", "password": "secret123"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    refresh1 = r.json()["refresh_token"]

    r = c.get("/api/auth/me")
    assert r.status_code == 401  # no token
    r = c.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert r.json() == {"id": 1, "username": "admin1", "role": "admin", "is_active": True}

    # refresh token must not work as access token
    r = c.get("/api/auth/me", headers={"Authorization": f"Bearer {refresh1}"})
    assert r.status_code == 401

    # rotation: refresh → new pair, old refresh dies
    r = c.post("/api/auth/refresh", json={"refresh_token": refresh1})
    assert r.status_code == 200, r.text
    token2, refresh2 = r.json()["access_token"], r.json()["refresh_token"]
    assert refresh2 != refresh1
    r = c.get("/api/auth/me", headers={"Authorization": f"Bearer {token2}"})
    assert r.status_code == 200

    # reuse of revoked refresh → 401 + whole chain killed
    r = c.post("/api/auth/refresh", json={"refresh_token": refresh1})
    assert r.status_code == 401
    r = c.post("/api/auth/refresh", json={"refresh_token": refresh2})
    assert r.status_code == 401  # chain revoked after reuse detection

    # logout revokes
    r = c.post("/api/auth/login", data={"username": "admin1", "password": "secret123"})
    refresh3 = r.json()["refresh_token"]
    assert c.post("/api/auth/logout", json={"refresh_token": refresh3}).status_code == 200
    assert c.post("/api/auth/refresh", json={"refresh_token": refresh3}).status_code == 401

    # enforcement: anonymous → 401, viewer → 403 on admin routes
    assert c.delete("/api/assets/some-id").status_code == 401
    r = c.post("/api/auth/login", data={"username": "viewer1", "password": "secret123"})
    vheaders = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert c.delete("/api/assets/some-id", headers=vheaders).status_code == 403
