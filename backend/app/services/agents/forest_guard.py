"""ForestGuardAgent — Phase 2: temporal, risk, confidence, NO_VALID_IMAGE, explanation."""
from __future__ import annotations

import abc
import hashlib
import json
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.enums import ProposalStatus, RiskLevel, SatelliteSource
from app.models.pipeline import AIAnalysisResult, DataProposal, ProcessedData, RawData
from app.models.query_log import EEQueryLog
from app.services.earth_engine.service import EEQueryParams, get_earth_engine_service
from app.services.pipeline.pipeline import log_failure

logger = logging.getLogger(__name__)

DISCLAIMER = "Potential vegetation change — requires verification. Not proof of deforestation."


class ForestGuardAgent(abc.ABC):
    @abc.abstractmethod
    def monitor_area(
        self,
        administrative_unit_id: str,
        start_date: str,
        end_date: str,
        geometry: Dict[str, Any],
        dataset: SatelliteSource = SatelliteSource.SENTINEL2,
        cloud_percentage: int = 20,
        db: Optional[Session] = None,
        baseline_start: Optional[str] = None,
        baseline_end: Optional[str] = None,
    ) -> Dict[str, Any]:
        ...

    @abc.abstractmethod
    def analyze_ndvi(self, params: EEQueryParams) -> Dict[str, Any]:
        ...

    @abc.abstractmethod
    def detect_change(
        self,
        administrative_unit_id: str,
        geometry: Dict[str, Any],
        period_before: tuple[str, str],
        period_after: tuple[str, str],
        dataset: SatelliteSource = SatelliteSource.SENTINEL2,
        cloud_percentage: int = 20,
    ) -> Dict[str, Any]:
        ...

    @abc.abstractmethod
    def create_proposal(self, analysis: Dict[str, Any], db: Optional[Session] = None) -> Dict[str, Any]:
        ...


