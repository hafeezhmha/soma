from backend.agent.state_machine import can_transition
from backend.database import Database
from backend.models import Stage
from backend.rag.retrieve import ActianRetriever, CuratedRetriever
from backend.safety import imminent_harm
from backend.security import new_profile_token, token_digest, token_matches
from backend.services.claude import DeterministicClaude
from backend.services.claude import ClaudeService
from backend.services.elevenlabs import ElevenLabsService
import httpx
import sqlite3
from datetime import datetime, timedelta, timezone


def test_safety_gate_catches_immediate_harm_but_not_ordinary_language():
    assert imminent_harm("I want to kill myself tonight")
    assert imminent_harm("I might hurt someone")
    assert not imminent_harm("I am anxious about my presentation")


def test_state_machine_has_safe_linear_spine():
    assert can_transition(Stage.CHECK_IN, Stage.BODY_LOCATION)
    assert can_transition(Stage.RECHECK, Stage.IFS_EXPLORATION)
    assert not can_transition(Stage.CHECK_IN, Stage.COMPLETE)


def test_sqlite_schema_and_cascade_data_deletion():
    db = Database(":memory:")
    db.initialize()
    db.execute("INSERT INTO profiles (id, token_hash, created_at, display_name, deleted_at) VALUES ('p', 'digest', 'now', 'Guest 000', NULL)")
    db.execute("INSERT INTO sessions (id, profile_id, stage, created_at) VALUES ('s', 'p', 'CHECK_IN', 'now')")
    db.execute("INSERT INTO messages VALUES ('m', 's', 'user', 'hello', 'now')")
    db.execute("DELETE FROM profiles WHERE id = 'p'")
    assert db.one("SELECT * FROM messages WHERE id = 'm'") is None


def test_abandoned_transcript_cleanup_expires_only_unfinished_sessions():
    db = Database(":memory:")
    db.initialize()
    now = datetime.now(timezone.utc)
    old = (now - timedelta(hours=25)).isoformat()
    fresh = (now - timedelta(hours=1)).isoformat()
    db.execute("INSERT INTO profiles (id, token_hash, created_at, display_name) VALUES ('p', 'digest', ?, 'Guest 000')", (old,))
    db.execute("INSERT INTO sessions (id, profile_id, stage, created_at) VALUES ('old', 'p', 'CHECK_IN', ?), ('fresh', 'p', 'CHECK_IN', ?), ('done', 'p', 'COMPLETE', ?)", (old, fresh, old))
    db.execute("INSERT INTO messages VALUES ('m-old', 'old', 'user', 'private old text', ?), ('m-fresh', 'fresh', 'user', 'private fresh text', ?), ('m-done', 'done', 'user', 'completed text', ?)", (old, fresh, old))
    assert db.cleanup_expired_sessions(now=now) == 1
    expired = db.one("SELECT stage, transcript_removed, initial_statement FROM sessions WHERE id = 'old'")
    assert expired and expired["stage"] == "EXPIRED" and expired["transcript_removed"] == 1 and expired["initial_statement"] is None
    assert db.one("SELECT * FROM messages WHERE id = 'm-old'") is None
    assert db.one("SELECT * FROM messages WHERE id = 'm-fresh'") is not None
    assert db.one("SELECT * FROM messages WHERE id = 'm-done'") is not None


def test_actian_retriever_does_not_send_plaintext_without_embedder():
    class Adapter:
        def search(self, **kwargs):
            raise AssertionError("should use safe fallback")

    result = ActianRetriever(Adapter()).retrieve("sensitive words", stage="REGULATION")
    assert result == CuratedRetriever().retrieve("", stage="REGULATION")


def test_profile_tokens_are_high_entropy_and_only_digest_matches():
    token = new_profile_token()
    assert len(token) >= 40
    digest = token_digest(token)
    assert token_matches(token, digest)
    assert not token_matches(token + "x", digest)


