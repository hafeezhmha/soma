from pathlib import Path

from scripts.run_backend import load_env


def test_run_backend_loads_dotenv_without_overwriting_process_env(tmp_path, monkeypatch):
    env_file = Path(tmp_path) / ".env"
    env_file.write_text("FIRST=from-file\nSECOND='quoted value'\n", encoding="utf-8")
    monkeypatch.delenv("FIRST", raising=False)
    monkeypatch.setenv("SECOND", "from-process")

    load_env(env_file)

    assert __import__("os").environ["FIRST"] == "from-file"
    assert __import__("os").environ["SECOND"] == "from-process"
