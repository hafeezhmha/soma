"""Embed the reviewed Markdown corpus and load it into VectorAI DB."""

from __future__ import annotations

import os
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from ifs_assistant import ActianKnowledgeStore

ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_ROOT = ROOT / "knowledge"


def parse_document(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"{path} is missing metadata front matter")
    header, separator, content = text[4:].partition("\n---\n")
    if not separator:
        raise ValueError(f"{path} has malformed metadata front matter")
    metadata: dict[str, str] = {}
    for line in header.splitlines():
        key, delimiter, value = line.partition(":")
        if not delimiter:
            raise ValueError(f"{path} has malformed metadata line: {line}")
        metadata[key.strip()] = value.strip()
    required = {"framework", "topic", "stage", "risk", "review_status"}
    missing = required - metadata.keys()
    if missing:
        raise ValueError(f"{path} is missing metadata: {', '.join(sorted(missing))}")
    return metadata, content.strip()


def main() -> None:
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        raise SystemExit("Install RAG dependencies with: pip install -e '.[rag]'") from error

    paths = sorted(KNOWLEDGE_ROOT.glob("*/*.md"))
    documents = [parse_document(path) for path in paths]
    model = SentenceTransformer(os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2"))
    embeddings = model.encode(
        [content for _, content in documents],
        normalize_embeddings=True,
    )
    store = ActianKnowledgeStore(
        url=os.getenv("VECTORAI_URL", "localhost:6574"),
        dimensions=int(os.getenv("VECTORAI_DIMENSIONS", "384")),
    )
    store.initialize()

    for path, (metadata, content), vector in zip(paths, documents, embeddings):
        source = str(path.relative_to(KNOWLEDGE_ROOT))
        store.upsert_chunk(
            collection=path.parent.name,
            chunk_id=str(uuid5(NAMESPACE_URL, f"soma:{source}:{content}")),
            content=content,
            vector=vector.tolist(),
            framework=metadata["framework"],
            topic=metadata["topic"],
            stage=metadata["stage"],
            risk=metadata["risk"],
            source=source,
            metadata={"review_status": metadata["review_status"]},
        )
        print(f"Ingested {source}")


if __name__ == "__main__":
    main()
