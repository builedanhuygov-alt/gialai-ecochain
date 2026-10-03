"""Field missions — closed field loop.

POST /api/missions is restricted to admin/ranger (checked in backend, not
just by hiding the button). Results feed back: CONFIRMED_FIRE creates a
verified community report + an alert; FALSE_ALARM is recorded for the
false-alarm statistics used to retune weights later (never auto-retuned).
"""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_role
from app.database import get_db
from app.models.mission import (
    FIELD_CHECKLIST, MISSION_DECISIONS, MISSION_NEXT, MISSION_OUTCOMES,
    MISSION_STATUSES, FieldResult, Mission,
)

router = APIRouter(tags=["Missions"])
MISSION_RADIUS_KM = 1.0


def _shape(m: Mission, result: Optional[FieldResult] = None) -> dict:
    try:
        checks = json.loads(m.checklist) if m.checklist else []
    except Exception:
        checks = []
    return {
        "id": m.id, "area": m.area, "cell_id": m.cell_id,
        "latitude": m.latitude, "longitude": m.longitude,
        "risk_at_creation": m.risk_at_creation, "priority": m.priority,
        "zone": m.zone, "inspection_priority": m.inspection_priority,
        "decision": m.decision, "decided_by": m.decided_by,
        "due_at": m.due_at.isoformat() if m.due_at else None,
        "status": m.status, "assignee": m.assignee, "created_by": m.created_by,
        "checklist_steps": FIELD_CHECKLIST, "checklist_done": checks,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "result": ({
            "id": result.id, "outcome": result.outcome, "note": result.note,
            "photo_hash": result.photo_hash,
            "latitude": result.latitude, "longitude": result.longitude,
            "reporter_id": result.reporter_id,
            "observed_at": result.observed_at.isoformat() if result.observed_at else None,
            "vegetation": result.vegetation, "smoke_heat": result.smoke_heat,
            "human_activity": result.human_activity,
            "water_source": result.water_source, "access": result.access,
            "match_result": result.match_result,
            "created_at": result.created_at.isoformat() if result.created_at else None,
        } if result else None),
    }


@router.get("/missions/checklist")
def checklist_template():
    return {"steps": FIELD_CHECKLIST}


@router.post("/missions")
def create_mission(body: dict, db: Session = Depends(get_db),
                   user=Depends(require_role("ranger"))):
    """Create a field mission (admin or ranger only)."""
    area = str(body.get("area") or "").strip()
    if not area:
        raise HTTPException(400, "area is required")

    def num(k):
        v = body.get(k)
        return float(v) if v not in (None, "") else None
    try:
        lat, lon = num("latitude"), num("longitude")
    except (TypeError, ValueError):
        raise HTTPException(400, "latitude/longitude must be numeric")
    if lat is not None and not (-90 <= lat <= 90 and lon is not None and -180 <= lon <= 180):
        raise HTTPException(400, "coordinates out of range")
    risk = body.get("risk_at_creation")
    try:
        risk = int(risk) if risk not in (None, "") else None
    except (TypeError, ValueError):
        raise HTTPException(400, "risk_at_creation must be an integer")
    if risk is not None and not (0 <= risk <= 100):
        raise HTTPException(400, "risk_at_creation must be 0..100")
    priority = str(body.get("priority") or "NORMAL").upper()
    if priority not in ("LOW", "NORMAL", "HIGH", "CRITICAL"):
        raise HTTPException(400, "priority must be LOW/NORMAL/HIGH/CRITICAL")
    due = None
    if body.get("due_at"):
        try:
            due = datetime.fromisoformat(str(body["due_at"])[:19])
        except ValueError:
            raise HTTPException(400, "due_at must be ISO datetime")

    m = Mission(area=area[:300], cell_id=str(body.get("cell_id") or "")[:40] or None,
                latitude=lat, longitude=lon, risk_at_creation=risk, priority=priority,
                due_at=due, status="NEW",
                assignee=str(body.get("assignee") or "")[:100] or None,
                created_by=user.username)
    db.add(m); db.commit(); db.refresh(m)
    try:
        from app.services.audit import audit_log
        audit_log(db, action='MISSION_CREATED', resource_type='mission', resource_id=m.id,
                  detail=f'{m.area} risk={m.risk_at_creation}', actor_id=user.username); db.commit()
    except Exception:
        pass
    return _shape(m)


