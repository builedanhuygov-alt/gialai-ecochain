"""Scheduler abstraction — Section 4. APScheduler default, Celery/cron swappable."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger
    _HAS_APS = True
except ImportError:
    _HAS_APS = False
    BackgroundScheduler = None  # type: ignore

from app.core.config import get_settings
from app.core.enums import JobStatus


class SchedulerService:
    """Prepare scheduler architecture; heavy jobs NEVER run inside HTTP request."""

    def __init__(self):
        self._scheduler: Any = None
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._enabled = get_settings().scheduler_enabled

    def is_available(self) -> bool:
        return _HAS_APS

    def start(self) -> None:
        if not _HAS_APS:
            logger.warning("APScheduler not installed — scheduler disabled")
            return
        if self._scheduler and self._scheduler.running:
            return
        self._scheduler = BackgroundScheduler(daemon=True)
        self._scheduler.start()
        logger.info("Scheduler started")

        # auto-register forest monitoring if enabled
        if self._enabled:
            try:
                self.register_forest_monitoring_job()
            except Exception as exc:
                logger.warning("Failed to register forest job: %s", exc)

    def shutdown(self) -> None:
        if self._scheduler and self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            logger.info("Scheduler stopped")

    def register_job(
        self,
        job_id: str,
        func: Callable,
        *,
        cron: str | None = None,
        interval_hours: int | None = None,
        args: List[Any] | None = None,
        kwargs: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        if not _HAS_APS or not self._scheduler:
            # graceful degradation — record intent without running
            self._jobs[job_id] = {"cron": cron, "interval_hours": interval_hours, "status": "REGISTERED_NO_SCHEDULER"}
            logger.info("Job %s registered (no scheduler backend)", job_id)
            return self._jobs[job_id]

        trigger = None
        if cron:
            # parse "0 2 * * *"
            parts = cron.split()
            if len(parts) == 5:
                trigger = CronTrigger(minute=parts[0], hour=parts[1], day=parts[2], month=parts[3], day_of_week=parts[4])
            else:
                raise ValueError(f"Invalid cron: {cron}")
        elif interval_hours:
            trigger = IntervalTrigger(hours=interval_hours)
        else:
            raise ValueError("Must provide cron or interval_hours")

        self._scheduler.add_job(func, trigger, id=job_id, args=args or [], kwargs=kwargs or {}, replace_existing=True)
        self._jobs[job_id] = {"cron": cron, "interval_hours": interval_hours, "status": "SCHEDULED", "next_run": str(trigger)}
        logger.info("Job %s scheduled: cron=%s interval=%s", job_id, cron, interval_hours)
        return self._jobs[job_id]

    def register_forest_monitoring_job(self) -> Dict[str, Any]:
        """Sec 4/28 — forest monitoring every 24h, priority aware, quota aware."""
        s = get_settings()

        def _forest_job():
            logger.info("[ForestGuard] Scheduled forest monitoring triggered at %s", datetime.utcnow().isoformat())
            try:
                self.run_forest_cycle()
            except Exception as exc:
                logger.exception("Forest cycle failed: %s", exc)

        return self.register_job(
            "forest_monitoring",
            _forest_job,
            cron=s.forest_monitoring_cron,
            interval_hours=None,
        )

    def run_forest_cycle(self) -> Dict[str, Any]:
        """Sec 28 flow: list monitored areas (priority first) → ForestGuard → GEE → proposal → notification. Quota-aware."""
        from app.database import SessionLocal
        from app.models.ops import ForestJob, MonitoredArea
        from app.services.quota import check_quota, log_quota

        db = SessionLocal()
        try:
            quota = check_quota("GEE")
            if quota["allowed"] != "true":
                log_quota(db, "GEE", quota.get("reason", "RATE_LIMITED"), "cycle throttled")
                db.commit()
                return {"status": "SKIPPED", "reason": quota["reason"]}

            areas = db.query(MonitoredArea).order_by(MonitoredArea.is_priority.desc(), MonitoredArea.last_monitored_at.asc()).all()
            if not areas:
                # fallback: all communes/villages
                from app.models.administrative import AdministrativeUnit
                areas_units = db.query(AdministrativeUnit).filter(AdministrativeUnit.level.in_(["COMMUNE", "VILLAGE"])).limit(20).all()
                for u in areas_units:
                    db.add(MonitoredArea(administrative_unit_id=u.id, is_priority=False))
                db.commit()
                areas = db.query(MonitoredArea).order_by(MonitoredArea.is_priority.desc()).all()

            created = 0
            for ma in areas[:5]:  # concurrency limit — max 5 per cycle (Sec 36)
                q = check_quota("GEE")
                if q["allowed"] != "true":
                    break
                job = ForestJob(administrative_unit_id=ma.administrative_unit_id, status="QUEUED", params='{"auto": true}')
                db.add(job)
                ma.last_monitored_at = datetime.utcnow()
                created += 1
            db.commit()
            logger.info("Forest cycle enqueued %s jobs", created)
            return {"status": "QUEUED", "jobs": created}
        finally:
            db.close()

    def list_jobs(self) -> Dict[str, Dict[str, Any]]:
        if self._scheduler and _HAS_APS:
            for j in self._scheduler.get_jobs():
                self._jobs[j.id] = {
                    "id": j.id,
                    "next_run_time": str(j.next_run_time) if j.next_run_time else None,
                    "trigger": str(j.trigger),
                }
        return self._jobs

    def trigger_now(self, job_id: str) -> None:
        if not _HAS_APS or not self._scheduler:
            logger.warning("Cannot trigger %s — no scheduler backend", job_id)
            return
        job = self._scheduler.get_job(job_id)
        if job:
            job.modify(next_run_time=datetime.utcnow())


scheduler_service = SchedulerService()
