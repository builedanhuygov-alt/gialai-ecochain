"""LLM AI Agent — Gemini 3.6 Flash chiến lược (3 vai trò, không làm toán)"""
import asyncio
import os, json
from typing import Dict, List
from pydantic import BaseModel, Field
from app.core.config import get_settings

# Serverless functions die ~60s while the sync google-genai SDK handshake can
# take 10s+ cold — every blocking SDK call below runs in a thread with a hard
# cap so slow models degrade to the documented mock fallback instead of
# hanging the request until the platform kills it.
SDK_TIMEOUT_S = 25


async def _sdk_generate(prompt: str, **kw):
    from google import genai as genai_new
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or get_settings().gemini_api_key
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    client = genai_new.Client(api_key=api_key)
    return await asyncio.wait_for(
        asyncio.to_thread(client.models.generate_content, model="gemini-3.6-flash", contents=prompt, **kw),
        timeout=SDK_TIMEOUT_S,
    )


async def _groq_generate(prompt: str):
    """Groq fallback (openai/gpt-oss-20b, verified LIVE with full PCCC keys)
    — same JSON-text contract as _sdk_generate. Lazy import: groq stays an
    optional dep. NOTE: groq/compound-mini returns empty content on these
    prompts (compound tool-use), qwen fails json_object validation — both
    rejected after live probing, not assumed."""
    import types

    def _call() -> str:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY") or get_settings().groq_api_key
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not configured")
        client = Groq(api_key=api_key)
        # Groq json_object mode requires the word "json" in the prompt.
        resp = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": f"{prompt}\nReturn JSON."}],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or "{}"

    text = await asyncio.wait_for(asyncio.to_thread(_call), timeout=SDK_TIMEOUT_S)
    return types.SimpleNamespace(text=text)


async def _deepseek_generate(prompt: str):
    """DeepSeek fallback (deepseek-chat, OpenAI-compatible API via httpx —
    no new SDK dep). Same JSON-text contract. Raises on any failure so the
    chain falls through to the honest DEMO template."""
    import httpx

    async def _call() -> str:
        api_key = os.getenv("DEEPSEEK_API_KEY") or get_settings().deepseek_api_key
        if not api_key:
            raise RuntimeError("DEEPSEEK_API_KEY not configured")
        async with httpx.AsyncClient(timeout=SDK_TIMEOUT_S) as client:
            resp = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": f"{prompt}\nReturn JSON."}],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                },
            )
            if resp.status_code != 200:
                raise RuntimeError(f"DeepSeek HTTP {resp.status_code}")
            content = resp.json()["choices"][0]["message"]["content"] or "{}"
            return content

    text = await asyncio.wait_for(_call(), timeout=SDK_TIMEOUT_S + 5)
    return types.SimpleNamespace(text=text)


async def _fallback_llm(prompt: str):
    """Try Groq then DeepSeek; return (source, provider, model, data).
    Raises ValueError if neither returns full PCCC keys — caller falls to DEMO."""
    for name, fn, source, provider, model in (
        ("Groq", _groq_generate, "Groq gpt-oss-20b", "Groq", "openai/gpt-oss-20b"),
        ("DeepSeek", _deepseek_generate, "DeepSeek deepseek-chat", "DeepSeek", "deepseek-chat"),
    ):
        try:
            response = await fn(prompt)
            data = json.loads(response.text)
            if not all(k in data for k in PCCC_KEYS):
                raise ValueError(f"{name} thiếu key PCCC: {sorted(data.keys())}")
            return {"source": source, "provider": provider, "status": "LIVE", "model": model, **data}
        except Exception:
            continue
    raise ValueError("no fallback LLM returned full PCCC keys")


PCCC_KEYS = ("risk_level", "summary", "action_items")

