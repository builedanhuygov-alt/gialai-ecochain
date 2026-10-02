"""FIRMS artificial-heat filter + commune-levels failure accounting.

Regression tests for live-experience bugs: a hotspot on an airport runway
must never become a fire alarm, and partially-failed batch calls must say so.
"""
import os

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient

from app.database import init_db
from app.main import create_app
from app.services.fire_risk_engine import FireRiskEngine
from app.services.firms_service import flag_artificial_heat


def setup():
    app = create_app()
    init_db()
    try:
        from app.seed import seed_demo
        seed_demo()
    except Exception:
        pass
    return TestClient(app)


def test_runway_hotspot_flagged_forest_hotspot_not():
    runway = {"latitude": 13.9550, "longitude": 109.0442, "brightness": 350,
              "confidence": "h", "satellite": "VIIRS"}
    forest = {"latitude": 13.9000, "longitude": 108.3000, "brightness": 350,
              "confidence": "h", "satellite": "VIIRS"}
    out = flag_artificial_heat([runway, forest])
    assert out[0]["suspect_artificial"] is True
    assert out[0]["artificial_source"]["name"] == "Sân bay Phù Cát"
    assert out[0]["artificial_source"]["distance_km"] < 3.5
    assert out[1]["suspect_artificial"] is False
    assert "artificial_source" not in out[1]


def test_analyze_ignores_flagged_hotspots():
    eng = FireRiskEngine()
    flagged = {"latitude": 13.9550, "longitude": 109.0442, "suspect_artificial": True}
    r = eng.analyze("unit-x", satellite={"ndvi": 0.6}, weather={"temperature": 30},
                    terrain={"slope": 10}, hotspots=[flagged])
    assert "firms" in r["missing"], r
    assert r.get("filtered_artificial") == 1
    genuine = {"latitude": 13.9, "longitude": 108.3}
    r2 = eng.analyze("unit-x", satellite={"ndvi": 0.6}, weather={"temperature": 30},
                     terrain={"slope": 10}, hotspots=[genuine])
    assert "firms" not in r2["missing"]
    assert r2.get("filtered_artificial") == 0


def test_commune_levels_reports_failed_units():
    c = setup()
    r = c.post("/api/fire/commune-levels", json={"units": [
        {"id": "ok1", "name": "Xã A", "lat": 13.7, "lon": 108.2},
        {"id": "bad1", "name": "Broken", "lat": "not-a-number", "lon": "nope"},
    ]})
    assert r.status_code == 200
    d = r.json()
    assert d["count"] == 1 and d["failed"] == 1
    assert d["levels"][0]["key"] == "ok1"


def test_ai_chat_never_raw_500():
    """Chatbot must answer (200) or fail with structured 503 — never crash."""
    c = setup()
    r = c.post("/api/ai/chat", json={"query": "Gia Lai có cháy không?"})
    assert r.status_code in (200, 503), r.text
    if r.status_code == 503:
        assert "reason" in r.json()
    else:
        assert "request_id" in r.json()


def test_search_matches_without_diacritics_and_code():
    """Vietnamese users type without diacritics — 'Phu My' must find Phù Mỹ."""
    c = setup()
    r = c.get("/api/search/global?q=Phu My")
    assert r.status_code == 200
    names = [h["name"] for h in r.json()["results"]]
    assert any("Phù Mỹ" in n for n in names), names
    r2 = c.get("/api/search/global?q=GL-121")
    assert r2.status_code == 200
    assert any(h["name"] == "Xã Phù Mỹ Đông" for h in r2.json()["results"])


def test_village_alerts_skip_artificial_heat():
    """The airport-runway false positive must not raise village alerts."""
    from app.services.village_fire import check_villages_within_20km
    runway_fire = {"latitude": 13.95926, "longitude": 109.02085,
                   "acq_date": "2026-09-10", "confidence": "n",
                   "suspect_artificial": True,
                   "artificial_source": {"name": "Sân bay Phù Cát", "distance_km": 2.35}}
    assert check_villages_within_20km([runway_fire]) == []
    real_fire = {"latitude": 13.90, "longitude": 108.30,
                 "acq_date": "2026-09-10", "confidence": "h"}
    alerts = check_villages_within_20km([real_fire])
    assert len(alerts) > 0
    assert all("village" in a and "distance_km" in a for a in alerts)
    assert all(a["latitude"] == 13.90 and a["longitude"] == 108.30 for a in alerts)
    assert all(a["hotspot_id"].startswith("firms-") for a in alerts)
    assert len({a["hotspot_id"] for a in alerts}) == 1


