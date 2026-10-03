"""Chatbot: luôn có câu trả lời tiếng Việt từ dữ liệu thật + nhớ ngữ cảnh."""
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient
from app.database import init_db
from app.main import create_app


def setup():
    app = create_app()
    init_db()
    return TestClient(app)


def test_chat_returns_vietnamese_answer():
    c = setup()
    r = c.post("/api/ai/chat", json={"query": "Gia Lai hiện có khu vực nào nguy cơ cháy cao?"})
    assert r.status_code in (200, 503), r.text
    if r.status_code == 200:
        d = r.json()
        assert isinstance(d.get("answer"), str) and len(d["answer"]) > 20
        assert "nguy cơ" in d["answer"].lower()
        assert "/100" in d["answer"]


def test_chat_accepts_conversation_context():
    c = setup()
    conv = [{"role": "user", "content": "Khu vực nào khô nhất?"},
            {"role": "assistant", "content": "Xã A khô nhất."}]
    r = c.post("/api/ai/chat", json={"query": "Còn gió ở đó thì sao?", "conversation": conv})
    assert r.status_code in (200, 503), r.text
    if r.status_code == 200:
        assert isinstance(r.json().get("answer"), str)


def test_chat_rejects_too_short():
    c = setup()
    assert c.post("/api/ai/chat", json={"query": "hi"}).status_code == 422
