"""Wildfire forecast rating (CẤP I–V) per commune / district / province.

Honesty policy (non-negotiable):
- Only MEASURED inputs may raise or lower the level. Anything else is
  labeled MISSING (fetch failed), NOT_CONFIGURED (source never set up),
  or funnels into FIELD_VERIFICATION_REQUIRED (action suffix).
- No invented probabilities, no % confidence, no random jitter — the
  function is fully deterministic (same inputs => same output).
- Seeded/mock feeds (e.g. the mock DEM used by /fire/risk) must NEVER be
  passed in as `terrain` — callers pass terrain=None so it stays MISSING.

Component model (all ordinal, documented thresholds):
- Weather Stress: temp>=37 or humidity<=30 => HIGH;
  temp>=33 or humidity<=45 or wind>=25 => ELEVATED; else LOW.
- Rain deficit: dry_days>=7 (or measured 0 rain + dry>=5) supports III+;
  dry_days 3–6 supports II. Rain history unavailable => MISSING.
- Fuel: measured NDVI only. <0.35 HIGH (dry), <0.5 ELEVATED, else LOW.
- Terrain: measured slope only. >=25 HIGH, >=15 ELEVATED, else LOW.
- Ignition: real (non-artificial) FIRMS hotspots => ACTIVE;
  firms reachable + none => CLEAR; firms unreachable => MISSING.
- Water: NEARBY (<=10km) / DISTANT (10–25km) / MISSING. Feeds the
  operational note, never the level.
- Operational: posture word per level + FIELD_VERIFICATION_REQUIRED
  when coverage is limited.

Level rules (first match wins):
- V: hotspots present (active fire).
- IV: weather HIGH + one supporting (dry>=5, fuel>=ELEVATED, wind>=20).
- III: weather ELEVATED-HIGH (temp>=35/hum<=35) or fuel HIGH or
  dry>=7 or wind>=25.
- II: mild signals (temp>=32/hum<=50), fuel ELEVATED, dry>=3,
  or recent nearby fire.
- I: no adverse measured signal. With zero measured inputs the level
  stays I (safest default action) but driver=MISSING and coverage
  "Hạn chế" + FIELD_VERIFICATION_REQUIRED force field verification.
"""

LEVEL_LABELS = {
    "I": "Thấp",
    "II": "Trung bình",
    "III": "Cao",
    "IV": "Nguy hiểm",
    "V": "Cực kỳ nguy hiểm",
}

LEVEL_ACTIONS = {
    "I": ["Theo dõi định kỳ", "Chưa cần nâng cấp trực"],
    "II": ["Tăng cường quan sát"],
    "III": ["Nâng mức trực"],
    "IV": ["Sẵn sàng triển khai lực lượng"],
    "V": ["Trực chiến"],
}

OPERATIONAL_STATUS = {
    "I": "Bình thường",
    "II": "Quan sát",
    "III": "Trực tăng cường",
    "IV": "Sẵn sàng triển khai",
    "V": "Trực chiến",
}

MISSING = "MISSING"
NOT_CONFIGURED = "NOT_CONFIGURED"
FIELD_CHECK = "FIELD_VERIFICATION_REQUIRED"


def _num(v):
    return isinstance(v, (int, float)) and v == v  # not None, not NaN