@router.get("/missions")
def list_missions(status: Optional[str] = Query(default=None),
                  db: Session = Depends(get_db)):
    q = db.query(Mission).order_by(Mission.created_at.desc())
    if status:
        if status not in MISSION_STATUSES:
            raise HTTPException(400, f"status must be one of {MISSION_STATUSES}")
        q = q.filter_by(status=status)
    missions = q.limit(200).all()
    ids = [m.id for m in missions]
    results = db.query(FieldResult).filter(FieldResult.mission_id.in_(ids)).all() if ids else []
    by_mission = {r.mission_id: r for r in results}
    return {"missions": [_shape(m, by_mission.get(m.id)) for m in missions],
            "count": len(missions)}


@router.get("/missions/recommendations")
async def recommend_inspections(db: Session = Depends(get_db)):
    """ĐỀ XUẤT KIỂM TRA THỰC ĐỊA (không phải điều động/lệnh).

    Điều kiện: Risk ≥ 55 HOẶC hotspot ≤ 3 km. Ưu tiên FIELD INSPECTION
    PRIORITY (0–100) chỉ để sắp thứ tự — không cộng vào Fire Risk Score.
    AI không tự giao nhiệm vụ, không tự phát cảnh báo.
    """
    from datetime import timedelta
    from app.core.time import utcnow
    from app.services.fire_risk import compute_inspection_priority, recommend_field_checks
    from app.services.village_fire import haversine

    # Điểm nóng trực tiếp (giới hạn 200 để tính khoảng cách).
    fires: list = []
    try:
        from app.services.firms_service import fetch_firms_gialai
        data = await fetch_firms_gialai(day_range=1)
        if isinstance(data, dict) and data.get("status") in ("LIVE", "CACHED", "STALE"):
            fires = [f for f in data.get("fires", []) if not f.get("suspect_artificial")][:200]
    except Exception:
        fires = []

    # Ứng viên: xã có centroid, chấm điểm chung một lần gọi.
    from app.services import communes as cs
    units_all = cs.get_communes(db, limit=500)
    units = [u for u in units_all if u.get("centroid")]
    import httpx
    # Dùng commune-levels nội bộ thay vì gọi HTTP chính mình.
    from app.api.routes.fire import commune_levels as _levels
    try:
        lv = await _levels({"units": [{"name": u["name"], "lat": u["centroid"][0],
                                       "lon": u["centroid"][1]} for u in units]})
    except Exception:
        lv = {"levels": []}

    # Trạm gần nhất cho khả năng tiếp cận.
    try:
        from app.models.ops import OperationalAsset as _OA
        tram = [(a.latitude, a.longitude) for a in
                db.query(_OA).filter(_OA.status == "active").all()
                if a.latitude is not None and a.longitude is not None]
    except Exception:
        tram = []

    ra: list = []
    for it in (lv.get("levels") or []):
        try:
            risk = it.get("score")
            risk = int(risk) if risk is not None else None
        except (TypeError, ValueError):
            risk = None
        lat, lon = it.get("lat"), it.get("lon")
        gan_nhat, tin_cay = None, None
        for f in fires:
            try:
                d = haversine(lon, lat, float(f["longitude"]), float(f["latitude"]))
            except (TypeError, ValueError, KeyError):
                continue
            if gan_nhat is None or d < gan_nhat:
                gan_nhat, tin_cay = d, f.get("confidence")
        if not ((risk is not None and risk >= 55) or (gan_nhat is not None and gan_nhat <= 3)):
            continue
        tiep_can = any(haversine(lon, lat, t[1], t[0]) <= 15 for t in tram) if tram else False
        uu = compute_inspection_priority(risk, gan_nhat, tin_cay,
                                         temp_trend_up=False, access_ok=tiep_can)
        ten_xa = it.get("name", "?")
        ly_do = []
        if risk is not None and risk >= 55:
            ly_do.append(f"Risk {risk}/100 ≥ 55")
        if gan_nhat is not None and gan_nhat <= 3:
            ly_do.append(f"điểm nóng cách {gan_nhat:.1f} km")
        # Top yếu tố từ engine dùng chung (không tính lại công thức khác).
        try:
            from app.services.fire_risk import FireRiskInput, compute_score
            from app.services.weather_service import current_summary, fetch_current
            w = await fetch_current(lat, lon)
            s = current_summary(w) if w.get("status") in ("LIVE", "CACHED", "STALE") else {}
            r0 = compute_score(FireRiskInput(
                temperature=s.get("temperature"), humidity=s.get("humidity"),
                rainfall=s.get("rainfall"), wind_speed=s.get("wind_speed"),
                hotspot_count=1 if (gan_nhat is not None and gan_nhat <= 3) else 0,
                firms_observed=True), origin="LIVE")
            top = sorted(r0.breakdown, key=lambda f: r0.breakdown[f] * r0.weights_used.get(f, 0),
                         reverse=True)[:3]
        except Exception:
            top = []
        from app.services.fire_risk import CHECKLIST_4
        han = utcnow() + timedelta(hours=24)
        ra.append({
            "tieu_de": "ĐỀ XUẤT KIỂM TRA THỰC ĐỊA",
            "area": ten_xa, "zone": it.get("key") or "",
            "latitude": lat, "longitude": lon,
            "risk": risk, "priority": uu["priority"], "muc": uu["muc"],
            "han": han.isoformat(), "han_text": uu["han"],
            "ly_do": ly_do,
            "hotspot": ({"khoang_cach_km": round(gan_nhat, 2), "do_tin_cay": tin_cay}
                        if gan_nhat is not None else None),
            "top_yeu_to": top,
            "viec_theo_yeu_to": recommend_field_checks(top),
            "checklist": CHECKLIST_4,
            "origin": "LIVE",
        })
    ra.sort(key=lambda x: x["priority"], reverse=True)
    return {"recommendations": ra[:10], "count": min(len(ra), 10),
            "ghi_chu": "Ưu tiên chỉ để sắp thứ tự xem xét, không phải xác suất cháy."}


