"""Automated data pipeline — Section 3 orchestration (abstraction only in Phase 1)."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.enums import DataSourceType, JobStatus, ProposalStatus
from app.models.pipeline import AIAnalysisResult, DataProposal, ProcessedData, RawData
from app.models.query_log import DataLineage, EEQueryLog
from app.services.data_providers.base import ProviderQuery, ProviderResult
from app.services.data_providers import get_provider

logger = logging.getLogger(__name__)


class PipelineError(Exception):
    pass


def log_failure(db: Session, *, agent_id: str, dataset: str, error: str, query_params: dict | None = None) -> EEQueryLog:
    """Section 19 — log, mark failed, never write bad data to verified."""
    log = EEQueryLog(
        agent_id=agent_id,
        dataset=dataset,
        geometry_reference=(query_params or {}).get("administrative_unit_id"),
        geometry_geojson=json.dumps((query_params or {}).get("geometry")) if (query_params or {}).get("geometry") else None,
        start_date=(query_params or {}).get("start_date"),
        end_date=(query_params or {}).get("end_date"),
        status=JobStatus.FAILED.value,
        error_message=error,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    logger.error("Pipeline failure [%s]: %s", agent_id, error)
    return log


def run_pipeline(
    db: Session,
    *,
    provider_name: str,
    query: ProviderQuery,
    agent_name: str = "ForestGuard",
    persist: bool = True,
) -> Dict[str, Any]:
    """
    SCHEDULE/TRIGGER → AGENT → PROVIDER → RAW → PROCESSED → AI → PROPOSAL → PENDING
    Phase 1: synchronous mock. Phase 2: enqueue via Celery / background worker.
    """
    try:
        provider = get_provider(provider_name)
    except Exception as exc:
        raise PipelineError(f"Provider not found: {provider_name}") from exc

    # ── 1. Fetch RAW ───────────────────────────────────────────────
    try:
        result: ProviderResult = provider.fetch(query)
    except Exception as exc:
        log_failure(db, agent_id=agent_name, dataset=provider_name, error=str(exc), query_params=query.__dict__)
        raise PipelineError(f"Provider fetch failed: {exc}") from exc

    if not persist:
        return {"raw": result.data, "meta": result.metadata, "persisted": False}

    raw = RawData(
        administrative_unit_id=query.administrative_unit_id,
        source=result.source.value,
        source_dataset=result.dataset,
        payload=json.dumps(result.data),
    )
    db.add(raw)
    db.flush()  # get id

    # ── 2. Processed ──────────────────────────────────────────────
    processed = ProcessedData(
        raw_data_id=raw.id,
        administrative_unit_id=query.administrative_unit_id,
        processing_type="NDVI" if result.source == DataSourceType.EARTH_ENGINE else "GENERIC",
        result=json.dumps(result.data),
        processing_time_ms=result.metadata.get("processing_time_ms") if isinstance(result.metadata.get("processing_time_ms"), int) else None,
    )
    db.add(processed)
    db.flush()

    # ── 3. AI Result ──────────────────────────────────────────────
    # For GEE data, map NDVI fields; generic: confidence 0.5
    ndvi = result.data.get("ndvi") if isinstance(result.data.get("ndvi"), dict) else None
    ai = AIAnalysisResult(
        agent_name=agent_name,
        administrative_unit_id=query.administrative_unit_id,
        processed_data_id=processed.id,
        ndvi_mean=ndvi.get("mean") if ndvi else None,
        ndvi_median=ndvi.get("median") if ndvi else None,
        ndvi_min=ndvi.get("min") if ndvi else None,
        ndvi_max=ndvi.get("max") if ndvi else None,
        confidence=0.85 if ndvi else 0.5,
        period_start=query.start_date,
        period_end=query.end_date,
        source_dataset=result.dataset,
        payload=json.dumps(result.data),
    )
    db.add(ai)
    db.flush()

    # ── 4. Data Proposal (PENDING) ───────────────────────────────
    proposal = DataProposal(
        ai_result_id=ai.id,
        administrative_unit_id=query.administrative_unit_id,
        status=ProposalStatus.PENDING.value,
        title=f"{agent_name} proposal for {query.administrative_unit_id} ({query.start_date}→{query.end_date})",
        description=f"Auto-generated from {result.source.value} / {result.dataset}",
        payload=json.dumps(result.data),
        proposed_by=agent_name,
    )
    db.add(proposal)
    db.flush()

    # ── 5. Query log + lineage ────────────────────────────────────
    qlog = EEQueryLog(
        agent_id=agent_name,
        dataset=result.dataset or provider_name,
        geometry_reference=query.administrative_unit_id,
        geometry_geojson=json.dumps(query.geometry) if query.geometry else None,
        start_date=query.start_date,
        end_date=query.end_date,
        cloud_filter=query.extra.get("cloud_percentage"),
        status=JobStatus.SUCCESS.value,
    )
    db.add(qlog)
    db.flush()

    lineage = DataLineage(
        proposal_id=proposal.id,
        ai_result_id=ai.id,
        processed_data_id=processed.id,
        raw_data_id=raw.id,
        query_log_id=qlog.id,
        dataset=result.dataset,
        description=f"{agent_name} → {result.source.value} → {result.dataset}",
    )
    db.add(lineage)
    db.commit()
    for obj in (raw, processed, ai, proposal, qlog, lineage):
        db.refresh(obj)

    logger.info("Pipeline success: proposal %s via %s", proposal.id, provider_name)
    return {
        "raw_id": raw.id,
        "processed_id": processed.id,
        "ai_result_id": ai.id,
        "proposal_id": proposal.id,
        "query_log_id": qlog.id,
        "lineage_id": lineage.id,
        "status": ProposalStatus.PENDING.value,
    }


def approve_proposal(db: Session, proposal_id: str, verified_by: str) -> Dict[str, Any]:
    """Admin approves → VerifiedData created (Section 18 governance)."""
    from app.models.pipeline import VerifiedData

    proposal: DataProposal | None = db.get(DataProposal, proposal_id)
    if not proposal:
        raise PipelineError("Proposal not found")
    if proposal.status == ProposalStatus.VERIFIED.value:
        raise PipelineError("Already verified")
    if proposal.status == ProposalStatus.REJECTED.value:
        raise PipelineError("Cannot approve rejected proposal")

    proposal.status = ProposalStatus.VERIFIED.value
    proposal.reviewed_by = verified_by
    proposal.reviewed_at = datetime.utcnow()

    verified = VerifiedData(
        administrative_unit_id=proposal.administrative_unit_id,
        proposal_id=proposal.id,
        ai_result_id=proposal.ai_result_id,
        payload=proposal.payload,
        verified_by=verified_by,
    )
    db.add(verified)
    # update lineage
    lineage = db.query(DataLineage).filter(DataLineage.proposal_id == proposal.id).first()
    if lineage:
        lineage.verified_data_id = verified.id
    db.commit()
    db.refresh(verified)
    return {"verified_id": verified.id, "proposal_id": proposal.id, "status": "VERIFIED"}


def reject_proposal(db: Session, proposal_id: str, reviewed_by: str, reason: str) -> Dict[str, Any]:
    proposal: DataProposal | None = db.get(DataProposal, proposal_id)
    if not proposal:
        raise PipelineError("Proposal not found")
    proposal.status = ProposalStatus.REJECTED.value
    proposal.reviewed_by = reviewed_by
    proposal.reviewed_at = datetime.utcnow()
    proposal.rejection_reason = reason
    db.commit()
    return {"proposal_id": proposal.id, "status": "REJECTED"}
