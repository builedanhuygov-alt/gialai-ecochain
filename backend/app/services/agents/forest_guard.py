"""ForestGuardAgent — Section 17. Mock in Phase 1, GEE in Phase 2, same contract."""
from __future__ import annotations

import abc
import json
import logging
import time
import uuid
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.enums import ProposalStatus, SatelliteSource
from app.models.pipeline import AIAnalysisResult, DataProposal, ProcessedData, RawData
from app.models.query_log import EEQueryLog
from app.services.data_providers.base import ProviderQuery
from app.services.earth_engine.service import EEQueryParams, get_earth_engine_service
from app.services.pipeline.pipeline import log_failure

logger = logging.getLogger(__name__)


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
    ) -> Dict[str, Any]:
        ...

    @abc.abstractmethod
    def create_proposal(self, analysis: Dict[str, Any], db: Optional[Session] = None) -> Dict[str, Any]:
        ...


class MockForestGuardAgent(ForestGuardAgent):
    """Phase 1 mock — implements full governance flow without real GEE."""

    def monitor_area(
        self,
        administrative_unit_id: str,
        start_date: str,
        end_date: str,
        geometry: Dict[str, Any],
        dataset: SatelliteSource = SatelliteSource.SENTINEL2,
        cloud_percentage: int = 20,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Select area → query GEE → NDVI → compare historical → detect anomaly → proposal
        Failure modes handled per Section 19.
        """
        svc = get_earth_engine_service()
        qlog_id = None
        t0 = time.time()
        try:
            # Validate geometry
            if not geometry or "type" not in geometry:
                raise ValueError("invalid geometry")

            # Simulate failure injection for testing (cloud coverage too high etc.)
            if cloud_percentage > 95:
                raise RuntimeError("cloud coverage too high — no usable images")

            # Query imagery + NDVI
            params = EEQueryParams(
                administrative_unit_id=administrative_unit_id,
                geometry=geometry,
                start_date=start_date,
                end_date=end_date,
                cloud_percentage=cloud_percentage,
                dataset=dataset,
            )
            ndvi = self.analyze_ndvi(params)
            change = self.detect_change(
                administrative_unit_id,
                geometry,
                period_before=(f"{start_date[:4]}-01-01", f"{start_date[:4]}-06-01"),
                period_after=(start_date, end_date),
                dataset=dataset,
            )

            proposal_payload = {
                "administrative_unit_id": administrative_unit_id,
                "period_start": start_date,
                "period_end": end_date,
                "ndvi_before": change["ndvi_before"],
                "ndvi_after": change["ndvi_after"],
                "ndvi_change": change["ndvi_change"],
                "change_percentage": change["change_percentage"],
                "affected_area_ha": change["affected_area_ha"],
                "confidence": change["confidence"],
                "source": "EARTH_ENGINE",
                "source_dataset": change["source_dataset"],
                "ndvi_stats": ndvi,
            }

            # Persist via governance pipeline if db provided
            if db is not None:
                result = self.create_proposal(proposal_payload, db=db)
                # log success
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
                db.commit()
                return {**proposal_payload, **result, "query_log_id": qlog.id, "status": ProposalStatus.PENDING.value}

            return {**proposal_payload, "status": ProposalStatus.PROPOSED.value, "persisted": False}

        except Exception as exc:
            # Section 19 — log, mark failed, never corrupt verified data
            logger.exception("ForestGuard monitor_area failed")
            if db is not None:
                try:
                    log_failure(
                        db,
                        agent_id="ForestGuard",
                        dataset=dataset.value if hasattr(dataset, "value") else str(dataset),
                        error=str(exc),
                        query_params={
                            "administrative_unit_id": administrative_unit_id,
                            "geometry": geometry,
                            "start_date": start_date,
                            "end_date": end_date,
                        },
                    )
                except Exception:
                    pass
            return {
                "administrative_unit_id": administrative_unit_id,
                "status": "FAILED",
                "error": str(exc),
                "error_type": type(exc).__name__,
                "official_data": "UNCHANGED",
            }

    def analyze_ndvi(self, params: EEQueryParams) -> Dict[str, Any]:
        svc = get_earth_engine_service()
        stats = svc.calculate_ndvi(params)
        return {
            "mean": stats.mean,
            "median": stats.median,
            "min": stats.min,
            "max": stats.max,
            "std_dev": stats.std_dev,
            "pixel_count": stats.pixel_count,
            "formula": "NDVI = (NIR - RED) / (NIR + RED)",
            "bands": {"nir": "B8", "red": "B4"} if params.dataset == SatelliteSource.SENTINEL2 else {"nir": "SR_B5", "red": "SR_B4"},
            "dataset": params.dataset.value,
        }

    def detect_change(
        self,
        administrative_unit_id: str,
        geometry: Dict[str, Any],
        period_before: tuple[str, str],
        period_after: tuple[str, str],
        dataset: SatelliteSource = SatelliteSource.SENTINEL2,
    ) -> Dict[str, Any]:
        svc = get_earth_engine_service()
        result = svc.detect_forest_change(
            administrative_unit_id=administrative_unit_id,
            geometry=geometry,
            period_before=period_before,
            period_after=period_after,
            dataset=dataset,
        )
        return {
            "administrative_unit_id": result.administrative_unit_id,
            "period_start": result.period_start,
            "period_end": result.period_end,
            "ndvi_before": result.ndvi_before,
            "ndvi_after": result.ndvi_after,
            "ndvi_change": result.ndvi_change,
            "change_percentage": result.change_percentage,
            "affected_area_ha": result.affected_area_ha,
            "confidence": result.confidence,
            "source": result.source,
            "source_dataset": result.source_dataset,
            "processing_time_ms": result.processing_time_ms,
            "status": result.status,
        }

    def create_proposal(self, analysis: Dict[str, Any], db: Optional[Session] = None) -> Dict[str, Any]:
        if db is None:
            return {"proposal_id": str(uuid.uuid4()), "status": ProposalStatus.PENDING.value, "persisted": False, **analysis}

        # Create full lineage: RAW → PROCESSED → AI_RESULT → PROPOSAL
        raw = RawData(
            administrative_unit_id=analysis["administrative_unit_id"],
            source="EARTH_ENGINE",
            source_dataset=analysis.get("source_dataset"),
            payload=json.dumps(analysis),
        )
        db.add(raw)
        db.flush()

        proc = ProcessedData(
            raw_data_id=raw.id,
            administrative_unit_id=analysis["administrative_unit_id"],
            processing_type="FOREST_CHANGE",
            result=json.dumps(analysis),
        )
        db.add(proc)
        db.flush()

        ai = AIAnalysisResult(
            agent_name="ForestGuard",
            administrative_unit_id=analysis["administrative_unit_id"],
            processed_data_id=proc.id,
            ndvi_mean=analysis.get("ndvi_after"),
            ndvi_change=analysis.get("ndvi_change"),
            change_percentage=analysis.get("change_percentage"),
            affected_area_ha=analysis.get("affected_area_ha"),
            confidence=analysis.get("confidence", 0.0),
            period_start=analysis.get("period_start"),
            period_end=analysis.get("period_end"),
            source_dataset=analysis.get("source_dataset"),
            payload=json.dumps(analysis),
        )
        db.add(ai)
        db.flush()

        proposal = DataProposal(
            ai_result_id=ai.id,
            administrative_unit_id=analysis["administrative_unit_id"],
            status=ProposalStatus.PENDING.value,
            title=f"Forest change {analysis.get('change_percentage')}% in {analysis['administrative_unit_id']}",
            description=json.dumps({k: v for k, v in analysis.items() if k != "ndvi_stats"}),
            payload=json.dumps(analysis),
            proposed_by="ForestGuard",
        )
        db.add(proposal)
        db.commit()
        for o in (raw, proc, ai, proposal):
            db.refresh(o)
        return {
            "proposal_id": proposal.id,
            "ai_result_id": ai.id,
            "raw_id": raw.id,
            "processed_id": proc.id,
            "status": ProposalStatus.PENDING.value,
        }


class GEEForestGuardAgent(MockForestGuardAgent):
    """Phase 2 subclass — swaps MockEE for real GEE without changing contract."""
    pass


def get_forest_guard_agent(use_mock: bool | None = None) -> ForestGuardAgent:
    from app.core.config import get_settings
    s = get_settings()
    if s.is_demo:
        return MockForestGuardAgent()
    return MockForestGuardAgent()  # Phase 1 default; Phase 2 factory returns GEE variant when configured