@router.post("/missions/recommendations/decide")
def decide_recommendation(body: dict, db: Session = Depends(get_db),
                          user=Depends(require_role("ranger"))):
    """Con người quyết định: XAC_NHAN / TU_CHOI / CAN_THEM_DU_LIEU.

    Chỉ XAC_NHAN mới tạo nhiệm vụ. Mọi quyết định đều ghi nhật ký.
    """
    from app.services.audit import audit_log
    quyet = str(body.get("decision") or "").upper()
    if quyet not in MISSION_DECISIONS:
        raise HTTPException(400, f"decision must be one of {MISSION_DECISIONS}")
    area = str(body.get("area") or "").strip()
    if not area:
        raise HTTPException(400, "area is required")
    risk = body.get("risk")
    try:
        risk = int(risk) if risk not in (None, "") else None
    except (TypeError, ValueError):
        raise HTTPException(400, "risk must be an integer")
    prio = body.get("priority")
    try:
        prio = int(prio) if prio not in (None, "") else None
    except (TypeError, ValueError):
        raise HTTPException(400, "priority must be an integer")

    mission_id = None
    if quyet == "XAC_NHAN":
        m = Mission(area=area[:300], zone=str(body.get("zone") or "")[:100] or None,
                    latitude=body.get("latitude"), longitude=body.get("longitude"),
                    risk_at_creation=risk, inspection_priority=prio,
                    priority="HIGH" if (body.get("muc") == "CAO") else "NORMAL",
                    status="NEW", decision=quyet, decided_by=user.username,
                    created_by=user.username)
        db.add(m); db.flush()
        mission_id = m.id
    try:
        audit_log(db, action=f"MISSION_DECISION_{quyet}", resource_type="mission",
                  resource_id=mission_id or area[:36],
                  detail=f"{area} risk={risk} priority={prio}", actor_id=user.username)
    except Exception:
        pass
    db.commit()
    return {"decision": quyet, "mission_id": mission_id, "area": area}


@router.get("/missions/decisions")
def decision_log(db: Session = Depends(get_db)):
    """Nhật ký quyết định (từ audit log)."""
    from app.models.ops import AuditLog
    rows = (db.query(AuditLog)
            .filter(AuditLog.action.like("MISSION_DECISION_%"))
            .order_by(AuditLog.created_at.desc()).limit(100).all())
    return {"decisions": [{
        "id": r.id, "timestamp": r.created_at.isoformat() if r.created_at else None,
        "area": r.resource_id, "action": r.action, "detail": r.detail,
        "actor": r.actor_id, "status": "LOGGED",
    } for r in rows], "count": len(rows)}


@router.delete("/missions/decisions/{entry_id}")
def delete_decision(entry_id: str, db: Session = Depends(get_db),
                    user=Depends(require_role("admin"))):
    from app.models.ops import AuditLog
    r = db.get(AuditLog, entry_id)
    if not r or not (r.action or "").startswith("MISSION_DECISION_"):
        raise HTTPException(404, "Decision log entry not found")
    db.delete(r); db.commit()
    return {"deleted": entry_id}


