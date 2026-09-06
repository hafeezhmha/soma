"""Check that the local VectorAI DB instance is reachable."""

from __future__ import annotations

import os

from ifs_assistant import ActianKnowledgeStore
from ifs_assistant.vector_store import KNOWLEDGE_COLLECTIONS


def main() -> None:
    store = ActianKnowledgeStore(
        url=os.getenv("VECTORAI_URL", "localhost:6574"),
        dimensions=int(os.getenv("VECTORAI_DIMENSIONS", "384")),
    )
    info = store.health_check()
    store.initialize()
    print(f"Connected to {info['title']} v{info['version']}")
    print(
        f"Collections {', '.join(KNOWLEDGE_COLLECTIONS)} are ready "
        f"({store.dimensions} dimensions)"
    )


if __name__ == "__main__":
    main()