def test_alert_keeps_firms_point_and_labels_nearest_sample_as_reference():
    from app.services.village_fire import check_villages_within_20km

    alert = check_villages_within_20km([{
        "latitude": 13.90, "longitude": 108.30, "acq_date": "2026-10-02",
    }])[0]
    assert alert["latitude"] == 13.90
    assert alert["longitude"] == 108.30
    assert alert["fire_coords"] == [108.30, 13.90]
    assert alert["village_coords"] != alert["fire_coords"]
    assert alert["village_reference"]["origin"] == "reference-sample"


def test_real_firms_point_uses_commune_polygon_not_nearest_reference():
    from app.services.village_fire import attach_admin_locations, check_villages_within_20km

    fire = {
        "latitude": 14.11535, "longitude": 108.56094, "acq_date": "2026-10-02",
    }
    alert = check_villages_within_20km([fire])[0]
    marker = attach_admin_locations([fire], "LIVE")[0]
    assert alert["village_reference"]["commune"] == "Xã Tơ Tung"
    assert alert["location"]["commune"] == "Xã Kông Bơ La"
    assert alert["location"]["verified_by_boundary"] is True
    assert alert["commune"] == "Xã Kông Bơ La"
    assert marker["hotspot_id"] == alert["hotspot_id"]


def test_event_contract_keeps_detection_suspected_and_timeline_source_based():
    from app.services.village_fire import check_villages_within_20km

    alert = check_villages_within_20km([{
        "latitude": 14.11535,
        "longitude": 108.56094,
        "acq_date": "2026-10-02",
        "acq_time": "1421",
        "confidence": "n",
        "satellite": "VIIRS",
        "instrument": "VIIRS_SNPP_NRT",
    }], source_status="LIVE")[0]
    event = alert["event"]
    assert event["event_id"] == alert["hotspot_id"]
    assert event["status"] == "NGHI_NGO"
    assert event["detection"]["latitude"] == 14.11535
    assert event["detection"]["longitude"] == 108.56094
    assert event["detection"]["confidence"] == "n"
    assert event["evidence"] == {
        "firms": True, "sentinel2": None, "sentinel1": None,
        "weather": None, "field_photo": None, "community_report": None,
    }
    assert event["ai_analysis"] is None
    assert event["verification"] == {
        "verified": False, "verified_by": None, "verified_at": None, "method": None,
    }
    assert event["timeline"] == [{
        "time": "2026-10-02T14:21:00Z",
        "event": "NASA FIRMS phát hiện điểm nhiệt",
        "source": "NASA FIRMS",
    }]


def test_event_without_acquisition_timestamp_has_no_timeline_entry():
    from app.services.village_fire import check_villages_within_20km

    alert = check_villages_within_20km([{
        "latitude": 14.11535, "longitude": 108.56094,
    }], source_status="LIVE")[0]
    assert alert["event"]["timeline"] == []


def test_live_event_exists_without_a_nearby_village_reference():
    from app.services.village_fire import attach_admin_locations

    event_record = attach_admin_locations([{
        "latitude": 13.0, "longitude": 108.0, "acq_date": "2026-10-02",
    }], "LIVE")[0]
    assert event_record["village_reference"] is None
    assert event_record["event"]["detection"]["latitude"] == 13.0
    assert event_record["event"]["detection"]["longitude"] == 108.0


def test_fire_alert_route_returns_all_events_and_keeps_legacy_alerts(monkeypatch):
    import asyncio
    from app.services import firms_service

    async def fake_live_firms(**_kwargs):
        return {
            "status": "LIVE",
            "fires": [
                {"latitude": 14.11535, "longitude": 108.56094, "acq_date": "2026-10-02", "acq_time": "1421"},
                {"latitude": 13.0, "longitude": 108.0, "acq_date": "2026-10-02", "acq_time": "1500"},
            ],
        }

    monkeypatch.setattr(firms_service, "fetch_firms_gialai", fake_live_firms)
    response = setup().get("/api/villages/fire-alert")
    assert response.status_code == 200
    payload = response.json()
    assert payload["event_count"] == 2
    assert len(payload["events"]) == 2
    assert payload["alert_count"] == 1
    assert payload["events"][0]["event_id"] == payload["alerts"][0]["hotspot_id"]
    assert payload["events"][1]["village_reference"] is None
    assert payload["events"][1]["detection"]["latitude"] == 13.0