@router.get("/missions/{mission_id}")
def get_mission(mission_id: str, db: Session = Depends(get_db)):
    m = db.get(Mission, mission_id)
    if not m:
        raise HTTPException(404, "Mission not found")
    r = db.query(FieldResult).filter_by(mission_id=m.id).first()
    return _shape(m, r)


@router.patch("/missions/{mission_id}/status")
def set_status(mission_id: str, body: dict, db: Session = Depends(get_db),
               user=Depends(get_current_user)):
    m = db.get(Mission, mission_id)
    if not m:
        raise HTTPException(404, "Mission not found")
    nxt = str(body.get("status") or "").upper()
    if nxt not in MISSION_STATUSES:
        raise HTTPException(400, f"status must be one of {MISSION_STATUSES}")
    if nxt not in MISSION_NEXT.get(m.status, ()):
        raise HTTPException(400, f"illegal transition {m.status} -> {nxt}")
    m.status = nxt
    if nxt == "ASSIGNED" and body.get("assignee"):
        m.assignee = str(body["assignee"])[:100]
    db.commit(); db.refresh(m)
    try:
        from app.services.audit import audit_log
        audit_log(db, action='MISSION_STATUS', resource_type='mission', resource_id=m.id,
                  detail=f'{m.status}', actor_id=user.username); db.commit()
    except Exception:
        pass
    r = db.query(FieldResult).filter_by(mission_id=m.id).first()
    return _shape(m, r)


@router.patch("/missions/{mission_id}/checklist")
def tick_checklist(mission_id: str, body: dict, db: Session = Depends(get_db),
                   user=Depends(get_current_user)):
    m = db.get(Mission, mission_id)
    if not m:
        raise HTTPException(404, "Mission not found")
    done = body.get("done")
    if not isinstance(done, list) or any(not isinstance(i, int) or not (0 <= i < len(FIELD_CHECKLIST)) for i in done):
        raise HTTPException(400, f"done must be a list of step indices 0..{len(FIELD_CHECKLIST)-1}")
    m.checklist = json.dumps(sorted(set(done)))
    db.commit(); db.refresh(m)
    return {"id": m.id, "checklist_done": sorted(set(done)), "steps": FIELD_CHECKLIST}