def rate_forecast(
    weather=None,
    weather_available=False,
    hotspot_count=0,
    firms_available=False,
    terrain=None,
    ndvi=None,
    gee_configured=False,
    dry_days=None,
    rain_14d_mm=None,
    rain_available=False,
    water=None,
    recent_fire=False,
    history_available=False,
):
    """Pure deterministic forecast rating. See module docstring for rules."""
    weather = weather or {}
    temp = weather.get("temperature")
    humidity = weather.get("humidity")
    wind = weather.get("wind_speed")
    has_temp = _num(temp)
    has_hum = _num(humidity)
    has_wind = _num(wind)
    wx_measured = bool(weather_available and (has_temp or has_hum))

    # ---- Weather Stress ----
    if not wx_measured:
        weather_state, weather_note = MISSING, None
    elif (has_temp and temp >= 37) or (has_hum and humidity <= 30):
        weather_state = "HIGH"
        bits = []
        if has_temp and temp >= 37:
            bits.append(f"Nhiệt độ cao {temp}°C")
        if has_hum and humidity <= 30:
            bits.append(f"Độ ẩm thấp {humidity}%")
        weather_note = " · ".join(bits)
    elif (has_temp and temp >= 33) or (has_hum and humidity <= 45) or (has_wind and wind >= 25):
        weather_state = "ELEVATED"
        bits = []
        if has_temp and temp >= 33:
            bits.append(f"Nhiệt độ {temp}°C")
        if has_hum and humidity <= 45:
            bits.append(f"Độ ẩm {humidity}%")
        if has_wind and wind >= 25:
            bits.append(f"Gió {wind} km/h")
        weather_note = " · ".join(bits)
    else:
        weather_state = "LOW"
        weather_note = None

    # ---- Rain deficit (measured history only) ----
    dry = dry_days if isinstance(dry_days, int) and dry_days >= 0 else None
    rain_note = None
    if rain_available and dry is not None:
        if dry >= 7:
            rain_note = f"Thiếu mưa kéo dài ({dry} ngày không mưa)"
        elif dry >= 3:
            rain_note = f"{dry} ngày liền ít mưa"
        elif dry == 0:
            rain_note = "Mưa gần đây"
    elif rain_available and _num(rain_14d_mm):
        rain_note = f"Mưa 14 ngày {rain_14d_mm}mm"

    # ---- Fuel (measured NDVI only) ----
    if not _num(ndvi):
        fuel_state = MISSING
    elif ndvi < 0.35:
        fuel_state = "HIGH"
    elif ndvi < 0.5:
        fuel_state = "ELEVATED"
    else:
        fuel_state = "LOW"

    # ---- Terrain (measured slope only) ----
    slope = (terrain or {}).get("slope")
    if not _num(slope):
        terrain_state = MISSING
    elif slope >= 25:
        terrain_state = "HIGH"
    elif slope >= 15:
        terrain_state = "ELEVATED"
    else:
        terrain_state = "LOW"

    # ---- Ignition ----
    try:
        n_hot = int(hotspot_count or 0)
    except Exception:
        n_hot = 0
    if n_hot > 0 and firms_available:
        ignition_state, ignition_note = "ACTIVE", f"{n_hot} điểm nóng FIRMS"
    elif firms_available:
        ignition_state, ignition_note = "CLEAR", "Không phát hiện điểm nóng FIRMS"
    else:
        ignition_state, ignition_note = MISSING, None

    # ---- Water (operational note only) ----
    water_state, water_note = MISSING, None
    if isinstance(water, dict) and water.get("name"):
        d = water.get("distance_km")
        if _num(d) and d <= 10:
            water_state, water_note = "NEARBY", f"{water['name']} · {d} km"
        elif _num(d):
            water_state, water_note = "DISTANT", f"{water['name']} · {d} km (xa)"
        else:
            water_state, water_note = "NEARBY", str(water["name"])

    # ---- Level (first match wins) ----
    wx_high = weather_state == "HIGH"
    wx_mid = weather_state in ("HIGH", "ELEVATED")
    fuel_high = fuel_state == "HIGH"
    fuel_mid = fuel_state in ("HIGH", "ELEVATED")
    dry7 = dry is not None and dry >= 7
    dry5 = dry is not None and dry >= 5
    dry3 = dry is not None and dry >= 3
    windy = has_wind and wind >= 25
    windy20 = has_wind and wind >= 20
    mild = (has_temp and temp >= 32) or (has_hum and humidity <= 50)

    if n_hot > 0 and firms_available:
        level = "V"
    elif wx_high and (dry5 or fuel_mid or windy20):
        level = "IV"
    elif ((has_temp and temp >= 35) or (has_hum and humidity <= 35)
            or fuel_high or dry7 or windy):
        level = "III"
    elif wx_mid or mild or fuel_mid or dry3 or (recent_fire and history_available):
        level = "II"
    else:
        level = "I"

    # ---- Major driver (strongest MEASURED adverse signal first) ----
    driver = None
    if n_hot > 0 and firms_available:
        driver = ignition_note
    elif wx_high:
        driver = weather_note
    elif fuel_high:
        driver = "Thảm thực vật khô (NDVI thấp)"
    elif dry7:
        driver = rain_note
    elif windy:
        driver = f"Gió mạnh {wind} km/h"
    elif terrain_state == "HIGH":
        driver = f"Địa hình dốc ({slope}°)"
    elif wx_mid:
        driver = weather_note
    elif fuel_mid:
        driver = "Thảm thực vật bắt đầu khô"
    elif dry3:
        driver = rain_note
    elif recent_fire and history_available:
        driver = "Khu vực từng cháy gần đây"
    elif terrain_state == "ELEVATED":
        driver = f"Địa hình đồi ({slope}°)"
    if driver is None:
        calm = []
        if ignition_state == "CLEAR":
            calm.append(ignition_note)
        if weather_state == "LOW" and has_hum and humidity >= 60:
            calm.append("Độ ẩm tốt")
        if rain_note in ("Mưa gần đây",):
            calm.append(rain_note)
        driver = " · ".join(calm) if calm else MISSING

    # ---- Supporting factors (measured only, no %) ----
    supporting = []
    if weather_note and weather_note != driver:
        supporting.append(weather_note)
    if rain_note and rain_note != driver:
        supporting.append(rain_note)
    if fuel_state == "HIGH" and driver != "Thảm thực vật khô (NDVI thấp)":
        supporting.append(f"NDVI {ndvi}")
    if terrain_state in ("HIGH", "ELEVATED") and isinstance(slope, (int, float)):
        supporting.append(f"Độ dốc {slope}°")
    if windy and (not has_wind or f"Gió {wind}" not in str(driver)):
        supporting.append(f"Gió {wind} km/h")
    if recent_fire and history_available:
        supporting.append("Từng cháy gần đây")
    if water_note:
        supporting.append(f"Nguồn nước: {water_note}")

    # ---- Coverage ----
    measured = {
        "weather": wx_measured,
        "firms": bool(firms_available),
        "terrain": terrain_state != MISSING,
        "vegetation": fuel_state != MISSING,
        "water": water_state != MISSING,
        "history": bool(history_available),
    }
    n_ok = sum(1 for v in measured.values() if v)
    coverage = "Đầy đủ" if n_ok >= 4 else ("Một phần" if n_ok >= 2 else "Hạn chế")
    sources = {
        "Weather": bool(weather_available and wx_measured),
        "FIRMS": bool(firms_available),
        "GEE": bool(gee_configured),
        "Sentinel": _num(ndvi),
    }

    # ---- Actions ----
    actions = list(LEVEL_ACTIONS[level])
    if coverage == "Hạn chế" and FIELD_CHECK not in actions:
        actions.append(f"{FIELD_CHECK}: xác minh thực địa trước khi kết luận")
    if water_state == "DISTANT" and level in ("III", "IV", "V"):
        actions.append("Kiểm tra nguồn nước dự phòng (nguồn gần nhất ở xa)")
    if ignition_state == "ACTIVE":
        actions.insert(0, "Đã có điểm nóng — xác minh thực địa ngay")

    return {
        "level": level,
        "label": LEVEL_LABELS[level],
        "major_risk_driver": driver,
        "supporting_factors": supporting,
        "operational_status": OPERATIONAL_STATUS[level],
        "recommended_action": actions,
        "data_coverage_status": coverage,
        "sources": sources,
        "components": {
            "weather_stress": weather_state if weather_note is None else f"{weather_state}: {weather_note}",
            "fuel": fuel_state,
            "terrain": terrain_state,
            "ignition": ignition_state,
            "water": water_state,
            "rain": rain_note or (MISSING if not rain_available else "Không mưa đáng kể"),
        },
        "firms_hotspots": n_hot if firms_available else MISSING,
    }


