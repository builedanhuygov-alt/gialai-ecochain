"""Change detection — temporal comparison, area-of-change, risk score, confidence."""
from __future__ import annotations

import random
from typing import Any, Dict, Tuple

from app.core.enums import RiskLevel, SatelliteSource
from app.services.earth_engine.config import get_dataset_config


# ── Risk scoring ─────────────────────────────────────────────────────
def risk_from_change(change: float, change_pct: float) -> Tuple[int, RiskLevel]:
    """
    Heuristic risk 0-100 from NDVI decline.
    Negative change (vegetation decline) increases risk.
    Positive change (growth) => low risk.
    """
    # only declines matter; growth caps at LOW
    if change >= 0:
        return 5, RiskLevel.LOW
    abs_pct = abs(change_pct)
    # scale: 5% drop ~ 30, 15% ~ 70, 25%+ ~ 95
    score = int(min(100, abs_pct * 3.2 + abs(change) * 80))
    # clamp
    score = max(0, min(100, score))
    if score <= 20:
        level = RiskLevel.LOW
    elif score <= 40:
        level = RiskLevel.MODERATE
    elif score <= 60:
        level = RiskLevel.ELEVATED
    elif score <= 80:
        level = RiskLevel.HIGH
    else:
        level = RiskLevel.CRITICAL
    return score, level


def confidence_from_inputs(change: float, image_count_current: int, image_count_baseline: int,
                           cloud_pct: int, std_dev: float | None) -> int:
    """
    Confidence 0-100 distinct from risk (Sec 12).
    Factors: image count, cloud, std stability, magnitude.
    """
    base = 50
    if image_count_current >= 4 and image_count_baseline >= 4:
        base += 20
    elif image_count_current >= 2 and image_count_baseline >= 2:
        base += 10
    if cloud_pct <= 20:
        base += 15
    elif cloud_pct <= 40:
        base += 5
    # low std => stable signal => higher confidence
    if std_dev is not None and std_dev < 0.08:
        base += 10
    # larger |change| => more confident it's real (not noise)
    base += min(10, int(abs(change) * 30))
    return max(0, min(100, base))


def affected_area_heuristic(change: float, total_area_ha: float | None, image_count: int) -> float:
    """Mock affected area — Phase 2 would compute pixel-based changed area via EE."""
    base = abs(change) * 150
    rng = random.Random(int(abs(change) * 10000) + image_count)
    jitter = rng.uniform(0, 20)
    area = round(base + jitter, 2)
    if total_area_ha:
        area = min(area, total_area_ha * 0.5)
    return area


def detect_change_mock(administrative_unit_id: str, geometry: Dict[str, Any],
                       period_before: Tuple[str, str], period_after: Tuple[str, str],
                       dataset: SatelliteSource = SatelliteSource.SENTINEL2,
                       cloud_percentage: int = 20,
                       total_area_ha: float | None = None) -> Dict[str, Any]:
    """Combine NDVI mocks into change result with risk/confidence."""
    from app.services.earth_engine.service import EEQueryParams
    from app.services.earth_engine.ndvi import calculate_ndvi_mock
    from app.services.earth_engine.imagery import get_imagery_mock

    p_before = EEQueryParams(administrative_unit_id=administrative_unit_id, geometry=geometry,
                             start_date=period_before[0], end_date=period_before[1],
                             cloud_percentage=cloud_percentage, dataset=dataset)
    p_after = EEQueryParams(administrative_unit_id=administrative_unit_id, geometry=geometry,
                            start_date=period_after[0], end_date=period_after[1],
                            cloud_percentage=cloud_percentage, dataset=dataset)
    before = calculate_ndvi_mock(p_before)
    after = calculate_ndvi_mock(p_after)
    before_count = get_imagery_mock(p_before)["image_count"]
    after_count = get_imagery_mock(p_after)["image_count"]

    cfg = get_dataset_config(dataset)
    change = round(after.mean - before.mean, 4)
    pct = round((change / before.mean * 100) if before.mean else 0, 2)
    risk_score, classification = risk_from_change(change, pct)
    confidence = confidence_from_inputs(change, after_count, before_count, cloud_percentage, after.std_dev)
    affected = affected_area_heuristic(change, total_area_ha, after_count)

    disclaimer = "Potential vegetation change — requires verification. Not proof of deforestation."

    return {
        "administrative_unit_id": administrative_unit_id,
        "period_start": period_after[0],
        "period_end": period_after[1],
        "baseline_start": period_before[0],
        "baseline_end": period_before[1],
        "ndvi_before": before.mean,
        "ndvi_after": after.mean,
        "ndvi_baseline": before.mean,
        "ndvi_current": after.mean,
        "ndvi_change": change,
        "change_percentage": pct,
        "ndvi_before_stats": before.__dict__,
        "ndvi_after_stats": after.__dict__,
        "risk_score": risk_score,
        "classification": classification.value,
        "confidence": confidence,
        "affected_area_ha": affected,
        "total_area_ha": total_area_ha,
        "source": "Google Earth Engine",
        "source_dataset": cfg.collection_id,
        "dataset": dataset.value,
        "image_count_current": after_count,
        "image_count_baseline": before_count,
        "method": "MOCK_NDVI",
        "disclaimer": disclaimer,
    }