@router.post("/missions/{mission_id}/result")
def submit_result(mission_id: str, body: dict, db: Session = Depends(get_db),
                  user=Depends(get_current_user)):
    """Field result. Guards: mission IN_PROGRESS, valid outcome, geotagged
    photo with real bytes (no reuse), GPS within ~1 km of the target."""
    from app.models.community import CitizenReport, PhotoEvidence
    from app.services.village_fire import haversine

    m = db.get(Mission, mission_id)
    if not m:
        raise HTTPException(404, "Mission not found")
    if m.status != "IN_PROGRESS":
        raise HTTPException(400, f"mission must be IN_PROGRESS (is {m.status})")
    if db.query(FieldResult).filter_by(mission_id=m.id).first():
        raise HTTPException(400, "Result already submitted for this mission")
    outcome = str(body.get("outcome") or "").upper()
    if outcome not in MISSION_OUTCOMES:
        raise HTTPException(400, f"outcome must be one of {MISSION_OUTCOMES}")

    def num(k):
        v = body.get(k)
        return float(v) if v not in (None, "") else None
    try:
        lat, lon = num("latitude"), num("longitude")
    except (TypeError, ValueError):
        raise HTTPException(400, "latitude/longitude must be numeric")
    if lat is None or lon is None:
        raise HTTPException(400, "result latitude/longitude are required")
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "coordinates out of range")
    if m.latitude is not None and m.longitude is not None:
        dist = haversine(m.longitude, m.latitude, lon, lat)
        if dist > MISSION_RADIUS_KM:
            raise HTTPException(400, f"Result too far from mission target ({dist:.2f} km > {MISSION_RADIUS_KM} km)")

    photo_hash = str(body.get("photo_hash") or "").strip() or None
    if photo_hash:
        ph = db.query(PhotoEvidence).filter_by(file_hash=photo_hash).first()
        if not ph or not ph.data:
            raise HTTPException(400, "photo_hash must reference uploaded photo bytes")
        if db.query(FieldResult).filter_by(photo_hash=photo_hash).first():
            raise HTTPException(400, "photo already used in another mission result")
        if ph.location_lat is not None and ph.location_lng is not None \
                and m.latitude is not None and m.longitude is not None:
            pdist = haversine(m.longitude, m.latitude, ph.location_lng, ph.location_lat)
            if pdist > MISSION_RADIUS_KM:
                raise HTTPException(400, f"Photo GPS too far from mission target ({pdist:.2f} km)")

    res = FieldResult(mission_id=m.id, outcome=outcome,
                      note=str(body.get("note") or "")[:2000] or None,
                      photo_hash=photo_hash, latitude=lat, longitude=lon,
                      reporter_id=user.username)
    for _k in ("vegetation", "smoke_heat", "human_activity", "water_source", "access"):
        _v = body.get(_k)
        if _v not in (None, ""):
            setattr(res, _k, str(_v)[:1000])
    _obs = body.get("observed_at")
    if _obs:
        try:
            res.observed_at = datetime.fromisoformat(str(_obs)[:19])
        except ValueError:
            raise HTTPException(400, "observed_at must be ISO datetime")
    # AI PREDICTED vs FIELD OBSERVED — chỉ để thống kê, chưa tự đổi trọng số.
    du_doan_chay = (m.risk_at_creation or 0) >= 55
    thay_chay = outcome in ("CONFIRMED_FIRE", "RESOLVED")
    res.match_result = "MATCH" if du_doan_chay == thay_chay else "MISMATCH"
    db.add(res)
    m.status = "DONE"
    side_effects: dict = {}

    if outcome == "CONFIRMED_FIRE":
        rep = CitizenReport(
            user_id=user.username, report_type="FIRE_SUSPICION",
            latitude=lat, longitude=lon,
            note=f"Field confirmed (mission {m.id}): {(body.get('note') or '')[:500]}".strip(),
            administrative_unit_id=None, status="COMMUNITY_VERIFIED")
        db.add(rep)
        db.flush()
        from app.services.alert_engine import alert_engine
        score = m.risk_at_creation if m.risk_at_creation is not None else 70
        confidence = min(95, 60 + (15 if photo_hash else 0))
        alert = alert_engine.create(
            db, risk_type="FIRE", administrative_unit_id=m.area,
            score=score, confidence=confidence,
            explanation=f"Field team confirmed fire at ({lat}, {lon}) — mission {m.id}.",
            geometry={"type": "Point", "coordinates": [lon, lat]})
        side_effects = {"report_id": rep.id, "alert_id": alert.id}
    try:
        from app.services.audit import audit_log
        audit_log(db, action='MISSION_RESULT', resource_type='mission', resource_id=m.id,
                  detail=outcome, actor_id=user.username)
    except Exception:
        pass
    db.commit()
    db.refresh(res)
    out = _shape(m, res)
    out["side_effects"] = side_effects
    return out


@router.get("/missions-stats/summary")
def missions_stats(db: Session = Depends(get_db)):
    """Counts + false-alarm rate overall and by risk band at creation.

    For retuning weights later — weights are NEVER changed automatically.
    """
    missions = db.query(Mission).all()
    results = {r.mission_id: r for r in db.query(FieldResult).all()}

    def band(risk):
        if risk is None:
            return "unknown"
        if risk >= 60:
            return "high"
        if risk >= 40:
            return "medium"
        return "low"

    by_band: dict = {}
    outcomes = {"CONFIRMED_FIRE": 0, "FALSE_ALARM": 0, "RESOLVED": 0}
    for m in missions:
        b = band(m.risk_at_creation)
        slot = by_band.setdefault(b, {"missions": 0, "with_result": 0, "false_alarms": 0})
        slot["missions"] += 1
        r = results.get(m.id)
        if r:
            slot["with_result"] += 1
            outcomes[r.outcome] = outcomes.get(r.outcome, 0) + 1
            if r.outcome == "FALSE_ALARM":
                slot["false_alarms"] += 1
    for slot in by_band.values():
        n = slot["with_result"]
        slot["false_alarm_rate"] = (slot["false_alarms"] / n) if n else None
    total_res = sum(outcomes.values())
    khop = sum(1 for r in results.values() if r.match_result == "MATCH")
    lech = sum(1 for r in results.values() if r.match_result == "MISMATCH")
    return {
        "missions_total": len(missions),
        "by_status": {s: sum(1 for m in missions if m.status == s) for s in MISSION_STATUSES},
        "results": outcomes,
        "false_alarm_rate": (outcomes["FALSE_ALARM"] / total_res) if total_res else None,
        "model_field": {"MATCH": khop, "MISMATCH": lech},
        "by_risk_band": by_band,
        "note": "Statistics only — weights are not adjusted automatically.",
    }
