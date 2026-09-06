from __future__ import annotations

import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "voice_studio" / "server.py"
SPEC = importlib.util.spec_from_file_location("voice_studio_server", MODULE_PATH)
assert SPEC and SPEC.loader
studio = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(studio)


def test_load_env_falls_back_to_soma_root(tmp_path, monkeypatch):
    studio_dir = tmp_path / "voice_studio"
    studio_dir.mkdir()
    (tmp_path / ".env").write_text(
        "ELEVENLABS_API_KEY=test-key\nELEVENLABS_VOICE_ID=preferred\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(studio, "ROOT", studio_dir)
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.delenv("ELEVENLABS_VOICE_ID", raising=False)

    studio.load_env()

    assert studio.api_key() == "test-key"
    assert studio.preferred_first([{"id": "other"}, {"id": "preferred"}]) == [
        {"id": "preferred"},
        {"id": "other"},
    ]
