"""Community fire reports + verification + evidence timeline (early-warning scope).

Kept from the old Phase6 router: citizen fire-report endpoints (with FIRMS
linking), evidence timeline, response ranking, post-event. Everything else
(predictive, twin, simulation, carbon, harvest, EUDR, investment, model
metrics, KPI dials) was removed — out of scope for wildfire early warning.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.evidence_timeline import timeline, response_performance

router = APIRouter(tags=["Community"])

COMMUNITY_EVENT_MATCH_RADIUS_KM = 5.0


async def _match_community_report_to_firms(lat: float, lon: float):
    """Link only to a real FIRMS point within the documented distance threshold."""
    try:
        from app.services.firms_service import fetch_firms_gialai
        from app.services.village_fire import haversine, hotspot_identity
        data = await fetch_firms_gialai(day_range=1)
    except Exception:
        return None, None
    if not isinstance(data, dict):
        return None, None
    if data.get("status") not in ("LIVE", "CACHED", "STALE"):
        return None, None

    best = None
    for fire in data.get("fires", []):
        if fire.get("suspect_artificial"):
            continue
        try:
            fire_lat = float(fire.get("latitude"))
            fire_lon = float(fire.get("longitude"))
        except (TypeError, ValueError):
            continue
        if not (-90 <= fire_lat <= 90 and -180 <= fire_lon <= 180):
            continue
        distance = haversine(lon, lat, fire_lon, fire_lat)
        if distance <= COMMUNITY_EVENT_MATCH_RADIUS_KM and (best is None or distance < best[0]):
            best = (distance, hotspot_identity(fire, fire_lat, fire_lon))
    if best is None:
        return None, None
    return best[1], round(best[0], 2)


def _shape_community_fire_report(report, photos):
    from app.services.evidence import shape as shape_photo
    shaped_photos = []
    for photo in photos:
        if not photo.data:
            continue
        data = shape_photo(photo)
        shaped_photos.append({
            "photo_id": data["id"],
            "url": data["storage_url"],
            "gps": data["gps"],
            "uploaded_at": data["created_at"],
            "verification_status": data["verification_status"],
        })
    return {
        "report_id": report.id,
        "location": {"latitude": report.latitude, "longitude": report.longitude},
        "reported_at": report.created_at.isoformat() if report.created_at else None,
        "description": report.note,
        "photo": {"available": bool(shaped_photos), "url": shaped_photos[0]["url"] if shaped_photos else None},
        "photos": shaped_photos,
        "source": "COMMUNITY",
        "status": report.status,
        "linked_event_id": report.linked_event_id,
        "match_distance_km": report.match_distance_km,
    }


@router.post("/citizen/report")
def citizen_report(body:dict, db:Session=Depends(get_db)):
    """Generic community observation (photo/video/location/note/fire...)."""
    from app.models.community import CitizenReport
    try:
        lat = float(body["lat"]) if body.get("lat") not in (None, "") else None
        lng = float(body.get("lng") or body.get("lon")) if body.get("lng", body.get("lon")) not in (None, "") else None
    except Exception:
        raise HTTPException(400, "lat/lng must be numeric")
    if lat is not None and not (-90 <= lat <= 90 and -180 <= (lng or 0) <= 180):
        raise HTTPException(400, "coordinates out of range")
    rep = CitizenReport(user_id=str(body.get("user_id", "anon"))[:100],
                        report_type=str(body.get("type") or "")[:50] or None,
                        latitude=lat, longitude=lng,
                        note=str(body.get("note") or "")[:2000] or None,
                        administrative_unit_id=body.get("administrative_unit_id"))
    db.add(rep)
    db.commit()
    db.refresh(rep)
    return {"report_id": rep.id, "status": rep.status,
            "types": ["📷", "📍", "🔥"],
            "evidence_url": None, "thumbnail_url": None,
            "photo_upload": "POST /api/evidence (multipart: file, source=citizen, "
                            f"source_id={rep.id}, uploader_id, lat, lng)",
            "note": "Report persisted; attach a real photo to get evidence URLs"}


@router.post("/citizen/fire-report")
async def submit_community_fire_report(body: dict, db: Session = Depends(get_db)):
    """Persist an observation and optionally link it to a nearby real FIRMS detection."""
    from app.models.community import CitizenReport
    description = str(body.get("description") or "").strip()
    if not description:
        raise HTTPException(400, "description is required")
    try:
        lat = float(body.get("latitude"))
        lon = float(body.get("longitude"))
    except (TypeError, ValueError):
        raise HTTPException(400, "latitude and longitude are required")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "coordinates out of range")

    event_id, distance = await _match_community_report_to_firms(lat, lon)
    report = CitizenReport(
        user_id=str(body.get("reporter") or "anonymous")[:100],
        report_type="FIRE_SUSPICION",
        latitude=lat,
        longitude=lon,
        note=description[:2000],
        linked_event_id=event_id,
        match_distance_km=distance,
        status="COMMUNITY_REPORT_RECEIVED" if event_id else "SUBMITTED",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _shape_community_fire_report(report, [])


@router.get("/citizen/fire-reports")
def list_community_fire_reports(
    event_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
):
    from app.models.community import CitizenReport, PhotoEvidence
    query = db.query(CitizenReport).filter(CitizenReport.report_type == "FIRE_SUSPICION")
    if event_id:
        query = query.filter(CitizenReport.linked_event_id == event_id)
    total = query.count()
    reports = query.order_by(CitizenReport.created_at.desc()).limit(limit).all()
    report_ids = [report.id for report in reports]
    photos = db.query(PhotoEvidence).filter(PhotoEvidence.report_id.in_(report_ids)).all() if report_ids else []
    photos_by_report: dict[str, list] = {}
    for photo in photos:
        photos_by_report.setdefault(photo.report_id, []).append(photo)
    shaped = [_shape_community_fire_report(report, photos_by_report.get(report.id, [])) for report in reports]
    return {"reports": shaped, "count": total}


@router.get("/citizen/fire-reports/{report_id}")
def get_community_fire_report(report_id: str, db: Session = Depends(get_db)):
    from app.models.community import CitizenReport, PhotoEvidence
    report = db.query(CitizenReport).filter_by(id=report_id, report_type="FIRE_SUSPICION").first()
    if report is None:
        raise HTTPException(404, "Community fire report not found")
    photos = db.query(PhotoEvidence).filter_by(report_id=report.id).all()
    return _shape_community_fire_report(report, photos)


@router.post("/verification/collaborative")
def collab_verify(body:dict, db:Session=Depends(get_db)):
    confirms=body.get("confirmations",[])
    # 1 user -> PENDING, 2 -> COMMUNITY_VERIFIED, conflicting -> CONFLICTED
    if len(confirms)==1: return {"status":"PENDING"}
    if len([c for c in confirms if c.get("value")=="fire"]) and len([c for c in confirms if c.get("value")=="no_fire"]):
        return {"status":"CONFLICTED","needs_field_verification": True}
    if len(confirms)>=2: return {"status":"COMMUNITY_VERIFIED"}
    return {"status":"PENDING"}


CONFIRM_RADIUS_KM = 1.0
CONFIRM_WINDOW_HOURS = 24


def _get_fire_report_or_404(db: Session, report_id: str):
    from app.models.community import CitizenReport
    report = db.query(CitizenReport).filter_by(id=report_id, report_type="FIRE_SUSPICION").first()
    if report is None:
        raise HTTPException(404, "Community fire report not found")
    return report


@router.post("/citizen/fire-reports/{report_id}/confirm")
def confirm_fire_report(report_id: str, body: dict, db: Session = Depends(get_db)):
    """Verify a community fire report. Rules (400/403, never silent):
    - reporter cannot self-confirm (403)
    - one user and one device per report (400 on repeat)
    - confirmer GPS required and within ~1 km of the report (400)
    - confirmation within 24 h of the report (400)
    """
    from datetime import timedelta
    from sqlalchemy.exc import IntegrityError
    from app.core.time import utcnow
    from app.models.community import CitizenReport, ReportConfirmation
    from app.services.village_fire import haversine

    report = _get_fire_report_or_404(db, report_id)
    user_id = str(body.get("user_id") or "").strip()[:100]
    if not user_id:
        raise HTTPException(400, "user_id is required")
    if user_id == (report.user_id or ""):
        raise HTTPException(403, "Reporter cannot self-confirm")
    try:
        lat = float(body.get("latitude"))
        lon = float(body.get("longitude"))
    except (TypeError, ValueError):
        raise HTTPException(400, "latitude and longitude are required")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "coordinates out of range")
    confirmed = body.get("confirmed", True)
    if not isinstance(confirmed, bool):
        raise HTTPException(400, "confirmed must be boolean")
    device_id = str(body.get("device_id") or "").strip()[:100] or None

    if report.created_at and (utcnow() - report.created_at) > timedelta(hours=CONFIRM_WINDOW_HOURS):
        raise HTTPException(400, "Confirmation window expired (24 h after report)")
    if report.latitude is not None and report.longitude is not None:
        dist = haversine(report.longitude, report.latitude, lon, lat)
        if dist > CONFIRM_RADIUS_KM:
            raise HTTPException(400, f"Confirmation too far from report ({dist:.2f} km > {CONFIRM_RADIUS_KM} km)")

    if db.query(ReportConfirmation).filter_by(report_id=report.id, user_id=user_id).first():
        raise HTTPException(400, "This user already confirmed this report")
    if device_id and db.query(ReportConfirmation).filter_by(report_id=report.id, device_id=device_id).first():
        raise HTTPException(400, "This device already confirmed this report")

    row = ReportConfirmation(report_id=report.id, user_id=user_id, device_id=device_id,
                             confirmed=confirmed, latitude=lat, longitude=lon)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Duplicate confirmation")
    db.refresh(row)
    n_confirms = db.query(ReportConfirmation).filter_by(report_id=report.id, confirmed=True).count()
    if confirmed and n_confirms >= 2 and report.status in ("SUBMITTED", "COMMUNITY_REPORT_RECEIVED", "PENDING"):
        report.status = "COMMUNITY_VERIFIED"
        db.commit()
        db.refresh(report)
    return {"confirmation_id": row.id, "report_id": report.id,
            "report_status": report.status, "confirms": n_confirms}


@router.get("/citizen/fire-reports/{report_id}/confirmations")
def list_confirmations(report_id: str, db: Session = Depends(get_db)):
    from app.models.community import ReportConfirmation
    _get_fire_report_or_404(db, report_id)
    rows = db.query(ReportConfirmation).filter_by(report_id=report_id).order_by(ReportConfirmation.created_at.asc()).all()
    return {"report_id": report_id, "count": len(rows),
            "confirms": sum(1 for r in rows if r.confirmed),
            "confirmations": [{"id": r.id, "user_id": r.user_id,
                               "confirmed": r.confirmed,
                               "latitude": r.latitude, "longitude": r.longitude,
                               "created_at": r.created_at.isoformat() if r.created_at else None}
                              for r in rows]}


@router.get("/evidence-timeline/{incident_id}")
def ev_timeline(incident_id:str):
    tl=timeline(incident_id)
    perf=response_performance(tl)
    return {"timeline": tl, "performance": perf}


@router.get("/response-ranking")
def resp_ranking(db:Session=Depends(get_db)):
    """Ranked from real ACTIVE alerts; empty ranking (not a fake one) when none exist."""
    from app.models.risk import Alert
    from app.services.evidence_timeline import early_action_score
    rows = db.query(Alert).filter_by(status="ACTIVE").order_by(Alert.created_at.desc()).limit(20).all()
    ranking = [{"commune": a.administrative_unit_id, "title": a.title,
                "level": a.level, "rank": i + 1}
               for i, a in enumerate(rows)]
    return {"ranking": ranking,
            "early_action": early_action_score("province", len(rows), 30) if rows else None,
            "note": "ranked ACTIVE alerts only — empty when no active alerts" if not rows else None}


@router.get("/post-event/{incident_id}")
def post_event(incident_id:str, db:Session=Depends(get_db)):
    """Incident + linked evidence counts from DB; causal factors stay MISSING
    until a real after-action review is recorded."""
    from app.models.risk import Incident, IncidentEvidence
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    n_ev = db.query(IncidentEvidence).filter_by(incident_id=incident_id).count()
    return {"incident": incident_id, "title": inc.title, "status": inc.status,
            "evidence_count": n_ev,
            "why_high_damage": None,
            "after_action": None,
            "prediction_accuracy": None,
            "note": "MISSING — no after-action review recorded; factors and accuracy are not estimated"}
