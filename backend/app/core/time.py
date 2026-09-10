"""Point-in-time helper: naive UTC now.

SQLite DATETIME columns (and several plain DateTime models) store/return
timezone-naive values, so ALL python-side "now" values in this codebase are
naive UTC — identical semantics to the old datetime.utcnow(), but without
the DeprecationWarning. Do NOT use datetime.now(timezone.utc) at call sites:
mixing aware values with naive DB reads raises TypeError on comparison.
"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
