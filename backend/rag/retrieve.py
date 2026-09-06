"""RAG contract, with a safe local corpus fallback.

The Actian adapter at repository root remains the integration point. User data
is never sent to this retriever; only the current stage and curated query are.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import threading
from typing import Callable, Protocol


@dataclass(frozen=True)
class Retrieval:
    text: str
    source: str
    score: float = 1.0


class Retriever(Protocol):
    def retrieve(self, query: str, *, stage: str, limit: int = 3) -> list[Retrieval]: ...


class CuratedRetriever:
    _items = {
        "REGULATION": Retrieval("Approved options include slow breathing, orienting to three things, grounding through support, and observing sensation edges.", "curated:regulation"),
        "RECHECK": Retrieval("A change in intensity is not a success criterion; awareness and choice matter.", "curated:recheck"),
        "IFS_EXPLORATION": Retrieval("Use tentative language and let the user supply all meaning; do not diagnose or invent causes.", "curated:ifs"),
    }

    def retrieve(self, query: str, *, stage: str, limit: int = 3) -> list[Retrieval]:
        item = self._items.get(stage)
        return [item] if item and limit > 0 else []


class LocalSentenceEmbedder:
    """Lazily load the local embedding model on the first RAG request."""

    def __init__(self, model_name: str | None = None):
        self.model_name = model_name or os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        self._model = None
        self._lock = threading.Lock()

    def __call__(self, text: str) -> list[float]:
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from sentence_transformers import SentenceTransformer

                    self._model = SentenceTransformer(self.model_name)
        return self._model.encode(text, normalize_embeddings=True).tolist()


class ActianRetriever:
    """Adapter-friendly wrapper around the root ActianKnowledgeStore."""

    def __init__(self, adapter: object | None = None, fallback: Retriever | None = None, embed: Callable[[str], list[float]] | None = None):
        self.adapter = adapter
        self.fallback = fallback or CuratedRetriever()
        self.embed = embed

    def retrieve(self, query: str, *, stage: str, limit: int = 3) -> list[Retrieval]:
        if self.adapter is None or self.embed is None:
            return self.fallback.retrieve(query, stage=stage, limit=limit)
        # Root adapter APIs may evolve; this deliberately accepts its stable
        # search contract without importing or modifying that package.
        search = getattr(self.adapter, "search", None)
        if search is None:
            return self.fallback.retrieve(query, stage=stage, limit=limit)
        collection, framework, risk = self._filters(stage)
        try:
            matches = search(collection=collection, vector=self.embed(query), limit=limit, score_threshold=0.0, stage=stage, risk=risk, framework=framework)
        except Exception:
            # RAG is helpful context, never a reason to fail a guided session.
            return self.fallback.retrieve(query, stage=stage, limit=limit)
        result: list[Retrieval] = []
        for match in matches or []:
            if isinstance(match, dict):
                content = match.get("content", "")
                source = match.get("source", "")
                score = match.get("score", 0.0)
            else:
                content = getattr(match, "content", "")
                source = getattr(match, "source", "")
                score = getattr(match, "score", 0.0)
            result.append(Retrieval(text=str(content), source=str(source), score=float(score)))
        return result or self.fallback.retrieve(query, stage=stage, limit=limit)

    @staticmethod
    def _filters(stage: str) -> tuple[str, str | None, str | None]:
        if stage == "REGULATION":
            return "regulation", "somatic", "low"
        if stage == "IFS_EXPLORATION":
            return "ifs", "IFS", "low"
        if stage == "SAFETY":
            return "safety", "safety", "high"
        # Body-awareness guidance is held in the somatic collection. Unknown
        # stages still receive the conservative somatic collection filter.
        return "somatic_awareness", "somatic", "low"
