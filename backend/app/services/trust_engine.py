"""TrustEngine — Sec 18 configurable scoring."""
from __future__ import annotations

from typing import Any, Dict, List

# Default weights — configurable via settings
DEFAULT_WEIGHTS = {
    "ai_confidence": 25,       # AI confidence contribution
    "photo_evidence": 25,      # at least 1 photo
    "independent_users": 15,   # per user up to 2 => 30
    "max_independent": 30,
    "location_consistency": 10,
    "time_consistency": 10,
}

THRESHOLD_COMMUNITY_VERIFIED = 70  # MVP: configurable


def score_proposal(
    proposal: Dict[str, Any],
    confirmations: List[Dict[str, Any]],
    photo_count: int,
    location_ok: bool,
    time_ok: bool,
    has_fraud_flag: bool,
    weights: Dict[str, int] | None = None,
) -> Dict[str, Any]:
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    breakdown: Dict[str, int] = {}
    total = 0

    # AI confidence 0-100 scaled to w
    ai_conf = proposal.get("confidence") or proposal.get("ai_confidence") or 0
    ai_score = int(ai_conf / 100 * w["ai_confidence"]) if ai_conf else 0
    breakdown["ai_confidence"] = ai_score
    total += ai_score

    photo_score = w["photo_evidence"] if photo_count >= 1 else 0
    breakdown["photo_evidence"] = photo_score
    total += photo_score

    # 2 independent users => 30, 1 =>15
    n = len([c for c in confirmations if c.get("confirmed")])
    ind_score = min(w["max_independent"], n * w["independent_users"])
    breakdown["independent_users"] = ind_score
    total += ind_score

    loc_score = w["location_consistency"] if location_ok else 0
    breakdown["location_consistency"] = loc_score
    total += loc_score

    time_score = w["time_consistency"] if time_ok else 0
    breakdown["time_consistency"] = time_score
    total += time_score

    if has_fraud_flag:
        total = max(0, total - 30)
        breakdown["fraud_penalty"] = -30

    return {
        "verification_score": min(100, total),
        "breakdown": breakdown,
        "threshold": THRESHOLD_COMMUNITY_VERIFIED,
        "passes": total >= THRESHOLD_COMMUNITY_VERIFIED and not has_fraud_flag,
        "detail": f"AI {ai_score} + photo {photo_score} + users {ind_score} + location {loc_score} + time {time_score} = {total}",
    }
