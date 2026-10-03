"""Single source of truth for wildfire risk scoring (GIALAI EcoChain).

Everything that displays a risk score/level (dashboard, map, alerts,
backtest, what-if, grid) must go through :func:`compute_score`.

Rules:
- Pure + deterministic: no randomness, no hidden defaults counted as data.
- Missing factors are EXCLUDED and remaining weights are renormalized
  (``renormalize=True``). Legacy callers that need the old neutral-default
  behaviour pass ``renormalize=False``.
- ``estimated_inputs`` lists every factor computed from a fallback default.
- ``data_completeness`` in [0,1] must be shown on UI next to the score.
- ``origin`` is caller-supplied provenance: "LIVE", "USER_INPUT" or
  "DEMO / SIMULATED". This module never invents provenance.
- Labels: Vietnamese fire-warning levels I..V, thresholds 20/40/60/80.
- Disclaimer: "Chi so tham khao, trong so chua hieu chuan"
  (reference index, weights not calibrated — see backtest module).
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.fire_risk_config import WEIGHTS

LEVELS = ("I", "II", "III", "IV", "V")
THRESHOLD_LEVELS = ((20, "I"), (40, "II"), (60, "III"), (80, "IV"), (100, "V"))
VALID_ORIGINS = ("LIVE", "USER_INPUT", "DEMO / SIMULATED")


def score_to_level(score: int) -> str:
    if score <= 20:
        return "I"
    if score <= 40:
        return "II"
    if score <= 60:
        return "III"
    if score <= 80:
        return "IV"
    return "V"


# Neutral computation stand-ins. Used ONLY for arithmetic when
# renormalize=False (legacy). NEVER counted as real data.
_DEFAULTS = {
    "ndvi": 0.6, "ndmi": 0.3, "nbr": 0.2,
    "temperature": 30.0, "humidity": 60.0, "rainfall": 5.0, "wind_speed": 10.0,
    "slope": 10.0, "elevation": 300.0,
}


@dataclass
class FireRiskInput:
    """All inputs optional. None = not observed (missing)."""

    ndvi: Optional[float] = None
    ndmi: Optional[float] = None
    nbr: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    rainfall: Optional[float] = None
    wind_speed: Optional[float] = None
    slope: Optional[float] = None
    elevation: Optional[float] = None
    hotspot_count: int = 0  # real FIRMS detections after artificial filtering
    firms_observed: bool = False  # True if the FIRMS source was actually queried
    community_count: int = 0  # verified community confirmations
    community_observed: bool = False
    historical_fire: bool = False
    historical_observed: bool = False


@dataclass
class FireRiskResult:
    score: Optional[int]  # None when nothing was observed
    level: Optional[str]  # I..V or None
    factors: Dict[str, str]  # human-readable drivers, e.g. {"Fuel Dryness": "+30%"}
    breakdown: Dict[str, float]  # per-factor 0..100 sub-scores (observed only)
    weights_used: Dict[str, float]  # renormalized weights actually applied
    missing: List[str]  # factor names without real data
    estimated_inputs: List[str]  # raw input names filled from defaults
    data_completeness: float  # 0..1 fraction of factors observed
    origin: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "score": self.score,
            "level": self.level,
            "factors": self.factors,
            "breakdown": self.breakdown,
            "weights_used": self.weights_used,
            "missing": self.missing,
            "estimated_inputs": self.estimated_inputs,
            "data_completeness": round(self.data_completeness, 3),
            "origin": self.origin,
            "disclaimer": "Chi so tham khao, trong so chua hieu chuan",
        }


def _factor_scores(inp: FireRiskInput) -> Dict[str, float]:
    """Per-factor 0..100 sub-scores. Mirrors the legacy engine formula."""
    ndvi = inp.ndvi if inp.ndvi is not None else _DEFAULTS["ndvi"]
    ndmi = inp.ndmi if inp.ndmi is not None else _DEFAULTS["ndmi"]
    nbr = inp.nbr if inp.nbr is not None else _DEFAULTS["nbr"]
    temp = inp.temperature if inp.temperature is not None else _DEFAULTS["temperature"]
    humidity = inp.humidity if inp.humidity is not None else _DEFAULTS["humidity"]
    rainfall = inp.rainfall if inp.rainfall is not None else _DEFAULTS["rainfall"]
    wind = inp.wind_speed if inp.wind_speed is not None else _DEFAULTS["wind_speed"]
    slope = inp.slope if inp.slope is not None else _DEFAULTS["slope"]

    fuel = max(0.0, min(100.0, (0.7 - ndvi) * 120 + (0.4 - ndmi) * 80))
    if nbr is not None and nbr < -0.1:
        fuel = min(100.0, fuel + 5)
    weather = max(0.0, min(100.0, (temp - 28) * 4 + (60 - humidity) * 0.8))
    firms = 70.0 if inp.hotspot_count > 0 else 10.0
    wind_s = min(100.0, wind * 3)
    rain = max(0.0, min(100.0, (10 - rainfall) * 6))
    terrain = min(100.0, slope * 2)
    hist = 50.0 + (20.0 if inp.historical_fire else 0.0) + (inp.community_count * 5)
    return {
        "fuel_dryness": fuel,
        "weather_danger": weather,
        "firms_proximity": firms,
        "wind": wind_s,
        "rainfall_deficit": rain,
        "terrain": terrain,
        "historical_community": hist,
    }


# Which raw inputs back each factor (for estimated_inputs tracking).
_FACTOR_INPUTS = {
    "fuel_dryness": ("ndvi", "ndmi", "nbr"),
    "weather_danger": ("temperature", "humidity"),
    "firms_proximity": (),
    "wind": ("wind_speed",),
    "rainfall_deficit": ("rainfall",),
    "terrain": ("slope",),
    "historical_community": (),
}


def _factor_observed(factor: str, inp: FireRiskInput) -> bool:
    if factor == "fuel_dryness":
        return inp.ndvi is not None  # NDVI presence marks satellite observed
    if factor == "weather_danger":
        return inp.temperature is not None
    if factor == "firms_proximity":
        return inp.firms_observed
    if factor == "wind":
        return inp.wind_speed is not None
    if factor == "rainfall_deficit":
        return inp.rainfall is not None
    if factor == "terrain":
        return inp.slope is not None
    if factor == "historical_community":
        return inp.historical_observed or inp.community_observed
    return False


def compute_score(inp: FireRiskInput, *, origin: str = "LIVE", renormalize: bool = True) -> FireRiskResult:
    """Compute the wildfire risk score. Deterministic, no randomness."""
    if origin not in VALID_ORIGINS:
        raise ValueError(f"origin must be one of {VALID_ORIGINS}")
    sub = _factor_scores(inp)
    observed = {f: _factor_observed(f, inp) for f in sub}
    missing = [f for f, ok in observed.items() if not ok]

    raw = {f: inp.__dict__.get(k) for f in _FACTOR_INPUTS for k in _FACTOR_INPUTS[f]}
    estimated = sorted({k for f in missing for k in _FACTOR_INPUTS[f] if raw.get(k) is None})
    if renormalize:
        usable = [f for f in sub if observed[f]]
        if not usable:
            return FireRiskResult(
                score=None, level=None, factors={}, breakdown={},
                weights_used={}, missing=missing, estimated_inputs=estimated,
                data_completeness=0.0, origin=origin,
            )
        wsum = sum(WEIGHTS[f] for f in usable)
        weights = {f: WEIGHTS[f] / wsum for f in usable}
        total = sum(sub[f] * weights[f] for f in usable)
        breakdown = {f: round(sub[f], 2) for f in usable}
    else:
        weights = dict(WEIGHTS)
        total = sum(sub[f] * WEIGHTS[f] for f in sub)
        breakdown = {f: round(v, 2) for f, v in sub.items()}

    score = int(max(0, min(100, total)))
    level = score_to_level(score)

    # Human-readable drivers (only from observed factors).
    factors: Dict[str, str] = {}
    labels = {
        "fuel_dryness": "Fuel Dryness", "weather_danger": "Weather danger",
        "firms_proximity": "FIRMS proximity", "wind": "Wind",
        "rainfall_deficit": "Rainfall deficit", "terrain": "Terrain",
        "historical_community": "History/community",
    }
    if observed["fuel_dryness"] and sub["fuel_dryness"] > 60:
        factors[labels["fuel_dryness"]] = "+30%"
    if observed["weather_danger"] and sub["weather_danger"] > 60:
        factors[labels["weather_danger"]] = "+20%"
    if observed["firms_proximity"] and sub["firms_proximity"] > 50:
        factors[labels["firms_proximity"]] = "+15%"
    if observed["wind"] and (inp.wind_speed or 0) > 18:
        factors[labels["wind"]] = "+10%"
    if observed["rainfall_deficit"] and (inp.rainfall if inp.rainfall is not None else 99) < 2:
        factors[labels["rainfall_deficit"]] = "+10%"
    if observed["terrain"] and (inp.slope or 0) > 20:
        factors[labels["terrain"]] = "+10%"
    if inp.nbr is not None and inp.nbr < -0.25:
        factors["NBR burn scar"] = "detected"

    completeness = sum(1 for ok in observed.values() if ok) / len(observed)
    return FireRiskResult(
        score=score, level=level, factors=factors, breakdown=breakdown,
        weights_used={k: round(v, 4) for k, v in weights.items()},
        missing=missing, estimated_inputs=estimated,
        data_completeness=completeness, origin=origin,
    )


def input_from_legacy(
    satellite: Optional[Dict[str, Any]] = None,
    weather: Optional[Dict[str, Any]] = None,
    terrain: Optional[Dict[str, Any]] = None,
    hotspots: Optional[List[Dict[str, Any]]] = None,
    community: int = 0,
    historical: Optional[Dict[str, Any]] = None,
    sources_available: Optional[Dict[str, bool]] = None,
) -> FireRiskInput:
    """Adapt the legacy analyze() argument shape to FireRiskInput."""
    satellite = satellite or {}
    weather = weather or {}
    terrain = terrain or {}
    raw = hotspots or []
    real = [h for h in raw if not h.get("suspect_artificial")]
    src = sources_available or {}
    firms_obs = src.get("firms", bool(real)) if sources_available else bool(real)
    return FireRiskInput(
        ndvi=satellite.get("ndvi"), ndmi=satellite.get("ndmi"), nbr=satellite.get("nbr"),
        temperature=weather.get("temperature"), humidity=weather.get("humidity"),
        rainfall=weather.get("rainfall"), wind_speed=weather.get("wind_speed"),
        slope=terrain.get("slope"), elevation=terrain.get("elevation"),
        hotspot_count=len(real), firms_observed=firms_obs,
        community_count=community or 0, community_observed=bool(community),
        historical_fire=bool(historical), historical_observed=historical is not None,
    )


# Checklist 4 bước cố định cho kiểm tra thực địa (quan sát/báo cáo, không
# chữa cháy — không đưa hướng dẫn chữa cháy nguy hiểm).
CHECKLIST_4 = [
    "Xác minh vị trí và dấu hiệu nhiệt/cháy thực tế",
    "Kiểm tra thảm thực vật và vật liệu khô",
    "Ghi nhận gió, nguồn nước, khả năng tiếp cận",
    "Chụp ảnh/GPS và cập nhật kết quả",
]

_FACTOR_VI = {
    "fuel_dryness": "Thực vật khô", "weather_danger": "Nhiệt độ",
    "firms_proximity": "Điểm nhiệt", "wind": "Gió",
    "rainfall_deficit": "Mưa", "terrain": "Địa hình",
    "historical_community": "Lịch sử/cộng đồng",
}


def _mo_ta_yeu_to(factor: str, inp: FireRiskInput, subscore: float) -> str:
    """Câu giải thích tự sinh từ GIÁ TRỊ THẬT (không văn bản cố định)."""
    if factor == "fuel_dryness":
        ndvi = inp.ndvi if inp.ndvi is not None else float("nan")
        muc = "rất khô" if (inp.ndvi or 9) < 0.3 else "khô" if (inp.ndvi or 9) < 0.5 else "trung bình"
        return f"NDVI {ndvi:.2f} — thảm {muc}, điểm thành phần {subscore:.0f}/100."
    if factor == "weather_danger":
        return (f"Nhiệt {inp.temperature}°C, ẩm {inp.humidity}% — "
                f"điểm thành phần {subscore:.0f}/100.")
    if factor == "firms_proximity":
        return (f"{inp.hotspot_count} điểm nhiệt vệ tinh — điểm thành phần {subscore:.0f}/100. "
                "Điểm nhiệt là tín hiệu cần xác minh, không phải xác nhận cháy rừng.")
    if factor == "wind":
        return f"Gió {inp.wind_speed} km/h — điểm thành phần {subscore:.0f}/100."
    if factor == "rainfall_deficit":
        return f"Mưa {inp.rainfall} mm — điểm thành phần {subscore:.0f}/100."
    if factor == "terrain":
        return f"Dốc {inp.slope}° — điểm thành phần {subscore:.0f}/100."
    if factor == "historical_community":
        return (f"Lịch sử/cộng đồng ({inp.community_count} xác nhận) — "
                f"điểm thành phần {subscore:.0f}/100. Lịch sử chỉ là bối cảnh.")
    return f"Điểm thành phần {subscore:.0f}/100."


def explain(inp: FireRiskInput, *, origin: str = "LIVE") -> Dict[str, Any]:
    """Giải thích nguyên nhân theo luật cố định từ compute_score.

    Trả: điểm/mức/confidence (độ đầy dữ liệu), top 3 theo contribution kèm
    câu sinh từ giá trị thật, thanh đóng góp mọi yếu tố (tổng = điểm),
    thông báo thiếu dữ liệu. Không đoán, không học máy.
    """
    r = compute_score(inp, origin=origin)
    if r.score is None:
        return {
            "score": None, "level": None,
            "confidence": 0.0, "origin": origin,
            "top3": [], "bars": [],
            "thieu": ["Thiếu dữ liệu – chưa đủ cơ sở để tính thành phần này: "
                      + ", ".join(sorted(r.missing)) + "."],
            "disclaimer": "Chi so tham khao, trong so chua hieu chuan",
        }
    subs = _factor_scores(inp)
    bars = []
    for f in r.breakdown:
        w = r.weights_used.get(f, 0.0)
        bars.append({
            "factor": f, "label": _FACTOR_VI.get(f, f),
            "score": round(subs[f], 2), "trong_so": round(w, 4),
            "contribution": round(subs[f] * w, 2),
            "mo_ta": _mo_ta_yeu_to(f, inp, subs[f]),
        })
    bars.sort(key=lambda b: b["contribution"], reverse=True)
    thieu = ["Thiếu dữ liệu – chưa đủ cơ sở để tính thành phần này: "
             + _FACTOR_VI.get(f, f) + "." for f in r.missing]
    return {
        "score": r.score, "level": r.level,
        "confidence": round(r.data_completeness, 3), "origin": origin,
        "top3": bars[:3], "bars": bars, "thieu": thieu,
        "disclaimer": "Chi so tham khao, trong so chua hieu chuan",
    }


def recommend_field_checks(top_factors: List[str]) -> List[Dict[str, str]]:
    """Danh sách việc theo yếu tố nổi bật (không phải hướng dẫn chữa cháy)."""
    anh_xa = {
        "firms_proximity": ("Xác minh tại chỗ điểm nóng",
                            "Đến tọa độ điểm nhiệt, xác nhận khói/lửa bằng mắt thường."),
        "fuel_dryness": ("Khảo sát thảm mục",
                         "Ghi nhận thảm khô, tàn dư nương rẫy gần khu dân cư."),
        "weather_danger": ("Đo lại tại chỗ",
                           "Đo nhiệt/ẩm buổi trưa, đối chiếu với số liệu trạm."),
        "wind": ("Kiểm tra đường ranh cản lửa",
                 "Xem đường ranh theo hướng gió, điểm cao quan sát."),
        "rainfall_deficit": ("Ghi nhận khô hạn thực tế",
                             "Đếm ngày không mưa, kiểm tra nguồn nước gần nhất."),
        "terrain": ("Đánh giá tiếp cận",
                    "Xem đường vào, độ dốc, điểm tập kết lực lượng."),
        "historical_community": ("Hỏi người dân",
                                 "Tiền sử cháy khu vực, nguồn lửa sinh hoạt."),
    }
    out = []
    for f in top_factors:
        if f in anh_xa:
            viec, ly_do = anh_xa[f]
            out.append({"viec": viec, "ly_do": ly_do, "yeu_to": _FACTOR_VI.get(f, f)})
    return out


def compute_inspection_priority(risk: Optional[int],
                                hotspot_km: Optional[float],
                                hotspot_conf: Optional[str] = None,
                                temp_trend_up: bool = False,
                                access_ok: bool = False) -> Dict[str, Any]:
    """FIELD INSPECTION PRIORITY (0–100) — chỉ để sắp thứ tự xem xét.

    KHÔNG phải xác suất cháy, KHÔNG cộng vào Fire Risk Score.
    Thành phần: điểm nguy cơ (55%), gần điểm nóng (25/10), độ tin cậy
    điểm nóng (h=5/n=2), xu hướng nóng lên (+5), tiếp cận tốt (+5).
    """
    r = max(0, min(100, risk if risk is not None else 0))
    gan = 25 if (hotspot_km is not None and hotspot_km <= 3) else (
        10 if (hotspot_km is not None and hotspot_km <= 10) else 0)
    tin = {"h": 5, "n": 2, "l": 0}.get((hotspot_conf or "").lower(), 0)
    xu_huong = 5 if temp_trend_up else 0
    tiep_can = 5 if access_ok else 0
    diem = int(round(min(100, r * 0.55 + gan + tin + xu_huong + tiep_can)))
    cao = (risk is not None and risk >= 75) or (hotspot_km is not None and hotspot_km <= 3)
    dat = (risk is not None and risk >= 55) or (hotspot_km is not None and hotspot_km <= 3)
    return {
        "priority": diem,
        "muc": "CAO" if cao else "TRUNG BÌNH",
        "du_dieu_kien": dat,
        "han": "Đề xuất kiểm tra trong ngày" if cao else "Đề xuất kiểm tra trong 24 giờ",
        "thanh_phan": {"risk": round(r * 0.55, 1), "gan": gan, "tin": tin,
                       "xu_huong": xu_huong, "tiep_can": tiep_can},
    }
