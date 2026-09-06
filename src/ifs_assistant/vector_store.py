"""Curated RAG knowledge storage for SOMA using Actian VectorAI DB."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from math import isfinite
from typing import Any

KNOWLEDGE_COLLECTIONS = ("ifs", "somatic_awareness", "regulation", "safety")


@dataclass(frozen=True, slots=True)
class KnowledgeMatch:
    """An approved knowledge chunk returned by semantic search."""

    id: int | str
    score: float
    content: str
    framework: str
    topic: str
    stage: str
    risk: str
    source: str
    metadata: dict[str, Any]


class ActianKnowledgeStore:
    """Store reviewed guidance, never user transcripts or session state."""

    def __init__(
        self,
        *,
        url: str = "localhost:6574",
        dimensions: int = 384,
        client_factory: Callable[[str], Any] | None = None,
    ) -> None:
        if dimensions <= 0:
            raise ValueError("dimensions must be positive")
        self.url = url
        self.dimensions = dimensions
        self._client_factory = client_factory

    def _client(self) -> Any:
        if self._client_factory is not None:
            return self._client_factory(self.url)
        from actian_vectorai import VectorAIClient

        return VectorAIClient(self.url)

    def health_check(self) -> dict[str, Any]:
        with self._client() as client:
            return dict(client.health_check())

    def initialize(self) -> None:
        """Create the four knowledge collections defined by the MVP."""
        from actian_vectorai import Distance, VectorParams

        with self._client() as client:
            for collection in KNOWLEDGE_COLLECTIONS:
                client.collections.get_or_create(
                    name=collection,
                    vectors_config=VectorParams(
                        size=self.dimensions,
                        distance=Distance.Cosine,
                    ),
                )

    def upsert_chunk(
        self,
        *,
        collection: str,
        chunk_id: int | str,
        content: str,
        vector: Sequence[float],
        framework: str,
        topic: str,
        stage: str,
        risk: str,
        source: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Upsert one curated chunk and force it to durable storage."""
        from actian_vectorai import PointStruct

        self._validate_collection(collection)
        payload = {
            **(metadata or {}),
            "content": content,
            "framework": framework,
            "topic": topic,
            "stage": stage,
            "risk": risk,
            "source": source,
        }
        with self._client() as client:
            client.points.upsert(
                collection,
                points=[
                    PointStruct(
                        id=chunk_id,
                        vector=self._validated_vector(vector),
                        payload=payload,
                    )
                ],
            )
            client.vde.flush(collection)

    def search(
        self,
        *,
        collection: str,
        vector: Sequence[float],
        limit: int = 5,
        score_threshold: float | None = None,
        stage: str | None = None,
        risk: str | None = None,
        framework: str | None = None,
    ) -> list[KnowledgeMatch]:
        """Retrieve guidance using conversation-stage and risk filters."""
        if limit <= 0:
            raise ValueError("limit must be positive")
        self._validate_collection(collection)

        from actian_vectorai import Field, FilterBuilder

        requested_filters = (
            ("stage", stage),
            ("risk", risk),
            ("framework", framework),
        )
        builder = FilterBuilder()
        for key, value in requested_filters:
            if value is not None:
                builder.must(Field(key).eq(value))

        kwargs: dict[str, Any] = {
            "vector": self._validated_vector(vector),
            "limit": limit,
            "with_payload": True,
        }
        if any(value is not None for _, value in requested_filters):
            kwargs["filter"] = builder.build()
        if score_threshold is not None:
            kwargs["score_threshold"] = score_threshold

        with self._client() as client:
            results = client.points.search(collection, **kwargs) or []

        matches: list[KnowledgeMatch] = []
        for result in results:
            payload = dict(result.payload or {})
            matches.append(
                KnowledgeMatch(
                    id=result.id,
                    score=float(result.score),
                    content=str(payload.pop("content", "")),
                    framework=str(payload.pop("framework", "")),
                    topic=str(payload.pop("topic", "")),
                    stage=str(payload.pop("stage", "")),
                    risk=str(payload.pop("risk", "")),
                    source=str(payload.pop("source", "")),
                    metadata=payload,
                )
            )
        return matches

    @staticmethod
    def _validate_collection(collection: str) -> None:
        if collection not in KNOWLEDGE_COLLECTIONS:
            allowed = ", ".join(KNOWLEDGE_COLLECTIONS)
            raise ValueError(f"collection must be one of: {allowed}")

    def _validated_vector(self, vector: Iterable[float]) -> list[float]:
        values = [float(value) for value in vector]
        if len(values) != self.dimensions:
            raise ValueError(
                f"expected a {self.dimensions}-dimension vector, got {len(values)}"
            )
        if not all(isfinite(value) for value in values):
            raise ValueError("vector values must all be finite")
        return values