def test_community_fire_report_requires_description_and_preserves_gps(monkeypatch):
    from app.services import firms_service

    fire = {"latitude": 14.11535, "longitude": 108.56094, "acq_date": "2026-10-02", "acq_time": "1421"}
    async def fake_live_firms(**_kwargs):
        return {"status": "LIVE", "fires": [fire]}
    monkeypatch.setattr(firms_service, "fetch_firms_gialai", fake_live_firms)
    client = setup()

    missing_description = client.post("/api/citizen/fire-report", json={"latitude": 14.1, "longitude": 108.5})
    assert missing_description.status_code == 400
    response = client.post("/api/citizen/fire-report", json={
        "description": "Quan sát thấy khói ở sườn đồi.",
        "latitude": 14.11535,
        "longitude": 108.56094,
    })
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["location"] == {"latitude": 14.11535, "longitude": 108.56094}
    assert report["linked_event_id"].startswith("firms-")
    assert report["match_distance_km"] == 0
    assert report["status"] == "COMMUNITY_REPORT_RECEIVED"
    assert report["photo"]["available"] is False
    assert "reported_at" in report and report["reported_at"]
    assert "verified" not in report


def test_community_report_matches_firms_coordinates_not_village_reference(monkeypatch):
    from app.services import firms_service

    async def fake_live_firms(**_kwargs):
        return {"status": "LIVE", "fires": [{
            "latitude": 14.17, "longitude": 108.55, "acq_date": "2026-10-02", "acq_time": "1421",
        }]}
    monkeypatch.setattr(firms_service, "fetch_firms_gialai", fake_live_firms)
    client = setup()
    # The report is exactly at the nearby village reference, but >5 km from FIRMS.
    response = client.post("/api/citizen/fire-report", json={
        "description": "Quan sát khói tại điểm tham chiếu.",
        "latitude": 14.1,
        "longitude": 108.55,
    })
    assert response.status_code == 200
    assert response.json()["linked_event_id"] is None
    assert response.json()["match_distance_km"] is None


def test_community_report_count_tracks_persisted_rows(monkeypatch):
    from app.services import firms_service

    async def fake_live_firms(**_kwargs):
        return {"status": "LIVE", "fires": [{
            "latitude": 14.1234, "longitude": 108.54321, "acq_date": "2026-09-29", "acq_time": "0351",
        }]}
    monkeypatch.setattr(firms_service, "fetch_firms_gialai", fake_live_firms)
    client = setup()
    feed = client.get("/api/villages/fire-alert").json()
    event_id = next(event["event_id"] for event in feed["events"] if event["detection"]["latitude"] == 14.1234)
    base_count = client.get(f"/api/citizen/fire-reports?event_id={event_id}").json()["count"]
    assert base_count == 0
    for note in ("Khói được quan sát từ đường", "Có mùi khét gần khu vực"):
        result = client.post("/api/citizen/fire-report", json={
            "description": note, "latitude": 14.1234, "longitude": 108.54321,
        })
        assert result.status_code == 200
    reports = client.get(f"/api/citizen/fire-reports?event_id={event_id}").json()
    event = next(item for item in client.get("/api/villages/fire-alert").json()["events"] if item["event_id"] == event_id)
    assert reports["count"] == 2
    assert event["community_report_count"] == 2
    assert event["status"] == "DANG_XAC_MINH"
    assert event["verification"]["verified"] is False


def test_report_stays_independent_when_firms_is_unavailable(monkeypatch):
    from app.services import firms_service

    async def unavailable_firms(**_kwargs):
        return {"status": "UNAVAILABLE", "fires": []}
    monkeypatch.setattr(firms_service, "fetch_firms_gialai", unavailable_firms)
    client = setup()
    response = client.post("/api/citizen/fire-report", json={
        "description": "Quan sát thấy khói, chưa rõ nguồn.",
        "latitude": 14.11535,
        "longitude": 108.56094,
    })
    assert response.status_code == 200
    assert response.json()["linked_event_id"] is None
    assert response.json()["status"] == "SUBMITTED"


