"""Community verification flow — Sec 16-20."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.core.enums import ProposalStatus
from app.models.community import CommunityConfirmation, PhotoEvidence
from app.models.pipeline import DataProposal
from app.services.trust_engine import score_proposal, THRESHOLD_COMMUNITY_VERIFIED
from app.services.photo_service import check_geo_consistency, check_time_consistency


def add_confirmation(
    db: Session,
    proposal_id: str,
    user_id: str,
    confirmed: bool,
    comment: str | None = None,
    location: Dict[str, float] | None = None,
) -> Dict[str, Any]:
    proposal: DataProposal | None = db.get(DataProposal, proposal_id)
    if not proposal:
        raise ValueError("Proposal not found")
    # not allowed to confirm own report — check proposed_by
    if proposal.proposed_by == user_id:
        raise ValueError("Cannot confirm own proposal")
    # one confirmation per user
    existing = db.query(CommunityConfirmation).filter_by(proposal_id=proposal_id, user_id=user_id).first()
    if existing:
        raise ValueError("User already confirmed this proposal")

    conf = CommunityConfirmation(
        proposal_id=proposal_id,
        user_id=user_id,
        confirmed=confirmed,
        comment=comment,
        location_lat=(location or {}).get("lat"),
        location_lng=(location or {}).get("lng"),
    )
    db.add(conf)
    db.flush()

    # auto-check community verified
    result = maybe_auto_verify(db, proposal_id)
    db.commit()
    db.refresh(conf)
    return {"confirmation_id": conf.id, "proposal_status": result["status"], "score": result.get("score")}


def maybe_auto_verify(db: Session, proposal_id: str) -> Dict[str, Any]:
    """Sec 19 — PENDING → COMMUNITY_VERIFIED when conditions met."""
    proposal: DataProposal | None = db.get(DataProposal, proposal_id)
    if not proposal or proposal.status != ProposalStatus.PENDING.value:
        return {"status": proposal.status if proposal else "NOT_FOUND"}

    confirmations = db.query(CommunityConfirmation).filter_by(proposal_id=proposal_id, confirmed=True).all()
    conf_list = [{"confirmed": True, "user_id": c.user_id} for c in confirmations]

    photos = db.query(PhotoEvidence).filter_by(proposal_id=proposal_id).all()
    photo_count = len(photos)

    # location/time consistency — check last photo vs proposal geometry
    payload = json.loads(proposal.payload or "{}")
    geometry = payload.get("geometry") or payload.get("thumbnail") or {}
    # fallback: assume ok if no geometry
    location_ok = True
    time_ok = True
    has_fraud = False
    for p in photos:
        if p.is_duplicate:
            has_fraud = True
        geo_check = check_geo_consistency(p.location_lat, p.location_lng, payload.get("geometry") or {"type": "Polygon", "coordinates": [[[108,13],[109,13],[109,14],[108,14],[108,13]]]})
        if not geo_check["ok"] and geo_check.get("flag") == "LOCATION_MISMATCH":
            location_ok = False
        time_check = check_time_consistency(p.exif_time, p.upload_time or datetime.utcnow())
        if not time_check["ok"]:
            time_ok = False

    # MVP conditions (Sec 19): >=2 confirmations, >=1 photo, no fraud, location/time ok
    proposal_dict = {"confidence": proposal.confidence or 0}
    scoring = score_proposal(proposal_dict, conf_list, photo_count, location_ok, time_ok, has_fraud)

    # hard gates
    mvp_gates = (
        len(conf_list) >= 2
        and photo_count >= 1
        and not has_fraud
        and location_ok
        and time_ok
    )
    if mvp_gates or scoring["passes"]:
        proposal.status = ProposalStatus.COMMUNITY_VERIFIED.value
        proposal.updated_at = datetime.utcnow()
        db.flush()
        # audit
        try:
            from app.services.audit import audit_log
            audit_log(db, action="COMMUNITY_VERIFIED", resource_type="proposal", resource_id=proposal_id, detail=f"score {scoring['verification_score']}")
        except Exception:
            pass
        return {"status": ProposalStatus.COMMUNITY_VERIFIED.value, "score": scoring}
    return {"status": ProposalStatus.PENDING.value, "score": scoring}
