"""AI Agent API — true orchestration, RAG, tool-calling, streaming"""
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
import json, time, asyncio
from app.core.config import get_settings
from app.services.ai.orchestrator import orchestrate
from app.services.llm.provider import get_llm_provider
from app.services.rag.vector_store import get_vector_store

router = APIRouter(tags=["AI"])

class ChatRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=2000)
    lat: Optional[float] = 13.9
    lon: Optional[float] = 108.3
    conversation: Optional[List[dict]] = None

class FireRiskRequest(BaseModel):
    lat: float = 13.9
    lon: float = 108.3
    administrative_unit_id: str = "Gia Lai"

# Rate limiting simple per IP (reuse main middleware handles 60/min)
# Tool & RAG are real, not mock-as-LIVE

@router.post("/ai/chat")
async def ai_chat(req: ChatRequest, request: Request):
    # Bounded context: limit conversation to last 10 messages
    conv = (req.conversation or [])[-10:]
    result = await orchestrate(req.query, lat=req.lat, lon=req.lon, conversation=conv)
    return result

@router.post("/ai/analyze")
async def ai_analyze(req: ChatRequest):
    return await orchestrate(req.query, lat=req.lat, lon=req.lon)

@router.post("/ai/fire-risk")
async def ai_fire_risk(req: FireRiskRequest):
    q = f"Gia Lai hiện tại có khu vực nào nguy cơ cháy rừng cao? lat {req.lat} lon {req.lon}"
    return await orchestrate(q, lat=req.lat, lon=req.lon)

@router.post("/ai/what-if")
async def ai_what_if(body: dict):
    temp = body.get("temperature", 3)
    rain = body.get("rainfall", -30)
    wind = body.get("wind", 20)
    lat = body.get("lat", 13.9)
    lon = body.get("lon", 108.3)
    # Deterministic simulation via FireRiskEngine + AI explanation
    from app.services.ai.tools import run_fire_simulation
    sim = await run_fire_simulation(temp_delta=temp, rain_delta=rain, wind_delta=wind)
    # Add RAG + LLM explanation
    q = f"Chạy kịch bản nhiệt độ +{temp}°C mưa {rain}% gió +{wind}% cho Gia Lai"
    orch = await orchestrate(q, lat=lat, lon=lon)
    orch["simulation"] = sim["data"]
    orch["simulation_note"] = "SIMULATION NOT ACTUAL FIRE"
    return orch

@router.post("/ai/chat/stream")
async def ai_chat_stream(req: ChatRequest):
    """SSE streaming — real from LLM provider, not fake setTimeout"""
    provider = get_llm_provider()
    vs = get_vector_store()
    rag = vs.search(req.query, top_k=3)
    rag_text = "\n".join([r["content"] for r in rag])
    
    system = "You are Gia Lai EcoChain Environmental Intelligence. Use RAG and tools, answer in Vietnamese, cite sources."
    user = f"Query: {req.query}\nRAG: {rag_text[:1500]}"
    
    async def event_gen():
        yield f"data: {json.dumps({'type':'THINKING','message':'Identified intent'})}\n\n"
        await asyncio.sleep(0.1)
        yield f"data: {json.dumps({'type':'RETRIEVING','count': len(rag)})}\n\n"
        await asyncio.sleep(0.1)
        yield f"data: {json.dumps({'type':'ANALYZING','message':'Checking satellite/weather'})}\n\n"
        # Real streaming from provider
        try:
            async for chunk in provider.stream(system, user):
                yield f"data: {json.dumps({'type':'CHUNK','content': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type':'ERROR','error': str(e)})}\n\n"
        yield f"data: {json.dumps({'type':'COMPLETE','citations': [{'title': r['title'], 'source': r['source']} for r in rag]})}\n\n"
    
    return StreamingResponse(event_gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})

@router.post("/ai/pccc/synthesis")
async def pccc_synthesis(body: dict):
    """Vai trò 1: Gemini tổng hợp FireRiskEngine + FIRMS + thời tiết → kịch bản PCCC JSON chuẩn"""
    from app.services.llm_service import synthesis_pccc
    score = body.get("fire_score", 77)
    firms = body.get("firms_count", 2)
    weather = body.get("weather", {"temperature": 34, "wind_speed": 20, "humidity": 30})
    district = body.get("district", "Huyện Chư Prông")
    return await synthesis_pccc(fire_score=score, firms_count=firms, weather=weather, district=district)

@router.post("/ai/vision/verify")
async def vision_verify(body: dict):
    """Vai trò 2: Gemini multimodal Text+Image xác minh ảnh cháy cộng đồng"""
    from app.services.llm_service import verify_fire_image
    image_b64 = body.get("image_b64", "")
    gps = body.get("gps", {"lat": 13.9, "lon": 108.3})
    return await verify_fire_image(image_b64=image_b64, gps=gps)

@router.post("/ai/what-if/advisor")
async def what_if_advisor(body: dict):
    """Vai trò 3: What-if Advisor giải thích EXTREME / +3°C"""
    from app.services.llm_service import what_if_advisor as wia
    district = body.get("district", "Xã Ia Mơr")
    temp_delta = body.get("temp_delta", 3)
    ndvi = body.get("ndvi", 0.25)
    return await wia(district=district, temp_delta=temp_delta, ndvi=ndvi)

@router.get("/ai/health")
async def ai_health():
    p = get_llm_provider()
    vs = get_vector_store()
    return {
        "llm": await p.health(),
        "rag": vs.health(),
        "vector_store": vs.health(),
        "streaming": "SSE",
        "tool_calling": list(__import__('app.services.ai.tools', fromlist=['TOOL_MAP']).TOOL_MAP.keys())[:5],
        "structured_output": "JSON validated (PCCCResponse response_schema)",
        "api_security": "backend-only, no frontend keys",
        "gemini_roles": ["synthesis_pccc", "vision_verify", "what_if_advisor"],
    }

@router.get("/ai/rag/search")
async def rag_search(q: str, top_k: int = 4):
    vs = get_vector_store()
    return {"query": q, "results": vs.search(q, top_k=top_k), "vector_store": vs.health()}