def build_bulletin(area_name, scope_label, rating, measured, updated_hhmm):
    """Final template — text only, no %, MISSING shown honestly."""
    temp = measured.get("temperature")
    firms_line = (
        f"{rating['firms_hotspots']} điểm nóng"
        if isinstance(rating.get("firms_hotspots"), int) else "MISSING — chưa rõ"
    )
    cond = measured.get("condition") or MISSING
    lines = [
        f"🔥 {area_name}",
        "",
        f"CẤP {rating['level']} • {str(rating['label']).upper()}",
        "",
        "────────────────",
        "",
        "📡 FIRMS:",
        firms_line,
        "",
        "🌡 Nhiệt độ:",
        f"{temp}°C" if _num(temp) else MISSING,
        "",
        "🌧 Điều kiện:",
        cond,
        "",
        "🛰 Độ phủ dữ liệu:",
        str(rating["data_coverage_status"]).upper(),
        "",
        "────────────────",
        "",
        "⚠ Yếu tố chính:",
        "",
        str(rating["major_risk_driver"]),
    ]
    for s in rating.get("supporting_factors", [])[:4]:
        lines.append(str(s))
    lines += ["", "────────────────", "", "✅ Khuyến nghị:", ""]
    for a in rating.get("recommended_action", []):
        lines += [str(a), ""]
    lines += ["────────────────", "", "Cập nhật:", updated_hhmm]
    return "\n".join(lines)