class MockForestGuardAgent(ForestGuardAgent):
    """Phase 2 enhanced — risk 0-100, confidence 0-100 distinct, NO_VALID_IMAGE, explanation."""

    def monitor_area(
        self,
        administrative_unit_id: str,
        start_date: str,
        end_date: str,
        geometry: Dict[str, Any],
        dataset: SatelliteSource = SatelliteSource.SENTINEL2,
        cloud_percentage: int = 20,
        db: Optional[Session] = None,
        baseline_start: Optional[str] = None,
        baseline_end: Optional[str] = None,
    ) -> Dict[str, Any]:
        svc = get_earth_engine_service()
        t0 = time.time()
        try:
            if not geometry or "type" not in geometry:
                raise ValueError("invalid geometry")
            if cloud_percentage > 95:
                raise RuntimeError("cloud coverage too high — no usable images")

            # Default baseline = month before current (Sec 9)
            if not baseline_start or not baseline_end:
                try:
                    from datetime import date
                    sd = date.fromisoformat(start_date)
                    # baseline = 30 days before
                    bd_start = sd - timedelta(days=60)
                    bd_end = sd - timedelta(days=30)
                    baseline_start = baseline_start or bd_start.isoformat()
                    baseline_end = baseline_end or bd_end.isoformat()
                except Exception:
                    baseline_start = baseline_start or "2026-07-01"
                    baseline_end = baseline_end or "2026-08-01"

            # Cloud filter check — NO_VALID_IMAGE (Sec 7)
            params_current = EEQueryParams(
                administrative_unit_id=administrative_unit_id,
                geometry=geometry,
                start_date=start_date,
                end_date=end_date,
                cloud_percentage=cloud_percentage,
                dataset=dataset,
            )
            cloud_check = svc.get_cloud_filtered_imagery(params_current)
            if cloud_check.get("status") == "NO_VALID_IMAGE":
                if db is not None:
                    log_failure(db, agent_id="ForestGuard", dataset=dataset.value, error="NO_VALID_IMAGE", query_params={"administrative_unit_id": administrative_unit_id, "geometry": geometry, "start_date": start_date, "end_date": end_date})
                return {
                    "administrative_unit_id": administrative_unit_id,
                    "status": "NO_DATA",
                    "error": "NO_VALID_IMAGE",
                    "reason": "No images satisfy cloud filter — try higher cloud_percentage or different date range",
                    "official_data": "UNCHANGED",
                }

            # Query cache check (Sec 34) — before heavy work
            try:
                from app.services.cache import query_cache
                cache_key = query_cache.make_key(geometry, dataset.value, start_date, end_date, cloud_percentage, baseline_start, baseline_end)
                cached = query_cache.get(cache_key, db) if db is not None else None
                if cached:
                    logger.info("ForestGuard cache hit %s", cache_key[:8])
                    # return cached proposal payload
                    return {**cached, "cached": True, "query_hash": cache_key[:16]}
            except Exception:
                cache_key = None

            ndvi = self.analyze_ndvi(params_current)
            # thumbnail for admin review (Sec 31)
            try:
                thumb = svc.get_thumbnail(params_current)
            except Exception:
                thumb = {"thumbnail_url": None}

            change = self.detect_change(
                administrative_unit_id, geometry,
                period_before=(baseline_start, baseline_end),
                period_after=(start_date, end_date),
                dataset=dataset,
                cloud_percentage=cloud_percentage,
            )

            # Phase 2 output with risk/confidence separate (Sec 11-12,14)
            proposal_payload = {
                "agent": "ForestGuard",
                "administrative_unit_id": administrative_unit_id,
                "administrative_unit": administrative_unit_id,
                "risk_score": change["risk_score"],
                "confidence": change["confidence"],
                "classification": change["classification"],
                "ndvi_current": change["ndvi_current"],
                "ndvi_baseline": change["ndvi_baseline"],
                "ndvi_before": change["ndvi_before"],
                "ndvi_after": change["ndvi_after"],
                "ndvi_change": change["ndvi_change"],
                "change_percentage": change["change_percentage"],
                "affected_area_ha": change["affected_area_ha"],
                "total_area_ha": change.get("total_area_ha"),
                "period_start": start_date,
                "period_end": end_date,
                "baseline_start": baseline_start,
                "baseline_end": baseline_end,
                "source": "Google Earth Engine",
                "source_reference": change["source_dataset"],
                "source_dataset": change["source_dataset"],
                "dataset": dataset.value,
                "status": ProposalStatus.PENDING.value,
                "ndvi_stats": ndvi,
                "thumbnail": thumb,
                "explanation": f"NDVI {change['ndvi_baseline']:.3f} → {change['ndvi_current']:.3f} ({change['change_percentage']:+.1f}%). "
                               f"Potential vegetation change risk {change['risk_score']}/100 ({change['classification']}), confidence {change['confidence']}%. "
                               f"{DISCLAIMER}",
                "disclaimer": DISCLAIMER,
                "data_type": "FOREST_CHANGE",
            }

            # Persist
            if db is not None:
                result = self.create_proposal(proposal_payload, db=db)
                ms = int((time.time() - t0) * 1000)
                qlog = EEQueryLog(
                    agent_id="ForestGuard",
                    dataset=change["source_dataset"],
                    geometry_reference=administrative_unit_id,
                    geometry_geojson=json.dumps(geometry),
                    start_date=start_date,
                    end_date=end_date,
                    cloud_filter=cloud_percentage,
                    processing_time_ms=ms,
                    status="SUCCESS",
                )
                db.add(qlog)
                # cache it
                try:
                    if cache_key:
                        from app.services.cache import query_cache
                        query_cache.set(cache_key, {**proposal_payload, **result}, db)
                except Exception:
                    pass
                # notification for HIGH/CRITICAL (Sec 30)
                try:
                    if change["classification"] in ("HIGH", "CRITICAL"):
                        from app.services.notification import notify_forest_alert
                        notify_forest_alert(db, proposal_payload, result.get("proposal_id"))
                except Exception as exc:
                    logger.warning("notify failed: %s", exc)
                # audit log
                try:
                    from app.services.audit import audit_log
                    audit_log(db, action="FORESTGUARD_ANALYSIS", resource_type="proposal", resource_id=result.get("proposal_id"),
                              detail=f"ForestGuard {administrative_unit_id} risk {change['risk_score']} {change['classification']}")
                except Exception:
                    pass

                db.commit()
                db.refresh(qlog)
                return {**proposal_payload, **result, "query_log_id": qlog.id, "status": ProposalStatus.PENDING.value}

            return {**proposal_payload, "persisted": False}

        except Exception as exc:
            logger.exception("ForestGuard monitor_area failed")
            if db is not None:
                try:
                    log_failure(db, agent_id="ForestGuard", dataset=dataset.value if hasattr(dataset, "value") else str(dataset),
                                error=str(exc), query_params={"administrative_unit_id": administrative_unit_id, "geometry": geometry, "start_date": start_date, "end_date": end_date})
                except Exception:
                    pass
            return {"administrative_unit_id": administrative_unit_id, "status": "FAILED", "error": str(exc), "error_type": type(exc).__name__, "official_data": "UNCHANGED"}

    def analyze_ndvi(self, params: EEQueryParams) -> Dict[str, Any]:
        svc = get_earth_engine_service()
        stats = svc.calculate_ndvi(params)
        from app.services.earth_engine.ndvi import get_bands, NDVI_FORMULA
        return {
            "mean": stats.mean, "median": stats.median, "min": stats.min, "max": stats.max,
            "std_dev": stats.std_dev, "pixel_count": stats.pixel_count,
            "formula": NDVI_FORMULA, "bands": get_bands(params.dataset), "dataset": params.dataset.value,
        }

    def detect_change(self, administrative_unit_id: str, geometry: Dict[str, Any],
                      period_before: tuple[str, str], period_after: tuple[str, str],
                      dataset: SatelliteSource = SatelliteSource.SENTINEL2, cloud_percentage: int = 20) -> Dict[str, Any]:
        from app.services.earth_engine.change_detection import detect_change_mock
        total_area = None
        try:
            coords = geometry.get("coordinates", [[[0, 0]]])[0] if geometry.get("type") == "Polygon" else []
            if coords:
                xs = [c[0] for c in coords]; ys = [c[1] for c in coords]
                total_area = abs((max(xs) - min(xs)) * (max(ys) - min(ys)) * 1236400)
        except Exception:
            pass
        data = detect_change_mock(administrative_unit_id, geometry, period_before, period_after, dataset, cloud_percentage, total_area)
        # keep 0-100 confidence, risk separate
        return data

    def create_proposal(self, analysis: Dict[str, Any], db: Optional[Session] = None) -> Dict[str, Any]:
        if db is None:
            return {"proposal_id": str(uuid.uuid4()), "status": ProposalStatus.PENDING.value, "persisted": False, **analysis}
        # expiry 30 days (Sec 15)
        expires = datetime.utcnow() + timedelta(days=30)
        raw = RawData(
            administrative_unit_id=analysis["administrative_unit_id"],
            source="EARTH_ENGINE",
            source_dataset=analysis.get("source_dataset") or analysis.get("source_reference"),
            payload=json.dumps(analysis),
        )
        db.add(raw); db.flush()
        proc = ProcessedData(raw_data_id=raw.id, administrative_unit_id=analysis["administrative_unit_id"], processing_type="FOREST_CHANGE", result=json.dumps(analysis))
        db.add(proc); db.flush()
        # confidence stored 0-1 in AI result but proposal keeps 0-100 too
        conf_01 = analysis.get("confidence", 0) / 100.0 if analysis.get("confidence", 0) > 1 else analysis.get("confidence", 0)
        ai = AIAnalysisResult(
            agent_name="ForestGuard",
            administrative_unit_id=analysis["administrative_unit_id"],
            processed_data_id=proc.id,
            ndvi_mean=analysis.get("ndvi_current") or analysis.get("ndvi_after"),
            ndvi_change=analysis.get("ndvi_change"),
            change_percentage=analysis.get("change_percentage"),
            affected_area_ha=analysis.get("affected_area_ha"),
            confidence=conf_01,
            period_start=analysis.get("period_start"),
            period_end=analysis.get("period_end"),
            source_dataset=analysis.get("source_dataset"),
            payload=json.dumps(analysis),
        )
        db.add(ai); db.flush()
        # Sec 15 fields: agent_id, data_type, payload, confidence, source, source_reference, status, expires_at
        proposal = DataProposal(
            ai_result_id=ai.id,
            administrative_unit_id=analysis["administrative_unit_id"],
            status=ProposalStatus.PENDING.value,
            title=f"Potential vegetation change {analysis.get('change_percentage'):+.1f}% in {analysis['administrative_unit_id']} — risk {analysis.get('risk_score')} {analysis.get('classification')} (requires verification)",
            description=json.dumps({k: v for k, v in analysis.items() if k not in ("ndvi_stats", "thumbnail")}),
            payload=json.dumps(analysis),
            proposed_by="ForestGuard",
            source=analysis.get("source", "Google Earth Engine"),
            source_reference=analysis.get("source_reference") or analysis.get("source_dataset"),
            confidence=analysis.get("confidence", 0),
            data_type=analysis.get("data_type", "FOREST_CHANGE"),
            expires_at=expires,
        )
        db.add(proposal); db.commit()
        for o in (raw, proc, ai, proposal):
            db.refresh(o)
        return {"proposal_id": proposal.id, "ai_result_id": ai.id, "raw_id": raw.id, "processed_id": proc.id, "status": ProposalStatus.PENDING.value, "expires_at": expires.isoformat()}


class GEEForestGuardAgent(MockForestGuardAgent):
    pass


def get_forest_guard_agent(use_mock: bool | None = None) -> ForestGuardAgent:
    from app.core.config import get_settings
    s = get_settings()
    if s.is_demo:
        return MockForestGuardAgent()
    return MockForestGuardAgent()