def test_deterministic_claude_returns_structured_response():
    result = DeterministicClaude().respond(text="hello", stage=Stage.CHECK_IN, state={}, context=[])
    assert result.current_stage is Stage.CHECK_IN
    assert result.suggested_next_stage is Stage.BODY_LOCATION
    assert result.ui_action and result.ui_action.type == "SHOW_BODY_MAP"


def test_claude_http_structured_response_and_provider_failure_fallback():
    seen_messages = []
    def handler(request):
        seen_messages.extend(__import__("json").loads(request.content)["messages"])
        return httpx.Response(200, json={"content": [{"type": "text", "text": '{"message":"hello","current_stage":"CHECK_IN","suggested_next_stage":"BODY_LOCATION","ui_action":{"type":"SHOW_BODY_MAP","payload":{}},"observations":{},"retrieval_needed":false,"safety":{"flagged":false,"immediate_support":false}}'}]})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = ClaudeService(api_key="test-key", http_client=client).respond(text="hi", stage=Stage.CHECK_IN, state={"conversation_history": [{"role": "user", "text": "earlier"}, {"role": "assistant", "text": "I hear you"}]}, context=[])
    assert result.message == "hello"
    assert [(message["role"], message["content"]) for message in seen_messages[:2]] == [("user", "earlier"), ("assistant", "I hear you")]
    assert seen_messages[-1]["role"] == "user" and '"text": "hi"' in seen_messages[-1]["content"]
    failing = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(503)))
    fallback = ClaudeService(api_key="test-key", http_client=failing).respond(text="hi", stage=Stage.CHECK_IN, state={}, context=[])
    assert fallback.ui_action and fallback.ui_action.type == "SHOW_BODY_MAP"


def test_elevenlabs_http_tts_and_stt():
    seen = []

    def handler(request):
        seen.append(request)
        if request.url.path.endswith("speech-to-text"):
            return httpx.Response(200, json={"text": "transcribed"})
        return httpx.Response(200, content=b"audio")

    service = ElevenLabsService("key", "voice", http_client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert service.synthesize("Hello. Stay here.") == b"audio"
    assert service.transcribe(b"wav") == "transcribed"
    assert len(seen) == 2
    tts_payload = __import__("json").loads(seen[0].content)
    assert tts_payload["model_id"] == "eleven_v3"
    assert tts_payload["text"].startswith("[whispers, breathy, very softly, close to the mic]")
    assert "......\n\n" in tts_payload["text"]
    assert tts_payload["voice_settings"] == {
        "stability": 1.0,
        "similarity_boost": 0.9,
        "style": 0.05,
        "use_speaker_boost": True,
    }


def test_schema_migrates_old_profiles_table(tmp_path):
    path = tmp_path / "old.sqlite3"
    conn = sqlite3.connect(path)
    conn.executescript("CREATE TABLE profiles (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, deleted_at TEXT); CREATE TABLE sessions (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, stage TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE parts (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE attributes (id TEXT PRIMARY KEY, part_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, recorded_at TEXT NOT NULL); CREATE TABLE activations (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, part_id TEXT NOT NULL, activated_at TEXT NOT NULL); CREATE TABLE summaries (session_id TEXT PRIMARY KEY, text TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);")
    conn.commit()
    conn.close()
    db = Database(path)
    db.initialize()
    columns = {row["name"] for row in db.all("PRAGMA table_info(profiles)")}
    assert "display_name" in columns


def test_actian_retriever_selects_stage_collection_and_maps_match():
    calls = []

    class Match:
        content = "approved grounding"
        source = "grounding.md"
        score = 0.91

    class Adapter:
        def search(self, **kwargs):
            calls.append(kwargs)
            return [Match()]

    result = ActianRetriever(Adapter(), embed=lambda text: [0.1, 0.2]).retrieve("query", stage="REGULATION")
    assert result[0].text == "approved grounding"
    assert result[0].source == "grounding.md"
    assert calls[0]["collection"] == "regulation"
    assert calls[0]["stage"] == "REGULATION"
    assert calls[0]["risk"] == "low"
