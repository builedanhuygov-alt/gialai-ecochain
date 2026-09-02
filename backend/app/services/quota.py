"""Quota / rate awareness — Sec 36."""
from __future__ import annotations

import time
from datetime import datetime
from typing import Dict

from sqlalchemy.orm import Session

from app.models.ops import QuotaLog

# simple in-memory token bucket
_bucket: Dict[str, list[float]] = {}
MAX_CONCURRENT = 5
MAX_PER_MINUTE = 20


def check_quota(endpoint: str = "GEE") -> Dict[str, str]:
    now = time.time()
    stamps = _bucket.setdefault(endpoint, [])
    # prune >60s
    _bucket[endpoint] = [t for t in stamps if now - t < 60]
    if len(_bucket[endpoint]) >= MAX_PER_MINUTE:
        return {"allowed": "false", "reason": "RATE_LIMITED", "retry_after": "60s"}
    if len([t for t in stamps if now - t < 5]) >= MAX_CONCURRENT:
        return {"allowed": "false", "reason": "CONCURRENCY_LIMITED"}
    _bucket[endpoint].append(now)
    return {"allowed": "true"}


def log_quota(db: Session, endpoint: str, status: str, detail: str | None = None):
    try:
        db.add(QuotaLog(endpoint=endpoint, status=status, detail=detail))
        db.flush()
    except Exception:
        pass

def reset_bucket():
    _bucket.clear()
