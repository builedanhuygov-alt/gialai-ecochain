"""Vector Store Provider abstraction — local dev + pgvector replaceable"""
import hashlib, math, time
from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class KnowledgeDocument:
    id: str
    title: str
    content: str
    category: str
    source: str
    timestamp: str
    location: Optional[str] = None

@dataclass
class KnowledgeChunk:
    id: str
    document_id: str
    content: str
    embedding: List[float]
    source: str
    title: str
    category: str
    location: Optional[str]
    timestamp: str

def _embed(text: str, dim: int = 128) -> List[float]:
    # Simple deterministic hash embedding for local dev (no external model)
    h = hashlib.sha256(text.encode()).hexdigest()
    vec = []
    for i in range(dim):
        # use hex pairs to generate pseudo-random
        val = int(h[(i*2)%64:(i*2)%64+2], 16) / 255.0
        # mix with position
        val = (val + (i/dim)) % 1.0
        vec.append(val)
    # normalize
    norm = math.sqrt(sum(x*x for x in vec)) or 1
    return [x/norm for x in vec]

def _cosine(a: List[float], b: List[float]) -> float:
    return sum(x*y for x,y in zip(a,b))

class VectorStoreProvider(ABC):
    @abstractmethod
    def add_document(self, doc: KnowledgeDocument) -> List[str]: ...
    @abstractmethod
    def search(self, query: str, top_k: int = 4, category: Optional[str]=None) -> List[Dict]: ...
    @abstractmethod
    def delete(self, doc_id: str) -> bool: ...
    @abstractmethod
    def update(self, doc_id: str, content: str) -> bool: ...
    @abstractmethod
    def health(self) -> Dict: ...

class LocalVectorStore(VectorStoreProvider):
    def __init__(self):
        self.docs: Dict[str, KnowledgeDocument] = {}
        self.chunks: Dict[str, KnowledgeChunk] = {}
    def _chunk(self, doc: KnowledgeDocument, size: int = 500) -> List[KnowledgeChunk]:
        words = doc.content.split()
        chunks = []
        for i in range(0, len(words), size):
            chunk_text = " ".join(words[i:i+size])
            cid = f"{doc.id}_c{i//size}"
            chunks.append(KnowledgeChunk(
                id=cid, document_id=doc.id, content=chunk_text,
                embedding=_embed(chunk_text), source=doc.source, title=doc.title,
                category=doc.category, location=doc.location, timestamp=doc.timestamp
            ))
        return chunks
    def add_document(self, doc: KnowledgeDocument) -> List[str]:
        self.docs[doc.id] = doc
        chunks = self._chunk(doc)
        for c in chunks:
            self.chunks[c.id] = c
        return [c.id for c in chunks]
    def search(self, query: str, top_k: int = 4, category: Optional[str]=None) -> List[Dict]:
        q_emb = _embed(query)
        scored = []
        for c in self.chunks.values():
            if category and c.category != category:
                continue
            score = _cosine(q_emb, c.embedding)
            # boost Gia Lai specific
            if "gia lai" in c.content.lower() and "gia lai" in query.lower():
                score += 0.1
            scored.append((score, c))
        scored.sort(key=lambda x: x[0], reverse=True)
        results = []
        for score, c in scored[:top_k]:
            results.append({
                "chunk_id": c.id,
                "document_id": c.document_id,
                "title": c.title,
                "content": c.content[:400],
                "source": c.source,
                "category": c.category,
                "location": c.location,
                "timestamp": c.timestamp,
                "relevance": round(float(score), 3),
            })
        return results
    def delete(self, doc_id: str) -> bool:
        if doc_id in self.docs:
            del self.docs[doc_id]
            self.chunks = {k:v for k,v in self.chunks.items() if v.document_id != doc_id}
            return True
        return False
    def update(self, doc_id: str, content: str) -> bool:
        if doc_id not in self.docs:
            return False
        self.docs[doc_id].content = content
        # re-chunk
        self.chunks = {k:v for k,v in self.chunks.items() if v.document_id != doc_id}
        for c in self._chunk(self.docs[doc_id]):
            self.chunks[c.id] = c
        return True
    def health(self) -> Dict:
        return {"status": "LIVE", "provider": "LocalVectorStore", "documents": len(self.docs), "chunks": len(self.chunks), "backend": "hash-embedding local"}

# Singleton
_local_store: Optional[LocalVectorStore] = None
def get_vector_store() -> VectorStoreProvider:
    global _local_store
    # Prefer pgvector if DATABASE_URL is postgres and pgvector available
    # For now return local
    if _local_store is None:
        _local_store = LocalVectorStore()
        # seed Gia Lai knowledge base
        from app.services.rag.knowledge_base import seed_gia_lai
        seed_gia_lai(_local_store)
    return _local_store
