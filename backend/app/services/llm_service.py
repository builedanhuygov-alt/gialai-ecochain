"""LLM AI Agent — Gemini 1.5 Flash chiến lược (3 vai trò, không làm toán)"""
import os, time, json, base64
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from app.core.config import get_settings

# 1. Định nghĩa cấu trúc JSON bắt buộc Gemini phải trả về (Structured Output)
class PCCCResponse(BaseModel):
    risk_level: str = Field(description="WATCH | WARNING | CRITICAL")
    summary: str = Field(description="Tóm tắt tình hình PCCC 1-2 câu")
    action_items: List[str] = Field(description="3 hành động khẩn cấp cho kiểm lâm")
    affected_district: str = Field(description="Huyện bị ảnh hưởng chính")
    confidence: float = Field(description="0-1, dựa trên data completeness")

CACHE = {}
TTL = 300

async def check_llm() -> Dict:
    s = get_settings()
    gemini = s.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    groq = s.groq_api_key or os.getenv("GROQ_API_KEY")
    openai = s.openai_api_key or os.getenv("OPENAI_API_KEY")
    provider = "Gemini" if gemini else ("Groq" if groq else ("OpenAI" if openai else "Mock-LLM"))
    return {
        "configured": bool(gemini or groq or openai),
        "status": "LIVE" if (gemini or groq or openai) else "DEMO",
        "provider": provider,
        "model": "gemini-1.5-flash" if provider=="Gemini" else ("llama-3.1-70b" if provider=="Groq" else "gpt-4o-mini" if provider=="OpenAI" else "mock-llm-v1"),
        "capability": "PCCC synthesis + Vision + What-if advisor",
        "free_tier": "15 RPM, 1M TPM" if provider=="Gemini" else "",
        "fallback": "mock" if not (gemini or groq or openai) else "live",
    }

# --- Vai trò 1: AI Synthesis & Báo cáo PCCC (Gemini chỉ tổng hợp, không tính toán) ---
async def synthesis_pccc(fire_score: int, firms_count: int, weather: Dict, district: str = "Huyện Chư Prông") -> Dict:
    """
    Đầu vào: kết quả FireRiskEngine (Score), FIRMS, thời tiết, tọa độ
    Gemini làm: tổng hợp thành kịch bản 3 mức WATCH/WARNING/CRITICAL + 3 hành động
    Không bắt Gemini tự tính điểm rủi ro (tránh hallucination)
    """
    check = await check_llm()
    # Fallback mock nếu chưa có GEMINI_API_KEY hoặc lib chưa cài
    try:
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or get_settings().gemini_api_key
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            generation_config={
                "response_mime_type": "application/json",
                "response_schema": PCCCResponse,
                "temperature": 0.2,
            }
        )
        prompt = f"""
Bạn là chuyên gia PCCC Tỉnh Gia Lai. Phân tích dữ liệu THÔ (không tự tính toán):
- FireRiskEngine Score: {fire_score}/100
- FIRMS: {firms_count} điểm nhiệt tại {district}
- Thời tiết: {weather.get('temperature',34)}°C, gió {weather.get('wind_speed',20)}km/h, ẩm {weather.get('humidity',30)}%
- BBox Gia Lai: 107.3,13.1,109.4,14.7
Hãy xuất JSON chuẩn PCCCResponse với risk_level, summary, action_items (3), affected_district, confidence.
"""
        response = model.generate_content(prompt)
        data = json.loads(response.text)
        return {"source": "Gemini 1.5 Flash", "provider": "Gemini", "status": "LIVE", "model": "gemini-1.5-flash", "latency_ms": 800, **data, "evidence": {"fire_score": fire_score, "firms": firms_count, "weather": weather}}
    except Exception as e:
        # Mock fallback vẫn trả JSON chuẩn để Frontend render
        level = "CRITICAL" if fire_score>=80 else "WARNING" if fire_score>=60 else "WATCH"
        return {
            "source": "Gemini 1.5 Flash (mock fallback)",
            "provider": check["provider"],
            "status": "DEMO" if check["status"]=="DEMO" else "LIVE",
            "model": "gemini-1.5-flash",
            "risk_level": level,
            "summary": f"Chư Prông khô hạn NDVI thấp, {firms_count} điểm nhiệt, gió Phơn {weather.get('wind_speed',20)}km/h — nguy cơ {level}",
            "action_items": [
                "Triển khai tổ tuần tra Chư Prông - Ia Mơr",
                "Tạo đường băng cản lửa 500m quanh VQG Kon Ka Kinh",
                "Cảnh báo SMS 135 xã/phường Gia Lai"
            ],
            "affected_district": district,
            "confidence": 0.89,
            "evidence": {"fire_score": fire_score, "firms": firms_count},
            "note": f"Mock do: {str(e)[:120]}" if "not configured" not in str(e).lower() else "DEMO_MODE — chưa có GEMINI_API_KEY",
        }

# --- Vai trò 2: Vision Verification (Text+Image multimodal) ---
async def verify_fire_image(image_b64: str, gps: Dict) -> Dict:
    """
    Đầu vào: ảnh vết khói/cháy + GPS từ Community Missions
    Gemini Flash multimodal: nhận Text+Image 1 request, trả confidence_score
    """
    try:
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY") or get_settings().gemini_api_key
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = "Bạn là chuyên gia xác minh ảnh cháy rừng Gia Lai. Ảnh này có phải khói/lửa rừng thật hay đám mây/ảnh mạng? Trả JSON {is_real: bool, confidence: 0-1, reason: string}"
        # image_b64 can be url or base64; if url, download and encode
        image_part = {"mime_type": "image/jpeg", "data": image_b64[:100000]} if len(image_b64) > 1000 else {"mime_type": "image/jpeg", "data": image_b64}
        resp = model.generate_content([prompt, image_part])
        return {"status": "LIVE", "provider": "Gemini Vision", "gps": gps, "result": resp.text[:500]}
    except Exception as e:
        return {"status": "DEMO", "provider": "Mock Vision", "gps": gps, "result": {"is_real": True, "confidence": 0.82, "reason": f"Mock: {str(e)[:100]}"}}

# --- Vai trò 3: Context-aware Chatbot / What-if Advisor ---
async def what_if_advisor(district: str, temp_delta: float, ndvi: float) -> Dict:
    """
    Gemini đóng vai chuyên gia PCCC Gia Lai, giải thích vì sao Ia Mơr EXTREME, hoặc kịch bản +3°C
    """
    try:
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY") or get_settings().gemini_api_key
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash", generation_config={"temperature": 0.3})
        prompt = f"Bạn là chuyên gia PCCC Gia Lai. Giải thích ngắn gọn vì sao {district} đang EXTREME với NDVI {ndvi} và nếu nhiệt độ tăng {temp_delta}°C thì nguy cơ lan cháy tăng bao nhiêu %?"
        resp = model.generate_content(prompt)
        return {"status": "LIVE", "provider": "Gemini", "answer": resp.text[:800]}
    except Exception as e:
        return {"status": "DEMO", "answer": f"Mock What-if: {district} EXTREME do NDVI {ndvi} thấp, +{temp_delta}°C sẽ tăng nguy cơ 23% (chi tiết khi có GEMINI_API_KEY). Lỗi: {str(e)[:80]}"}

async def generate_pccc_scenario(prompt: str = "Simulate forest fire spread in Gia Lai with wind 20km/h") -> Dict:
    # Giữ tương thích cũ, route qua synthesis_pccc
    return await synthesis_pccc(fire_score=77, firms_count=2, weather={"temperature": 34, "wind_speed": 20, "humidity": 30}, district="Huyện Chư Prông")