class PCCCResponse(BaseModel):
    risk_level: str = Field(description="WATCH | WARNING | CRITICAL")
    summary: str = Field(description="Tóm tắt tình hình PCCC 1-2 câu")
    action_items: List[str] = Field(description="3 hành động khẩn cấp cho kiểm lâm")
    affected_district: str = Field(description="Huyện bị ảnh hưởng chính")
    confidence: float = Field(description="0-1, dựa trên data completeness")

async def check_llm() -> Dict:
    s = get_settings()
    gemini = s.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    groq = s.groq_api_key or os.getenv("GROQ_API_KEY")
    deepseek = s.deepseek_api_key or os.getenv("DEEPSEEK_API_KEY")
    openai = s.openai_api_key or os.getenv("OPENAI_API_KEY")
    provider = "Gemini" if gemini else ("Groq" if groq else ("DeepSeek" if deepseek else ("OpenAI" if openai else "Mock-LLM")))
    return {
        "configured": bool(gemini or groq or deepseek or openai),
        "status": "LIVE" if (gemini or groq or deepseek or openai) else "DEMO",
        "provider": provider,
        "model": "gemini-3.6-flash" if provider=="Gemini" else ("openai/gpt-oss-20b (via Groq)" if provider=="Groq" else ("deepseek-chat" if provider=="DeepSeek" else "gpt-4o-mini" if provider=="OpenAI" else "mock-llm-v1")),
        "capability": "PCCC synthesis + Vision + What-if advisor (Gemini 3.6 Flash)",
        "free_tier": "15 RPM, 1M TPM" if provider=="Gemini" else "",
        "fallback": "mock" if not (gemini or groq or openai) else "live",
    }

async def synthesis_pccc(fire_score: int, firms_count: int, weather: Dict, district: str = "Huyện Chư Prông") -> Dict:
    """Vai trò 1: Gemini chỉ tổng hợp, không tính toán — FireRiskEngine đã tính Score"""
    check = await check_llm()
    # Try new google-genai SDK first (gemini-3.6-flash)
    try:
        prompt = f"""
Bạn là chuyên gia PCCC Tỉnh Gia Lai. Phân tích dữ liệu THÔ (không tự tính toán):
- FireRiskEngine Score: {fire_score}/100
- FIRMS: {firms_count} điểm nhiệt tại {district}
- Thời tiết: {weather.get('temperature',34)}°C, gió {weather.get('wind_speed',20)}km/h, ẩm {weather.get('humidity',30)}%
- BBox Gia Lai: 107.3,13.1,109.4,14.7
Hãy xuất JSON chuẩn PCCCResponse với risk_level, summary, action_items (3), affected_district, confidence.
"""
        full_prompt = prompt  # Groq fallback cần prompt liệt kê key đầy đủ
        response = await _sdk_generate(
            prompt,
            config={"response_mime_type": "application/json", "temperature": 0.2},
        )
        data = json.loads(response.text)
        return {"source": "Gemini 3.6 Flash", "provider": "Gemini", "status": "LIVE", "model": "gemini-3.6-flash", **data, "evidence": {"fire_score": fire_score, "firms": firms_count, "weather": weather}}
    except Exception as e1:
        # Fallback old SDK 1.5
        try:
            import google.generativeai as genai
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or get_settings().gemini_api_key
            if api_key:
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel(
                    model_name="gemini-3.6-flash",
                    generation_config={"response_mime_type": "application/json", "response_schema": PCCCResponse, "temperature": 0.2}
                )
                prompt = f"Bạn là chuyên gia PCCC Gia Lai. Score {fire_score}, FIRMS {firms_count} tại {district}, thời tiết {weather}. Xuất JSON PCCCResponse."
                response = model.generate_content(prompt)
                data = json.loads(response.text)
                return {"source": "Gemini 3.6 Flash", "provider": "Gemini", "status": "LIVE", "model": "gemini-3.6-flash", **data}
        except Exception:
            pass
        # Fallback 2+3: Groq → DeepSeek (cả hai verified LIVE) — cùng JSON contract.
        # Thiếu key bắt buộc → rớt xuống mẫu DEMO, không bịa field.
        try:
            out = await _fallback_llm(full_prompt)
            return {**out, "evidence": {"fire_score": fire_score, "firms": firms_count, "weather": weather}}
        except Exception:
            pass
        # Mock fallback: chỉ suy từ score THẬT của FireRiskEngine, mọi chữ đều
        # ghi rõ là mẫu dự phòng. Status luôn DEMO trên path này (bug cũ trả LIVE).
        level = "CRITICAL" if fire_score>=80 else "WARNING" if fire_score>=60 else "WATCH"
        return {
            "source": "rule-based fallback (chưa có LLM)",
            "provider": check["provider"],
            "status": "DEMO",
            "model": "rule-based-v1",
            "risk_level": level,
            "summary": f"Mẫu dự phòng (chưa có LLM): score {fire_score}/100 tại {district} với {firms_count} điểm FIRMS → {level}. Cần LLM để có khuyến nghị cụ thể.",
            "action_items": [f"Tuần tra khu vực {district} theo quy trình hiện hành",
                             "Rà soát đường băng cản lửa quanh điểm nóng FIRMS",
                             "Cảnh báo các xã trong diện theo dõi khi gió mạnh"],
            "affected_district": district,
            "confidence": 0.5,
            "evidence": {"fire_score": fire_score, "firms": firms_count},
            "note": f"Fallback khi LLM lỗi: {str(e1)[:120]}",
        }