def test_community_report_and_photo_counts_are_read_from_persistence(monkeypatch):
    from app.models.community import PhotoEvidence
    from app.services import firms_service
    from app.database import SessionLocal
    from io import BytesIO
    from PIL import Image

    async def fake_live_firms(**_kwargs):
        return {"status": "LIVE", "fires": [{
            "latitude": 14.11535, "longitude": 108.56094, "acq_date": "2026-10-02", "acq_time": "1421",
        }]}
    monkeypatch.setattr(firms_service, "fetch_firms_gialai", fake_live_firms)
    client = setup()
    event_id = client.get("/api/villages/fire-alert").json()["events"][0]["event_id"]
    count_before = client.get(f"/api/citizen/fire-reports?event_id={event_id}").json()["count"]
    response = client.post("/api/citizen/fire-report", json={
        "description": "Báo cáo có liên kết FIRMS.", "latitude": 14.11535, "longitude": 108.56094,
    })
    report_id = response.json()["report_id"]
    assert response.json()["linked_event_id"] == event_id
    image = BytesIO()
    Image.new("RGB", (4, 4), (30, 100, 60)).save(image, format="JPEG")
    upload = client.post("/api/evidence", files={"file": ("field.jpg", image.getvalue(), "image/jpeg")}, data={
        "source": "citizen", "source_id": report_id, "uploader_id": "anonymous",
        "lat": "14.11535", "lng": "108.56094",
    })
    assert upload.status_code == 200, upload.text
    with SessionLocal() as db:
        db.add(PhotoEvidence(
            id="metadata-only-community-photo", source="citizen", report_id=report_id,
            uploader_id="anonymous", file_path="db://legacy", file_hash="legacy-no-bytes",
            data=None, content_type="image/jpeg", verification_status="PENDING",
        ))
        db.commit()
    listing = client.get(f"/api/citizen/fire-reports?event_id={event_id}").json()
    report_record = next(item for item in listing["reports"] if item["report_id"] == report_id)
    assert listing["count"] == count_before + 1
    assert report_record["photo"]["available"] is True
    assert len(report_record["photos"]) == 1
    assert report_record["photos"][0]["gps"] == [14.11535, 108.56094]
    event_feed = client.get("/api/villages/fire-alert").json()
    event = next(item for item in event_feed["events"] if item["event_id"] == event_id)
    assert event["status"] == "DANG_XAC_MINH"
    assert event["verification"]["verified"] is False
    assert event["community_report_count"] == count_before + 1
    assert event["evidence"]["community_report"] is True
    assert event["evidence"]["field_photo"] is True
    photo = report_record["photos"][0]
    file_response = client.get(photo["url"])
    assert file_response.status_code == 200 and file_response.content[:2] == b"\xff\xd8"


def test_unauthenticated_user_cannot_verify_photo_evidence():
    from app.models.community import PhotoEvidence
    from app.database import SessionLocal

    client = setup()
    with SessionLocal() as db:
        db.add(PhotoEvidence(
            id="photo-verification-auth-test", source="citizen", uploader_id="anonymous",
            file_path="db://test", file_hash="auth-test", data=b"bytes", content_type="image/jpeg",
        ))
        db.commit()
    response = client.patch("/api/evidence/photo-verification-auth-test/verify", json={"verification_status": "VERIFIED"})
    assert response.status_code in (401, 403)


def test_point_outside_all_commune_polygons_has_no_commune():
    from app.services.village_fire import resolve_commune_by_boundary

    assert resolve_commune_by_boundary(0, 0) is None


def test_no_commune_polygons_means_no_guessed_commune(monkeypatch):
    from app.services import village_fire

    village_fire.resolve_commune_by_boundary.cache_clear()
    monkeypatch.setattr(village_fire, "_commune_boundary_index", lambda: [])
    assert village_fire.resolve_commune_by_boundary(108.56094, 14.11535) is None
    village_fire.resolve_commune_by_boundary.cache_clear()


def test_demo_firms_data_is_not_emitted_as_live_village_alerts():
    from app.services.village_fire import check_villages_within_20km

    assert check_villages_within_20km(
        [{"latitude": 13.90, "longitude": 108.30}], source_status="DEMO"
    ) == []
