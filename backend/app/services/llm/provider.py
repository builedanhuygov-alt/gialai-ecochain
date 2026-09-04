"""LLM Provider abstraction — OpenAI/Gemini/Anthropic/Mock"""
import os, time, json, logging
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, AsyncIterator
import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)

class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, system: str, user: str, schema: Optional[Dict]=None) -> Dict: ...
    @abstractmethod
    async def stream(self, system: str, user: str) -> AsyncIterator[str]: ...
    @abstractmethod
    async def health(self) -> Dict: ...

class MockLLMProvider(LLMProvider):
    async def generate(self, system, user, schema=None):
        # Deterministic mock for DEMO_MODE
        return {
            "content": f"[MOCK] Based on Gia Lai data: {user[:120]} ... (DEMO)",
            "model": "mock-llm-v1",
            "provider": "MockLLM",
            "usage": {"prompt_tokens": 120, "completion_tokens": 80},
            "finish_reason": "stop",
        }
    async def stream(self, system, user):
        text = f"[MOCK STREAM] {user[:100]} ... DEMO"
        for chunk in text.split(" "):
            yield chunk + " "
            # no real delay, honest streaming would be from provider
    async def health(self):
        return {"status": "DEMO", "provider": "MockLLM", "model": "mock-llm-v1"}

class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.model = model
    async def generate(self, system, user, schema=None):
        async with httpx.AsyncClient(timeout=30) as client:
            payload = {
                "model": self.model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "temperature": 0.3,
            }
            if schema:
                payload["response_format"] = {"type": "json_object"}
            r = await client.post("https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json=payload)
            r.raise_for_status()
            j = r.json()
            return {"content": j["choices"][0]["message"]["content"], "model": self.model, "provider": "OpenAI", "usage": j.get("usage", {})}
    async def stream(self, system, user):
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("POST", "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"}, json={"model": self.model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "stream": True}) as r:
                async for line in r.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]": break
                        try: 
                            j = json.loads(data)
                            delta = j["choices"][0]["delta"].get("content", "")
                            if delta: yield delta
                        except: continue
    async def health(self):
        return {"status": "LIVE" if self.api_key else "CONFIGURATION_REQUIRED", "provider": "OpenAI", "model": self.model}

class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model = model
    async def generate(self, system, user, schema=None):
        # Gemini API: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        payload = {"contents": [{"parts": [{"text": system + "\n\n" + user}]}], "generationConfig": {"temperature": 0.3}}
        if schema:
            payload["generationConfig"]["responseMimeType"] = "application/json"
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=payload)
            r.raise_for_status()
            j = r.json()
            text = j["candidates"][0]["content"]["parts"][0]["text"]
            return {"content": text, "model": self.model, "provider": "Gemini"}
    async def stream(self, system, user):
        # Gemini streaming via generateContent?stream
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent?key={self.api_key}&alt=sse"
        payload = {"contents": [{"parts": [{"text": system + "\n\n" + user}]}]}
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("POST", url, json=payload) as r:
                async for line in r.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            j = json.loads(line[6:])
                            text = j["candidates"][0]["content"]["parts"][0].get("text", "")
                            if text: yield text
                        except: continue
    async def health(self):
        return {"status": "LIVE" if self.api_key else "CONFIGURATION_REQUIRED", "provider": "Gemini", "model": self.model}

class GroqProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "llama-3.1-70b-versatile"):
        self.api_key = api_key
        self.model = model
    async def generate(self, system, user, schema=None):
        async with httpx.AsyncClient(timeout=30) as client:
            payload = {"model": self.model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "temperature": 0.3}
            r = await client.post("https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"}, json=payload)
            r.raise_for_status()
            j = r.json()
            return {"content": j["choices"][0]["message"]["content"], "model": self.model, "provider": "Groq"}
    async def stream(self, system, user):
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("POST", "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"}, json={"model": self.model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "stream": True}) as r:
                async for line in r.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]": break
                        try:
                            j = json.loads(data)
                            delta = j["choices"][0]["delta"].get("content", "")
                            if delta: yield delta
                        except: continue
    async def health(self):
        return {"status": "LIVE" if self.api_key else "CONFIGURATION_REQUIRED", "provider": "Groq", "model": self.model}

def get_llm_provider() -> LLMProvider:
    s = get_settings()
    # Priority: explicit AI_PROVIDER env
    provider = (os.getenv("AI_PROVIDER") or "").lower()
    model = os.getenv("AI_MODEL")
    # Check keys
    gemini_key = s.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    groq_key = s.groq_api_key or os.getenv("GROQ_API_KEY")
    openai_key = s.openai_api_key or os.getenv("OPENAI_API_KEY")
    if provider == "openai" and openai_key:
        return OpenAIProvider(openai_key, model or "gpt-4o-mini")
    if provider == "gemini" and gemini_key:
        return GeminiProvider(gemini_key, model or "gemini-2.5-flash")
    if provider == "groq" and groq_key:
        return GroqProvider(groq_key, model or "llama-3.1-70b-versatile")
    # Auto-detect by available key
    if gemini_key:
        return GeminiProvider(gemini_key, model or "gemini-2.5-flash" if provider in ("", "gemini") else model)
    if groq_key:
        return GroqProvider(groq_key, model or "llama-3.1-70b-versatile")
    if openai_key:
        return OpenAIProvider(openai_key, model or "gpt-4o-mini")
    # DEMO_MODE -> Mock, else CONFIGURATION_REQUIRED but still return Mock for health check (caller decides)
    if s.is_demo:
        return MockLLMProvider()
    return MockLLMProvider()
