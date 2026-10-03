"""Backtest the fire-risk formula against FIRMS history (Gia Lai).

Method (documented, no hidden choices):
- Grid ~cell_km over the Gia Lai bbox, one record per cell-day.
- Score from D-1 weather via services.fire_risk.compute_score (renormalized
  over observed factors; NDVI/satellite is NOT available historically, so it
  is honestly missing and data_completeness shows it).
- Label = any FIRMS detection inside the cell during D..D+3.
- Metrics: precision, recall, F1, false-alarm-rate, mean lead time,
  confusion matrix, ROC points over thresholds, sample counts, period.
- Origin is "LIVE" only when BOTH weather and fire labels are live data.
  Without a FIRMS key (or for dates outside the NRT window) labels are
  deterministic simulated fires and EVERYTHING is labeled "DEMO / SIMULATED".
  Simulated numbers are never presented as real results.
- Weather sampling: Open-Meteo archive is queried on a coarse sample grid
  (weather varies smoothly); each 5 km cell reuses its nearest sample.
  This is documented in the result ("weather_resolution_km").
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.services.fire_risk import FireRiskInput, compute_score

GIALAI_BBOX = (107.4514, 12.996, 109.3635, 14.7031)  # minlon, minlat, maxlon, maxlat
KM_PER_DEG = 111.0
ROC_THRESHOLDS = [10, 20, 30, 40, 50, 60, 70, 80, 90]
DEMO_FIRE_BASE_RATE = 0.02  # documented simulated fire probability /cell-day


# ── Pure core (no I/O — unit tested) ─────────────────────────────────

def build_grid(bbox: Tuple[float, float, float, float] = GIALAI_BBOX,
               cell_km: float = 5.0) -> List[Dict[str, Any]]:
    minlon, minlat, maxlon, maxlat = bbox
    step_lat = cell_km / KM_PER_DEG
    mid_lat = (minlat + maxlat) / 2
    step_lon = cell_km / (KM_PER_DEG * max(0.2, math.cos(math.radians(mid_lat))))
    cells = []
    lat = minlat
    iy = 0
    while lat < maxlat:
        lon = minlon
        ix = 0
        while lon < maxlon:
            cy = min(lat + step_lat / 2, maxlat)
            cx = min(lon + step_lon / 2, maxlon)
            cells.append({
                "id": f"c{ix:03d}_{iy:03d}",
                "cx": round(cx, 5), "cy": round(cy, 5),
                "bounds": [lon, lat, min(lon + step_lon, maxlon), min(lat + step_lat, maxlat)],
            })
            ix += 1
            lon += step_lon
        iy += 1
        lat += step_lat
    return cells


def evaluate(records: List[Dict[str, Any]], threshold: float) -> Dict[str, Any]:
    """Score/label records -> classification metrics. Deterministic.

    record: {cell_id, date (YYYY-MM-DD), score (int|None), fire_day (YYYY-MM-DD|None)}
    predicted positive iff score is not None and score >= threshold.
    """
    tp = fp = tn = fn = skipped = 0
    leads: List[int] = []
    for r in records:
        score, fire_day = r.get("score"), r.get("fire_day")
        if score is None:
            skipped += 1
            continue
        pred = score >= threshold
        actual = fire_day is not None
        if pred and actual:
            tp += 1
            try:
                d0 = datetime.strptime(r["date"], "%Y-%m-%d").date()
                d1 = datetime.strptime(fire_day, "%Y-%m-%d").date()
                leads.append(max(0, (d1 - d0).days))
            except Exception:
                pass
        elif pred:
            fp += 1
        elif actual:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (2 * precision * recall / (precision + recall)
          if precision is not None and recall is not None and (precision + recall) else None)
    far = fp / (fp + tn) if (fp + tn) else None
    return {
        "threshold": threshold,
        "n_samples": len(records),
        "n_scored": tp + fp + tn + fn,
        "n_skipped_no_score": skipped,
        "confusion": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "precision": precision, "recall": recall, "f1": f1,
        "false_alarm_rate": far,
        "mean_lead_time_days": (sum(leads) / len(leads)) if leads else None,
        "n_lead_samples": len(leads),
    }


def roc_points(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for t in ROC_THRESHOLDS:
        m = evaluate(records, t)
        c = m["confusion"]
        tpr = c["tp"] / (c["tp"] + c["fn"]) if (c["tp"] + c["fn"]) else None
        fpr = c["fp"] / (c["fp"] + c["tn"]) if (c["fp"] + c["tn"]) else None
        out.append({"threshold": t, "tpr": tpr, "fpr": fpr})
    return out


# ── I/O layer ─────────────────────────────────────────────────────────

def _demo_fire(cell_id: str, day: str) -> bool:
    """Deterministic simulated fire label (documented; DEMO only)."""
    h = hashlib.sha256(f"demofire:{cell_id}:{day}".encode()).hexdigest()
    return (int(h[:8], 16) % 10000) / 10000 < DEMO_FIRE_BASE_RATE


def _daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


async def _fetch_archive_daily(lat: float, lon: float, start: date, end: date) -> Dict[str, List]:
    """Open-Meteo archive (no key): tmax, humidity mean, precip sum, wind max."""
    import httpx
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get("https://archive-api.open-meteo.com/v1/archive", params={
            "latitude": round(lat, 4), "longitude": round(lon, 4),
            "start_date": start.isoformat(), "end_date": end.isoformat(),
            "daily": "temperature_2m_max,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max",
            "timezone": "auto",
        })
        r.raise_for_status()
        return r.json().get("daily", {}) or {}


async def _fetch_firms_window(start: date, end: date) -> Tuple[str, List[Dict[str, Any]]]:
    """FIRMS detections in [start, end]. Returns (mode, fires).

    mode "live": real FIRMS NRT (only covers the recent window).
    mode "demo": no key or range outside NRT -> caller must simulate labels.
    """
    from app.core.config import get_settings
    s = get_settings()
    if not s.effective_firms_key:
        return "demo", []
    today = date.today()
    if start < today - timedelta(days=10):
        return "demo", []  # NRT window cannot serve older dates honestly
    try:
        from app.services.firms_service import fetch_firms_gialai
        span = max(1, (end - today).days + 4)
        data = await fetch_firms_gialai(day_range=min(10, span + 10))
    except Exception:
        return "demo", []
    if not isinstance(data, dict) or data.get("status") not in ("LIVE", "CACHED", "STALE"):
        return "demo", []
    fires = [f for f in data.get("fires", []) if not f.get("suspect_artificial")]
    return "live", fires


def _fire_days_in_cell(fires: List[Dict[str, Any]], cell: Dict[str, Any],
                       start: date, end: date) -> Dict[str, Optional[str]]:
    """Map date -> first fire day within D..D+3 inside the cell (or None)."""
    minlon, minlat, maxlon, maxlat = cell["bounds"]
    by_day: Dict[str, List[Dict[str, Any]]] = {}
    for f in fires:
        try:
            la, lo = float(f["latitude"]), float(f["longitude"])
        except (TypeError, ValueError):
            continue
        if not (minlon <= lo <= maxlon and minlat <= la <= maxlat):
            continue
        day = str(f.get("acq_date") or "")[:10]
        if day:
            by_day.setdefault(day, []).append(f)
    out: Dict[str, Optional[str]] = {}
    for d in _daterange(start, end):
        hit = None
        for k in range(0, 4):
            cand = (d + timedelta(days=k)).isoformat()
            if cand in by_day:
                hit = cand
                break
        out[d.isoformat()] = hit
    return out


def cache_path(key: str) -> str:
    base = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(base, exist_ok=True)
    safe = "".join(c if (c.isalnum() or c in "-_") else "_" for c in key)
    return os.path.join(base, f"backtest_{safe}.json")


async def run_backtest(start: date, end: date, threshold: float,
                       cell_km: float = 5.0) -> Dict[str, Any]:
    cells = build_grid(GIALAI_BBOX, cell_km)
    # Weather sample grid (coarse; documented). Cap ~80 queries.
    want = max(1, int(len(cells) ** 0.5 // 3))
    step = max(1, len(cells) // 80)
    samples = cells[::step][:80]
    wx_start, wx_end = start - timedelta(days=1), end + timedelta(days=3)
    wx_live = True
    wx_by_sample: Dict[str, Dict[str, dict]] = {}
    for s in samples:
        try:
            daily = await _fetch_archive_daily(s["cy"], s["cx"], wx_start, wx_end)
            dates = daily.get("time", [])
            series = {}
            for i, dt in enumerate(dates):
                def _at(k):
                    vals = daily.get(k) or []
                    return vals[i] if i < len(vals) else None
                series[str(dt)[:10]] = {
                    "temperature": _at("temperature_2m_max"),
                    "humidity": _at("relative_humidity_2m_mean"),
                    "rainfall": _at("precipitation_sum"),
                    "wind_speed": _at("wind_speed_10m_max"),
                }
            wx_by_sample[s["id"]] = series
        except Exception:
            wx_live = False
            wx_by_sample[s["id"]] = {}

    def nearest_sample(cell):
        best, bd = samples[0]["id"], 1e18
        for smp in samples:
            d = (smp["cx"] - cell["cx"]) ** 2 + (smp["cy"] - cell["cy"]) ** 2
            if d < bd:
                bd, best = d, smp["id"]
        return best

    fire_mode, fires = await _fetch_firms_window(start, end + timedelta(days=3))
    origin = "LIVE" if (wx_live and fire_mode == "live") else "DEMO / SIMULATED"

    records: List[Dict[str, Any]] = []
    for cell in cells:
        smp = nearest_sample(cell)
        series = wx_by_sample.get(smp, {})
        if fire_mode == "live":
            labels = _fire_days_in_cell(fires, cell, start, end)
        else:
            labels = {d.isoformat(): (d.isoformat() if _demo_fire(cell["id"], d.isoformat()) else None)
                      for d in _daterange(start, end)}
        for d in _daterange(start, end):
            day = d.isoformat()
            prev = (d - timedelta(days=1)).isoformat()
            w = series.get(prev, {})
            has_wx = any(w.get(k) is not None for k in ("temperature", "humidity", "rainfall", "wind_speed"))
            if not has_wx:
                records.append({"cell_id": cell["id"], "date": day, "score": None,
                                "fire_day": labels.get(day)})
                continue
            inp = FireRiskInput(
                temperature=w.get("temperature"), humidity=w.get("humidity"),
                rainfall=w.get("rainfall"), wind_speed=w.get("wind_speed"),
                firms_observed=False)
            r = compute_score(inp, origin=origin)
            records.append({"cell_id": cell["id"], "date": day, "score": r.score,
                            "fire_day": labels.get(day)})

    metrics = evaluate(records, threshold)
    result = {
        **metrics,
        "roc": roc_points(records),
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "n_cells": len(cells), "cell_km": cell_km,
        "origin": origin,
        "sources": {
            "weather": "Open-Meteo archive (LIVE)" if wx_live else "Open-Meteo unreachable (MISSING)",
            "fires": ("NASA FIRMS NRT (LIVE)" if fire_mode == "live"
                      else f"SIMULATED labels (seeded, base rate {DEMO_FIRE_BASE_RATE}/cell-day)"),
        },
        "method": ("score from D-1 weather via compute_score (renormalized); "
                   "label = FIRMS fire in cell during D..D+3; "
                   f"weather sampled every ~{step} cells (resolution documented)"),
        "disclaimer": "Chi so tham khao, trong so chua hieu chuan",
    }
    if origin == "DEMO / SIMULATED":
        result["warning"] = ("DỮ LIỆU GIẢ LẬP — fire labels are simulated. "
                             "Do not present these metrics as real accuracy.")
    return result
