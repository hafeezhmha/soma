from fastapi.testclient import TestClient

from backend.agent.orchestrator import Orchestrator
from backend.database import Database
from backend.main import create_app


def _client() -> TestClient:
    return TestClient(create_app(Database(":memory:"), Orchestrator()))


def test_complete_public_demo_journey_and_transcript_removal():
    client = _client()
    profile = client.post("/profiles").json()
    headers = {"Authorization": f"Bearer {profile['profile_token']}"}

    assert profile["display_name"].startswith("Guest ")
    renamed = client.patch(
        "/profiles/me", headers=headers, json={"display_name": "Maya"}
    )
    assert renamed.json()["display_name"] == "Maya"

    session_id = client.post("/sessions", headers=headers, json={}).json()["session_id"]
    response = client.post(
        f"/sessions/{session_id}/messages",
        headers=headers,
        json={"text": "I have to present soon and feel overwhelmed."},
    )
    assert response.status_code == 200
    assert response.json()["current_stage"] == "BODY_LOCATION"

    body = {"region": "chest", "x": 0.5, "y": 0.4, "spread": 0.12}
    assert client.post(f"/sessions/{session_id}/body", headers=headers, json=body).json()["current_stage"] == "BODY_SENSATION"
    body["sensation"] = "tight"
    assert client.post(f"/sessions/{session_id}/body", headers=headers, json=body).json()["current_stage"] == "INTENSITY"
    body["intensity"] = 7
    assert client.post(f"/sessions/{session_id}/body", headers=headers, json=body).json()["current_stage"] == "REGULATION"

    assert client.post(
        f"/sessions/{session_id}/regulation",
        headers=headers,
        json={"technique": "grounding", "completed": True},
    ).json()["current_stage"] == "RECHECK"
    assert client.post(
        f"/sessions/{session_id}/recheck",
        headers=headers,
        json={"intensity": 4},
    ).json()["current_stage"] == "IFS_EXPLORATION"
    assert client.post(
        f"/sessions/{session_id}/exploration",
        headers=headers,
        json={"concern": "being judged", "protective_intention": "help me prepare"},
    ).json()["current_stage"] == "REFLECTION"

    part = client.post(
        f"/sessions/{session_id}/parts",
        headers=headers,
        json={"name": "The presenter", "attributes": [{"key": "mood", "value": "watchful"}]},
    )
    assert part.status_code == 200
    # Retrying must not create a duplicate activation.
    assert client.post(
        f"/sessions/{session_id}/parts",
        headers=headers,
        json={"name": "The presenter", "attributes": []},
    ).json()["activation_id"] == part.json()["activation_id"]

    completed = client.post(
        f"/sessions/{session_id}/complete",
        headers=headers,
        json={"reflection": "I can notice this without fighting it."},
    )
    assert completed.json()["stage"] == "COMPLETE"
    session = client.get(f"/sessions/{session_id}", headers=headers).json()
    assert session["transcript_removed"] is True
    assert session["transcript"] == []
    assert client.get("/parts", headers=headers).json()[0]["activations"] == 1

    assert client.delete("/profiles/me", headers=headers).json() == {"deleted": True}
    assert client.get("/parts", headers=headers).status_code == 401


def test_safety_interrupts_before_normal_flow():
    client = _client()
    profile = client.post("/profiles").json()
    headers = {"Authorization": f"Bearer {profile['profile_token']}"}
    session_id = client.post("/sessions", headers=headers, json={}).json()["session_id"]

    response = client.post(
        f"/sessions/{session_id}/messages",
        headers=headers,
        json={"text": "I want to kill myself tonight"},
    )
    assert response.status_code == 200
    assert response.json()["safety"]["flagged"] is True
    assert response.json()["current_stage"] == "SAFETY"
    assert client.post(
        f"/sessions/{session_id}/body",
        headers=headers,
        json={"region": "chest", "x": 0.5, "y": 0.4},
    ).status_code == 409


def test_cancel_session_removes_abandoned_transcript():
    client = _client()
    profile = client.post("/profiles").json()
    headers = {"Authorization": f"Bearer {profile['profile_token']}"}
    session_id = client.post("/sessions", headers=headers, json={}).json()["session_id"]
    client.post(
        f"/sessions/{session_id}/messages",
        headers=headers,
        json={"text": "I feel tense about tomorrow"},
    )

    assert client.delete(f"/sessions/{session_id}", headers=headers).json() == {"deleted": True}
    assert client.get(f"/sessions/{session_id}", headers=headers).status_code == 404


def test_generic_message_cannot_bypass_private_transcript_cleanup():
    database = Database(":memory:")
    client = TestClient(create_app(database, Orchestrator()))
    profile = client.post("/profiles").json()
    headers = {"Authorization": f"Bearer {profile['profile_token']}"}
    session_id = client.post("/sessions", headers=headers, json={}).json()["session_id"]
    database.execute(
        "UPDATE sessions SET stage = ? WHERE id = ?", ("REFLECTION", session_id)
    )

    response = client.post(
        f"/sessions/{session_id}/messages",
        headers=headers,
        json={"text": "That is all for today"},
    )
    assert response.status_code == 200
    assert response.json()["current_stage"] == "REFLECTION"
    session = client.get(f"/sessions/{session_id}", headers=headers).json()
    assert session["stage"] == "REFLECTION"
    assert session["transcript_removed"] is False


def test_public_profile_creation_is_rate_limited():
    client = _client()
    for _ in range(10):
        assert client.post("/profiles").status_code == 201
    assert client.post("/profiles").status_code == 429


def test_voice_endpoints_require_auth_and_reject_oversized_audio():
    client = _client()
    assert client.post("/voice/tts", json={"text": "hello"}).status_code == 401
    profile = client.post("/profiles").json()
    headers = {"Authorization": f"Bearer {profile['profile_token']}"}
    response = client.post(
        "/voice/stt",
        headers=headers,
        files={"audio": ("large.wav", b"0" * (10 * 1024 * 1024 + 1), "audio/wav")},
    )
    assert response.status_code == 413


def test_safety_interrupts_during_exploration_and_blocks_part_creation():
    database = Database(":memory:")
    client = TestClient(create_app(database, Orchestrator()))
    profile = client.post("/profiles").json()
    headers = {"Authorization": f"Bearer {profile['profile_token']}"}
    session_id = client.post("/sessions", headers=headers, json={}).json()["session_id"]
    database.execute(
        "UPDATE sessions SET stage = ? WHERE id = ?", ("IFS_EXPLORATION", session_id)
    )

    response = client.post(
        f"/sessions/{session_id}/exploration",
        headers=headers,
        json={"concern": "I want to kill myself tonight"},
    )
    assert response.status_code == 200
    assert response.json()["safety"] == {"flagged": True, "immediate_support": True}
    session = client.get(f"/sessions/{session_id}", headers=headers).json()
    assert session["stage"] == "SAFETY"
    assert session["safety"]["flagged"] is True
    assert client.post(
        f"/sessions/{session_id}/parts",
        headers=headers,
        json={"name": "A part", "attributes": []},
    ).status_code == 409
