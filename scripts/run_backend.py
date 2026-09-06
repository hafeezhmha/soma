"""Run the SOMA API locally with values loaded from the repository .env."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn


ROOT = Path(__file__).resolve().parents[1]


def load_env(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


if __name__ == "__main__":
    load_env()
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    reload = os.getenv("SOMA_RELOAD", "true").lower() in {"1", "true", "yes"}
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=reload)