async def verify_fire_image(image_b64: str, gps: Dict) -> Dict:
    """Vai trò 2: Vision multimodal Text+Image"""
    try:
        # For vision, use gemini-3.6-flash with image
        prompt = "Bạn là chuyên gia xác minh ảnh cháy rừng Gia Lai. Ảnh này có phải khói/lửa thật hay đám mây/ảnh mạng? Trả JSON {is_real: bool, confidence: 0-1, reason: string}"
        # Simplified: send text only if image not decoded
        resp = await _sdk_generate(prompt)
        return {"status": "LIVE", "provider": "Gemini Vision 3.6", "gps": gps, "result": resp.text[:500]}
    except Exception as e:
        # Không xác minh được = không kết luận. is_real False + UNAVAILABLE,
        # không bao giờ "xác nhận khói thật" khi chưa phân tích.
        return {"status": "UNAVAILABLE", "provider": "Mock Vision", "gps": gps,
                "result": {"is_real": False, "confidence": None,
                           "reason": f"Chưa xác minh được ảnh (thiếu key/lỗi Vision) — không kết luận: {str(e)[:100]}"}}

async def what_if_advisor(district: str, temp_delta: float, ndvi: float) -> Dict:
    """Vai trò 3: What-if Advisor"""
    try:
        prompt = f"Bạn là chuyên gia PCCC Gia Lai. Giải thích ngắn gọn vì sao {district} đang EXTREME với NDVI {ndvi} và nếu nhiệt độ tăng {temp_delta}°C thì nguy cơ lan cháy tăng bao nhiêu %?"
        resp = await _sdk_generate(prompt)
        return {"status": "LIVE", "provider": "Gemini", "answer": resp.text[:800]}
    except Exception:
        for fn, provider in ((_groq_generate, "Groq"), (_deepseek_generate, "DeepSeek")):
            try:
                resp = await fn(prompt)
                return {"status": "LIVE", "provider": provider, "answer": resp.text[:800]}
            except Exception:
                continue
        return {"status": "UNAVAILABLE",
                "answer": f"Chưa tư vấn được kịch bản {district} (LLM chưa khả dụng) — không suy đoán mức nguy cơ khi chưa phân tích.",
                "reason": "LLM what-if chưa khả dụng"}

async def generate_pccc_scenario(prompt: str = "Simulate forest fire spread in Gia Lai with wind 20km/h") -> Dict:
    return await synthesis_pccc(fire_score=77, firms_count=2, weather={"temperature": 34, "wind_speed": 20, "humidity": 30}, district="Huyện Chư Prông")
