"""Query cache — Sec 34."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.ops import QueryCacheEntry


class QueryCacheService:
    ttl_hours: int = 6  # default cache window

    def make_key(self, geometry: Dict[str, Any], dataset: str, start: str, end: str, cloud: int, baseline_start: str | None = None, baseline_end: str | None = None) -> str:
        raw = json.dumps({"geometry": geometry, "dataset": dataset, "start": start, "end": end, "cloud": cloud, "baseline_start": baseline_start, "baseline_end": baseline_end}, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()

    def get(self, query_hash: str, db: Session) -> Optional[Dict[str, Any]]:
        entry: QueryCacheEntry | None = db.query(QueryCacheEntry).filter_by(query_hash=query_hash).first()
        if not entry:
            return None
        if entry.expires_at and entry.expires_at < datetime.utcnow():
            db.delete(entry)
            db.commit()
            return None
        try:
            return json.loads(entry.result or "{}")
        except Exception:
            return None

    def set(self, query_hash: str, result: Dict[str, Any], db: Session) -> None:
        entry = db.query(QueryCacheEntry).filter_by(query_hash=query_hash).first()
        payload = json.dumps(result)
        expires = datetime.utcnow() + timedelta(hours=self.ttl_hours)
        if entry:
            entry.result = payload
            entry.expires_at = expires
        else:
            db.add(QueryCacheEntry(query_hash=query_hash, params=query_hash[:32], result=payload, expires_at=expires))
        db.commit()


query_cache = QueryCacheService()
