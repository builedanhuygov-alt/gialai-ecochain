"""Photo evidence stores REAL bytes (not hash-only) and serves them back."""
import io
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import Base, engine, init_db
from app.main import create_app


def _jpeg(color=(200, 30, 30), size=(640, 480)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


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


def _proposal_id(client):
    from app.database import SessionLocal
    from app.models.pipeline import DataProposal
    db = SessionLocal()
    try:
        p = db.query(DataProposal).first()
        if p:
            return p.id
        p = DataProposal(administrative_unit_id="x", status="PENDING", title="t",
                         ai_result_id="test-ai")
        db.add(p)
        db.commit()
        return p.id
    finally:
        db.close()


def test_upload_stores_bytes_and_serves_them():
    c = setup()
    pid = _proposal_id(c)
    files = {"file": ("fire.jpg", _jpeg(), "image/jpeg")}
    r = c.post(f"/api/forest/proposals/{pid}/photos", files=files,
               data={"uploader_id": "tester", "lat": "13.9", "lng": "108.3"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["url"] and j["thumb_url"] and j["width"] == 640
    # full file round-trips
    rf = c.get(j["url"])
    assert rf.status_code == 200
    assert rf.headers["content-type"] == "image/jpeg"
    assert rf.content[:2] == b"\xff\xd8"  # real JPEG magic
    # thumb is smaller
    rt = c.get(j["thumb_url"])
    assert rt.status_code == 200
    assert len(rt.content) < len(rf.content)
    # detail exposes displayable URLs (the old code had hash-only)
    d = c.get(f"/api/forest/proposals/{pid}").json()
    assert d["photos"][0]["url"] == j["url"]
    assert d["photos"][0]["thumb_url"] == j["thumb_url"]
    # recent feed lists it
    rec = c.get("/api/forest/photos/recent?limit=5").json()
    assert any(p["id"] == j["photo_id"] for p in rec["photos"])


def test_upload_rejects_non_image_and_oversize():
    c = setup()
    pid = _proposal_id(c)
    r = c.post(f"/api/forest/proposals/{pid}/photos",
               files={"file": ("evil.txt", b"not an image at all", "text/plain")},
               data={"uploader_id": "tester"})
    assert r.status_code == 400
    big = {"file": ("big.jpg", b"\xff" * (6 * 1024 * 1024), "image/jpeg")}
    r2 = c.post(f"/api/forest/proposals/{pid}/photos", files=big,
                data={"uploader_id": "tester"})
    assert r2.status_code == 413


def test_photo_file_404_for_unknown():
    c = setup()
    pid = _proposal_id(c)
    assert c.get(f"/api/forest/proposals/{pid}/photos/nope/file").status_code == 404
