"""Smoke/Fire plume detection from satellite tile via Gemini Vision"""
import base64, httpx, time, math
from typing import Dict

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GiaLaiEcoChain/1.0"}


def _latlon_to_tile(lat: float, lon: float, z: int = 12) -> tuple[int, int]:
    """Slippy-map tile chứa điểm lat/lon (chuẩn OSM/Google/Esri)."""
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lr = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lr) + 1.0 / math.cos(lr)) / math.pi) / 2.0 * n)
    return x, y


async def _download_tile(url: str) -> bytes | None:
    try:
        async with httpx.AsyncClient(timeout=15, headers=UA, follow_redirects=True) as c:
            r = await c.get(url)
            ct = r.headers.get("content-type", "")
            if r.status_code == 200 and "image" in ct and len(r.content) > 1000:
                return r.content
    except Exception:
        pass
    return None

async def detect_smoke_from_tile(tile_url: str = None, lat: float=13.9, lon: float=108.3, bbox: str="107.3,13.1,109.4,14.7") -> Dict:
    # Gia Lai bbox default, tile_url e.g. https://server.arcgisonline.com/.../{z}/{y}/{x} or Sentinel
    # If tile_url provided, download tile image and send to Gemini Vision
    # Fallback heuristic when no API key
    from app.core.config import get_settings
    import os
    has_key = bool(get_settings().gemini_api_key or os.getenv("GEMINI_API_KEY"))
    
    # Download tile: template {z}/{x}/{y} → tính đúng ô chứa lat/lon
    # (KHÔNG hard-code tọa độ ô — ô cũ rơi ra biển, tile trắng 678B);
    # URL cụ thể (không placeholder) → tải trực tiếp.
    image_b64 = None
    if tile_url:
        try:
            if "{z}" in tile_url or "{x}" in tile_url or "{y}" in tile_url:
                tx, ty = _latlon_to_tile(lat, lon, 12)
                sample_url = (tile_url.replace("{z}", "12").replace("{x}", str(tx)).replace("{y}", str(ty)))
                blob = await _download_tile(sample_url)
            else:
                blob = await _download_tile(tile_url)
            if blob:
                image_b64 = base64.b64encode(blob).decode()
        except Exception:
            pass
    
    # Gemini Vision multimodal (sync SDK → chạy trong thread để không block loop)
    sdk_error = ""
    used_model = None
    if has_key and image_b64:
        import asyncio, json
        try:
            from google import genai
            client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or get_settings().gemini_api_key)
            prompt = """Bạn là chuyên gia PCCC Gia Lai. Ảnh vệ tinh này có vệt khói/lửa rừng không? 
            - Nếu có khói trắng/xám lan từ rừng, trả JSON {"is_smoke": true, "confidence": 0.85, "bbox": [x,y,w,h], "reason": "vệt khói", "alert": "CRITICAL"}
            - Nếu không, trả {"is_smoke": false, "confidence": 0.9}
            Chỉ trả JSON."""
            # Send image as inline data
            def _gen(model: str):
                return client.models.generate_content(
                    model=model,
                    contents=[prompt, {"inline_data": {"mime_type": "image/jpeg", "data": image_b64[:200000]}}],
                    config={"response_mime_type": "application/json", "temperature": 0.2},
                )
            # Fallback model khi bản chính quá tải (pattern như llm/provider.py)
            data = None
            for _m in ("gemini-3.6-flash", "gemini-3.5-flash"):
                try:
                    resp = await asyncio.to_thread(_gen, _m)
                    data = json.loads(resp.text)
                    used_model = _m
                    break
                except Exception as _me:
                    sdk_error = str(_me)[:150]
                    continue
            if data is None:
                raise RuntimeError(sdk_error or "vision failed")
            # Auto create alert if smoke
            if data.get("is_smoke"):
                data["alert"] = {"level": "CRITICAL", "message": f"Phát hiện khói tại {lat},{lon} - {data.get('reason')}", "bbox": bbox, "timestamp": time.time(), "source": "Gemini Vision", "tile_url": tile_url}
            data["model"] = used_model
            return {"status": "LIVE", "provider": "Gemini Vision", "model": used_model, "result": data, "tile_url": tile_url}
        except Exception as e:
            sdk_error = str(e)[:150]
    # Fallback TRUNG THỰC — không bao giờ bịa phát hiện khói.
    # Quy tắc: không phân tích được ảnh = is_smoke False + status UNAVAILABLE,
    # KHÔNG bbox giả, KHÔNG alert giả, KHÔNG confidence giả.
    if not has_key:
        why = "chưa cấu hình GEMINI_API_KEY — Vision chưa chạy, không kết luận khói"
    elif not image_b64:
        why = "không tải được ảnh tile vệ tinh — Vision chưa chạy, không kết luận khói"
    else:
        why = f"Vision lỗi ({sdk_error}) — không kết luận khói, thử lại sau"
    return {
        "status": "UNAVAILABLE",
        "provider": "Gemini Vision" if has_key else "Mock Vision",
        "result": {
            "is_smoke": False,
            "confidence": None,
            "bbox": None,
            "reason": why,
            "alert": None,
        },
        "tile_url": tile_url,
        "note": "UNAVAILABLE = chưa phân tích (thiếu key/thiếu ảnh/lỗi SDK). Frontend không được vẽ marker hay báo 'an toàn' từ kết quả này.",
    }