def detect_change_real(administrative_unit_id: str, geometry: Dict[str, Any],
                       period_before: Tuple[str, str], period_after: Tuple[str, str],
                       svc,  # live EarthEngineService (real GEE, not mock)
                       dataset: SatelliteSource = SatelliteSource.SENTINEL2,
                       cloud_percentage: int = 20,
                       total_area_ha: float | None = None) -> Dict[str, Any]:
    """Same heuristic scoring as the mock path, but NDVI comes from LIVE GEE.

    `svc` must be a connected real service; image counts come from its
    get_imagery() so confidence reflects real data availability (unknown
    counts => conservative confidence instead of a hardcoded number).
    """
    from app.services.earth_engine.service import EEQueryParams

    p_before = EEQueryParams(administrative_unit_id=administrative_unit_id, geometry=geometry,
                             start_date=period_before[0], end_date=period_before[1],
                             cloud_percentage=cloud_percentage, dataset=dataset)
    p_after = EEQueryParams(administrative_unit_id=administrative_unit_id, geometry=geometry,
                            start_date=period_after[0], end_date=period_after[1],
                            cloud_percentage=cloud_percentage, dataset=dataset)
    before = svc.calculate_ndvi(p_before)
    after = svc.calculate_ndvi(p_after)
    try:
        before_count = int(svc.get_imagery(p_before).image_count)
        after_count = int(svc.get_imagery(p_after).image_count)
    except Exception:
        before_count = after_count = 1  # unknown => conservative confidence

    cfg = get_dataset_config(dataset)
    change = round(after.mean - before.mean, 4)
    pct = round((change / before.mean * 100) if before.mean else 0, 2)
    risk_score, classification = risk_from_change(change, pct)
    confidence = confidence_from_inputs(change, after_count, before_count, cloud_percentage, after.std_dev)
    affected = affected_area_heuristic(change, total_area_ha, after_count)

    disclaimer = "Potential vegetation change — requires verification. Not proof of deforestation."

    return {
        "administrative_unit_id": administrative_unit_id,
        "period_start": period_after[0],
        "period_end": period_after[1],
        "baseline_start": period_before[0],
        "baseline_end": period_before[1],
        "ndvi_before": before.mean,
        "ndvi_after": after.mean,
        "ndvi_baseline": before.mean,
        "ndvi_current": after.mean,
        "ndvi_change": change,
        "change_percentage": pct,
        "ndvi_before_stats": before.__dict__,
        "ndvi_after_stats": after.__dict__,
        "risk_score": risk_score,
        "classification": classification.value,
        "confidence": confidence,
        "affected_area_ha": affected,
        "total_area_ha": total_area_ha,
        "source": "Google Earth Engine",
        "source_dataset": cfg.collection_id,
        "dataset": dataset.value,
        "image_count_current": after_count,
        "image_count_baseline": before_count,
        "method": "REAL_NDVI",
        "disclaimer": disclaimer,
    }


# Real GEE entry point (implemented — needs live GEE credentials, pragma no cover in CI)
def detect_change_gee(administrative_unit_id: str, geometry: Dict[str, Any],
                      period_before: Tuple[str, str], period_after: Tuple[str, str],
                      dataset: SatelliteSource = SatelliteSource.SENTINEL2,
                      cloud_percentage: int = 20,
                      total_area_ha: float | None = None) -> Dict[str, Any]:  # pragma: no cover
    from app.services.earth_engine.service import get_earth_engine_service, GEE_EarthEngineService
    svc = get_earth_engine_service(use_mock=False)
    if not isinstance(svc, GEE_EarthEngineService):
        raise RuntimeError("GEE not connected — configure GEE_* env (see backend/.env.example)")
    return detect_change_real(administrative_unit_id, geometry, period_before, period_after,
                              svc, dataset, cloud_percentage, total_area_ha)
