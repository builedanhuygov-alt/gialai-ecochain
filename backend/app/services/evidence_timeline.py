"""Evidence timeline — built ONLY from persisted rows.

Unknown incident -> empty timeline (never an invented 7-step story).
Gaps are measured from real timestamps; missing steps stay missing.
"""
from app.database import SessionLocal


def timeline(incident_id: str) -> list:
    from app.models.risk import Incident, IncidentEvidence
    db = SessionLocal()
    try:
        inc = db.get(Incident, incident_id)
        if inc is None:
            return []
        events = []
        if inc.created_at is not None:
            events.append({"time": inc.created_at.isoformat(), "event": "Incident recorded"})
        rows = (db.query(IncidentEvidence).filter_by(incident_id=incident_id)
                .order_by(IncidentEvidence.created_at.asc()).all())
        for row in rows:
            events.append({
                "time": row.created_at.isoformat() if row.created_at else None,
                "event": row.evidence_type or "Evidence",
            })
        return events
    finally:
        db.close()


def _minutes(a, b) -> int | None:
    try:
        return int((b - a).total_seconds() // 60)
    except Exception:
        return None


def response_performance(timeline_rows: list) -> dict:
    """Measure gaps between consecutive real events; None when unmeasurable."""
    from datetime import datetime
    times = []
    for row in timeline_rows:
        try:
            times.append(datetime.fromisoformat(row["time"]) if row.get("time") else None)
        except Exception:
            times.append(None)
    times = [t for t in times if t is not None]
    if len(times) < 2:
        return {"detection_to_notification_min": None,
                "notification_to_assignment_min": None,
                "assignment_to_verification_min": None,
                "verification_to_resolution_min": None,
                "note": "INSUFFICIENT_DATA — fewer than 2 timestamped events"}
    gaps = [_minutes(times[i], times[i + 1]) for i in range(len(times) - 1)]
    keys = ["detection_to_notification_min", "notification_to_assignment_min",
            "assignment_to_verification_min", "verification_to_resolution_min"]
    out = {keys[i]: (gaps[i] if i < len(gaps) else None) for i in range(4)}
    return out


def early_action_score(commune_id: str, warnings: int, response_time_avg: float) -> int:
    return min(100, warnings * 10 + int(100 / max(1, response_time_avg)))
