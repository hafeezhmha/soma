from __future__ import annotations

from types import SimpleNamespace

import pytest

from ifs_assistant.vector_store import ActianKnowledgeStore


class FakeClient:
    def __init__(self, results=None):
        self.results = results or []
        self.search_args = None
        self.points = self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def search(self, collection, **kwargs):
        self.search_args = (collection, kwargs)
        return self.results


def test_rejects_wrong_vector_dimensions():
    store = ActianKnowledgeStore(dimensions=3)
    with pytest.raises(ValueError, match="expected a 3-dimension vector"):
        store._validated_vector([0.1, 0.2])


def test_rejects_unknown_collection():
    store = ActianKnowledgeStore(dimensions=2)
    with pytest.raises(ValueError, match="collection must be one of"):
        store.search(collection="user_memories", vector=[0.1, 0.2])


def test_search_applies_state_aware_filters(monkeypatch):
    fake = FakeClient(
        [
            SimpleNamespace(
                id="chunk-1",
                score=0.91,
                payload={
                    "content": "Notice where your body is supported.",
                    "framework": "somatic",
                    "topic": "grounding",
                    "stage": "REGULATION",
                    "risk": "low",
                    "source": "regulation/grounding.md",
                    "review_status": "unreviewed_demo",
                },
            )
        ]
    )
    store = ActianKnowledgeStore(dimensions=2, client_factory=lambda _: fake)

    class FakeFilterBuilder:
        def __init__(self):
            self.conditions = []

        def must(self, condition):
            self.conditions.append(condition)
            return self

        def build(self):
            return self.conditions

    class FakeField:
        def __init__(self, name):
            self.name = name

        def eq(self, value):
            return self.name, value

    fake_module = SimpleNamespace(FilterBuilder=FakeFilterBuilder, Field=FakeField)
    monkeypatch.setitem(__import__("sys").modules, "actian_vectorai", fake_module)

    matches = store.search(
        collection="regulation",
        vector=[0.1, 0.2],
        stage="REGULATION",
        risk="low",
    )

    assert matches[0].content == "Notice where your body is supported."
    assert matches[0].metadata == {"review_status": "unreviewed_demo"}
    assert fake.search_args[0] == "regulation"
    assert fake.search_args[1]["filter"] == [
        ("stage", "REGULATION"),
        ("risk", "low"),
    ]
