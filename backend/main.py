"""FastAPI HTTP API for the SOMA MVP."""

from __future__ import annotations

import os
import secrets
import uuid
from typing import Any

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from backend.agent.orchestrator import Orchestrator
from backend.agent.state_machine import can_transition
from backend.database import Database, now_iso, json_dumps
from backend.models import (
    AgentResponse, BodyMarkRequest, CompleteRequest, ConfirmPartRequest,
    CreateSessionRequest, ExplorationRequest, HealthResponse, MessageRequest,
    ProfileResponse, ProfileView, ProfileUpdateRequest, RegulationRequest, RecheckRequest, Stage, UIAction, Safety,
)
from backend.security import new_profile_token, token_digest
from backend.safety import SAFETY_MESSAGE, imminent_harm
from backend.services.elevenlabs import ElevenLabsService
from backend.rag.retrieve import ActianRetriever, LocalSentenceEmbedder
from backend.rate_limit import RateLimiter
from ifs_assistant import ActianKnowledgeStore

MAX_AUDIO_BYTES = 10 * 1024 * 1024


def _id() -> str:
    return str(uuid.uuid4())


def _origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    return [item.strip() for item in raw.split(",") if item.strip()]


def _profile_from_request(request: Request, body_token: str | None = None) -> str:
    token = body_token or request.headers.get("X-Profile-Token")
    auth = request.headers.get("Authorization", "")
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        raise HTTPException(401, "A profile token is required")
    digest = token_digest(token)
    row = request.app.state.db.one("SELECT id FROM profiles WHERE token_hash = ? AND deleted_at IS NULL", (digest,))
    if not row:
        raise HTTPException(401, "Invalid profile token")
    return str(row["id"])


def _session(request: Request, session_id: str, profile_id: str | None = None):
    row = request.app.state.db.one("SELECT * FROM sessions WHERE id = ?", (session_id,))
    if not row or (profile_id is not None and row["profile_id"] != profile_id):
        raise HTTPException(404, "Session not found")
    return row


def _state(row: Any) -> dict[str, Any]:
    return dict(row)


def _response_with_stage(response: AgentResponse, stage: Stage) -> AgentResponse:
    return response.model_copy(update={"current_stage": stage})


def _session_payload(request: Request, row: Any) -> dict[str, Any]:
    db: Database = request.app.state.db
    messages = db.all("SELECT role, text, created_at FROM messages WHERE session_id = ? ORDER BY created_at", (row["id"],))
    return {
        "id": row["id"], "session_id": row["id"], "stage": row["stage"],
        "initial_statement": row["initial_statement"], "emotion": row["emotion"],
        "body": {"region": row["body_region"], "x": row["body_x"], "y": row["body_y"], "spread": row["body_spread"], "sensation": row["sensation"], "intensity_before": row["intensity_before"], "intensity_after": row["intensity_after"]},
        "regulation": {"technique": row["regulation_technique"], "completed": bool(row["regulation_completed"])},
        "exploration": {"concern": row["concern"], "protective_intention": row["protective_intention"], "possible_need": row["possible_need"]},
        "safety": {"flagged": bool(row["safety_flagged"])},
        "completed_at": row["completed_at"], "transcript_removed": bool(row["transcript_removed"]),
        "transcript": [dict(message) for message in messages],
    }


def _record_message(db: Database, session_id: str, role: str, text: str) -> None:
    db.execute("INSERT INTO messages (id, session_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)", (_id(), session_id, role, text, now_iso()))


def _safety_interruption(db: Database, session_id: str, text: str) -> AgentResponse | None:
    """Apply the same deterministic gate to structured free-text routes."""
    if not imminent_harm(text):
        return None
    recorded_at = now_iso()
    response = AgentResponse(
        message=SAFETY_MESSAGE,
        current_stage=Stage.SAFETY,
        suggested_next_stage=Stage.SAFETY,
        ui_action=UIAction(type="SAFETY_INTERRUPTION"),
        safety=Safety(flagged=True, immediate_support=True),
    )
    db.execute_transaction([
        ("INSERT INTO messages (id, session_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)", (_id(), session_id, "user", text, recorded_at)),
        ("INSERT INTO messages (id, session_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)", (_id(), session_id, "assistant", SAFETY_MESSAGE, recorded_at)),
        ("UPDATE sessions SET stage = ?, safety_flagged = 1 WHERE id = ?", (Stage.SAFETY.value, session_id)),
    ])
    return response


def _default_orchestrator() -> Orchestrator:
    if os.getenv("RAG_ENABLED", "true").lower() in {"0", "false", "no"}:
        return Orchestrator()
    store = ActianKnowledgeStore(
        url=os.getenv("VECTORAI_URL", "localhost:6574"),
        dimensions=int(os.getenv("VECTORAI_DIMENSIONS", "384")),
    )
    return Orchestrator(
        retriever=ActianRetriever(store, embed=LocalSentenceEmbedder())
    )


def create_app(database: Database | None = None, orchestrator: Orchestrator | None = None) -> FastAPI:
    app = FastAPI(title="SOMA API", version="0.1.0")
    app.state.db = database or Database()
    app.state.db.initialize()
    app.state.orchestrator = orchestrator or _default_orchestrator()
    app.state.speech = ElevenLabsService(os.getenv("ELEVENLABS_API_KEY"), os.getenv("ELEVENLABS_VOICE_ID"), base_url=os.getenv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io"))
    app.state.profile_limiter = RateLimiter(limit=10, window_seconds=3600)
    app.state.voice_limiter = RateLimiter(limit=30, window_seconds=60)
    app.add_middleware(CORSMiddleware, allow_origins=_origins(), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.post("/profiles", response_model=ProfileResponse, status_code=201)
    def create_profile(request: Request) -> ProfileResponse:
        client_key = request.client.host if request.client else "unknown"
        if not app.state.profile_limiter.allow(client_key):
            raise HTTPException(429, "Too many profiles created. Try again later")
        token = new_profile_token()
        profile_id = _id()
        display_name = f"Guest {secrets.randbelow(1000):03d}"
        app.state.db.execute("INSERT INTO profiles (id, token_hash, created_at, display_name) VALUES (?, ?, ?, ?)", (profile_id, token_digest(token), now_iso(), display_name))
        return ProfileResponse(profile_id=profile_id, profile_token=token, display_name=display_name)

    @app.get("/profiles/me", response_model=ProfileView)
    def get_my_profile(request: Request) -> ProfileView:
        profile_id = _profile_from_request(request)
        row = app.state.db.one("SELECT id, display_name FROM profiles WHERE id = ?", (profile_id,))
        # The token is intentionally not recoverable; callers use the token
        # they already hold and receive it only during profile creation.
        return ProfileView(profile_id=profile_id, display_name=row["display_name"])

    @app.patch("/profiles/me")
    def update_my_profile(request: Request, payload: ProfileUpdateRequest) -> dict[str, Any]:
        profile_id = _profile_from_request(request)
        display_name = payload.display_name.strip()
        if not display_name:
            raise HTTPException(422, "display_name cannot be blank")
        app.state.db.execute("UPDATE profiles SET display_name = ? WHERE id = ?", (display_name, profile_id))
        return {"profile_id": profile_id, "display_name": display_name}

    @app.delete("/profiles/me")
    def delete_my_data(request: Request, profile_token: str | None = None) -> dict[str, bool]:
        profile_id = _profile_from_request(request, profile_token)
        app.state.db.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
        return {"deleted": True}

    @app.post("/sessions", status_code=201)
    def create_session(request: Request, payload: CreateSessionRequest) -> dict[str, Any]:
        profile_id = _profile_from_request(request, payload.profile_token)
        session_id = _id()
        app.state.db.execute("INSERT INTO sessions (id, profile_id, stage, created_at) VALUES (?, ?, ?, ?)", (session_id, profile_id, Stage.CHECK_IN.value, now_iso()))
        return {"session_id": session_id, "id": session_id, "stage": Stage.CHECK_IN.value}

    @app.get("/sessions/{session_id}")
    def get_session(request: Request, session_id: str) -> dict[str, Any]:
        profile_id = _profile_from_request(request)
        return _session_payload(request, _session(request, session_id, profile_id))

    @app.delete("/sessions/{session_id}")
    def cancel_session(request: Request, session_id: str) -> dict[str, bool]:
        profile_id = _profile_from_request(request)
        _session(request, session_id, profile_id)
        app.state.db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        return {"deleted": True}

    @app.post("/sessions/{session_id}/messages", response_model=AgentResponse)
    def send_message(request: Request, session_id: str, payload: MessageRequest) -> AgentResponse:
        profile_id = _profile_from_request(request)
        row = _session(request, session_id, profile_id)
        if row["stage"] in (Stage.COMPLETE.value, Stage.SAFETY.value):
            raise HTTPException(409, "This session is no longer accepting messages")
        db: Database = app.state.db
        _record_message(db, session_id, "user", payload.text)
        old_stage = Stage(row["stage"])
        result = app.state.orchestrator.respond(text=payload.text, stage=old_stage, state=_state(row))
        if result.safety.flagged:
            db.execute("UPDATE sessions SET stage = ?, safety_flagged = 1 WHERE id = ?", (Stage.SAFETY.value, session_id))
            _record_message(db, session_id, "assistant", result.message)
            return result
        next_stage = old_stage
        if payload.advance_stage:
            next_stage = result.suggested_next_stage or old_stage
            if next_stage == Stage.COMPLETE:
                # Only /complete may finish a session because it also removes the
                # raw transcript as part of one atomic transaction.
                next_stage = old_stage
                result = result.model_copy(update={"suggested_next_stage": old_stage})
            if next_stage != old_stage and not can_transition(old_stage, next_stage):
                next_stage = old_stage
                result = result.model_copy(update={"suggested_next_stage": old_stage})
        else:
            result = result.model_copy(update={"suggested_next_stage": old_stage, "ui_action": None})
        # A free-form message after a structured UI action should not skip the
        # body-map fields; the dedicated endpoints own those transitions.
        if payload.advance_stage and old_stage == Stage.CHECK_IN and next_stage != old_stage:
            db.execute("UPDATE sessions SET stage = ?, initial_statement = ? WHERE id = ?", (next_stage.value, payload.text, session_id))
        else:
            db.execute("UPDATE sessions SET stage = ? WHERE id = ?", (next_stage.value, session_id))
        _record_message(db, session_id, "assistant", result.message)
        return _response_with_stage(result, next_stage)

    @app.post("/sessions/{session_id}/body", response_model=AgentResponse)
    def set_body(request: Request, session_id: str, payload: BodyMarkRequest) -> AgentResponse:
        profile_id = _profile_from_request(request)
        row = _session(request, session_id, profile_id)
        allowed = {Stage.BODY_LOCATION.value, Stage.BODY_SENSATION.value, Stage.INTENSITY.value}
        if row["stage"] not in allowed:
            raise HTTPException(409, "Body details are not expected at this stage")
        db: Database = app.state.db
        target = Stage.BODY_SENSATION if not payload.sensation else (Stage.INTENSITY if payload.intensity is None else Stage.REGULATION)
        db.execute("UPDATE sessions SET stage = ?, body_region = ?, body_x = ?, body_y = ?, body_spread = ?, sensation = COALESCE(?, sensation), intensity_before = COALESCE(?, intensity_before) WHERE id = ?", (target.value, payload.region, payload.x, payload.y, payload.spread, payload.sensation, payload.intensity, session_id))
        prompts = {Stage.BODY_SENSATION: "What does it feel like there?", Stage.INTENSITY: "How strong is that sensation right now, from 1 to 10?", Stage.REGULATION: "Let's make a little room around it with a gentle grounding exercise."}
        actions = {Stage.BODY_SENSATION: "SHOW_SENSATION_PICKER", Stage.INTENSITY: "SHOW_INTENSITY", Stage.REGULATION: "SHOW_REGULATION"}
        message = prompts[target]
        if target == Stage.REGULATION:
            query = (
                f"Stage: REGULATION. Sensation: {payload.sensation}. "
                f"Body region: {payload.region}. Intensity: {payload.intensity}/10. "
                "Need one low-risk, optional regulation exercise."
            )
            guidance = app.state.orchestrator.retriever.retrieve(
                query, stage=Stage.REGULATION.value, limit=1
            )
            if guidance:
                message = guidance[0].text
        result = AgentResponse(message=message, current_stage=target, suggested_next_stage=target, ui_action=UIAction(type=actions[target]), observations={"body": payload.model_dump()}, retrieval_needed=target == Stage.REGULATION)
        return result

    @app.post("/sessions/{session_id}/regulation", response_model=AgentResponse)
    def set_regulation(request: Request, session_id: str, payload: RegulationRequest) -> AgentResponse:
        profile_id = _profile_from_request(request)
        row = _session(request, session_id, profile_id)
        if row["stage"] != Stage.REGULATION.value:
            raise HTTPException(409, "Regulation is not expected at this stage")
        target = Stage.RECHECK if payload.completed else Stage.REGULATION
        app.state.db.execute("UPDATE sessions SET stage = ?, regulation_technique = ?, regulation_completed = ? WHERE id = ?", (target.value, payload.technique, int(payload.completed), session_id))
        return AgentResponse(message="Notice your body again. How strong is the sensation now, from 1 to 10?" if payload.completed else "Take the time you need with this practice.", current_stage=target, suggested_next_stage=target, ui_action=UIAction(type="SHOW_RECHECK" if payload.completed else "SHOW_REGULATION"))

    @app.post("/sessions/{session_id}/recheck", response_model=AgentResponse)
    def recheck(request: Request, session_id: str, payload: RecheckRequest) -> AgentResponse:
        profile_id = _profile_from_request(request)
        row = _session(request, session_id, profile_id)
        if row["stage"] != Stage.RECHECK.value:
            raise HTTPException(409, "A recheck is not expected at this stage")
        app.state.db.execute("UPDATE sessions SET stage = ?, intensity_after = ? WHERE id = ?", (Stage.IFS_EXPLORATION.value, payload.intensity, session_id))
        return AgentResponse(message="If it feels okay, could we get curious about the part of you connected to this sensation?", current_stage=Stage.IFS_EXPLORATION, suggested_next_stage=Stage.IFS_EXPLORATION, ui_action=UIAction(type="SHOW_EXPLORATION"), observations={"intensity_after": payload.intensity})

    @app.post("/sessions/{session_id}/exploration", response_model=AgentResponse)
    def exploration(request: Request, session_id: str, payload: ExplorationRequest) -> AgentResponse:
        profile_id = _profile_from_request(request)
        row = _session(request, session_id, profile_id)
        if row["stage"] != Stage.IFS_EXPLORATION.value:
            raise HTTPException(409, "Exploration is not expected at this stage")
        safety = _safety_interruption(
            app.state.db,
            session_id,
            " ".join(filter(None, (payload.concern, payload.protective_intention, payload.possible_need))),
        )
        if safety:
            return safety
        app.state.db.execute("UPDATE sessions SET stage = ?, concern = ?, protective_intention = ?, possible_need = ? WHERE id = ?", (Stage.REFLECTION.value, payload.concern, payload.protective_intention, payload.possible_need, session_id))
        return AgentResponse(message="Thank you for noticing this with care. What would you like to remember from today?", current_stage=Stage.REFLECTION, suggested_next_stage=Stage.REFLECTION, ui_action=UIAction(type="SHOW_REFLECTION"))

    @app.post("/sessions/{session_id}/parts")
    def confirm_part(request: Request, session_id: str, payload: ConfirmPartRequest) -> dict[str, Any]:
        profile_id = _profile_from_request(request)
        row = _session(request, session_id, profile_id)
        if row["stage"] != Stage.REFLECTION.value:
            raise HTTPException(409, "Part names can be confirmed during reflection")
        db: Database = app.state.db
        free_text = " ".join([payload.name, *(item.value for item in payload.attributes)])
        safety = _safety_interruption(db, session_id, free_text)
        if safety:
            return safety.model_dump(mode="json")
        part = db.one("SELECT * FROM parts WHERE profile_id = ? AND lower(name) = lower(?)", (profile_id, payload.name.strip()))
        part_id = str(part["id"]) if part else _id()
        if not part:
            db.execute("INSERT INTO parts (id, profile_id, name, created_at) VALUES (?, ?, ?, ?)", (part_id, profile_id, payload.name.strip(), now_iso()))
        existing_activation = db.one("SELECT id FROM activations WHERE session_id = ? AND part_id = ?", (session_id, part_id))
        if existing_activation:
            attrs = db.all("SELECT key, value, recorded_at FROM attributes WHERE part_id = ? ORDER BY recorded_at", (part_id,))
            return {"part_id": part_id, "name": part["name"] if part else payload.name.strip(), "attributes": [dict(item) for item in attrs], "activation_id": existing_activation["id"]}
        for attr in payload.attributes:
            db.execute("INSERT INTO attributes (id, part_id, key, value, recorded_at) VALUES (?, ?, ?, ?, ?)", (_id(), part_id, attr.key.strip(), attr.value.strip(), now_iso()))
        activation_id = _id()
        db.execute("INSERT INTO activations (id, session_id, part_id, body_region, body_x, body_y, body_spread, source_sensation, intensity_before, intensity_after, activated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (activation_id, session_id, part_id, row["body_region"], row["body_x"], row["body_y"], row["body_spread"], row["sensation"], row["intensity_before"], row["intensity_after"], now_iso()))
        attrs = db.all("SELECT key, value, recorded_at FROM attributes WHERE part_id = ? ORDER BY recorded_at", (part_id,))
        return {"part_id": part_id, "name": payload.name.strip(), "attributes": [dict(item) for item in attrs], "activation_id": activation_id}

    @app.post("/sessions/{session_id}/complete")
    def complete(request: Request, session_id: str, payload: CompleteRequest) -> dict[str, Any]:
        profile_id = _profile_from_request(request)
        row = _session(request, session_id, profile_id)
        if row["stage"] != Stage.REFLECTION.value and row["stage"] != Stage.COMPLETE.value:
            raise HTTPException(409, "Complete the reflection before ending this session")
        if row["stage"] == Stage.COMPLETE.value:
            summary = app.state.db.one("SELECT text, data_json FROM summaries WHERE session_id = ?", (session_id,))
            return {"session_id": session_id, "stage": Stage.COMPLETE.value, "summary": summary["text"] if summary else ""}
        db: Database = app.state.db
        summary_text = payload.reflection or "You made space to notice what was happening in your body and approached it with care."
        summary_data = {"reflection": summary_text, "body_region": row["body_region"], "sensation": row["sensation"], "intensity_before": row["intensity_before"], "intensity_after": row["intensity_after"]}
        completed_at = now_iso()
        db.execute_transaction([
            ("INSERT OR REPLACE INTO summaries (session_id, text, data_json, created_at) VALUES (?, ?, ?, ?)", (session_id, summary_text, json_dumps(summary_data), completed_at)),
            ("UPDATE sessions SET stage = ?, completed_at = ?, transcript_removed = 1 WHERE id = ?", (Stage.COMPLETE.value, completed_at, session_id)),
            ("DELETE FROM messages WHERE session_id = ?", (session_id,)),
        ])
        return {"session_id": session_id, "stage": Stage.COMPLETE.value, "summary": summary_text, "data": summary_data}

    @app.get("/dashboard")
    def dashboard(request: Request) -> dict[str, Any]:
        profile_id = _profile_from_request(request)
        db: Database = app.state.db
        parts = db.all("SELECT * FROM parts WHERE profile_id = ? ORDER BY created_at", (profile_id,))
        activations = db.all("SELECT a.*, p.name FROM activations a JOIN parts p ON p.id = a.part_id WHERE p.profile_id = ? ORDER BY a.activated_at", (profile_id,))
        events = []
        for activation in activations:
            event = dict(activation)
            event["date"] = event.get("activated_at")
            event["body_location"] = event.get("body_region")
            event["attributes"] = [dict(a) for a in db.all("SELECT key, value, recorded_at FROM attributes WHERE part_id = ? AND recorded_at <= ? ORDER BY recorded_at", (event["part_id"], event["activated_at"]))]
            events.append(event)
        return {"parts": [{"id": p["id"], "name": p["name"], "created_at": p["created_at"], "attributes": [dict(a) for a in db.all("SELECT key, value, recorded_at FROM attributes WHERE part_id = ? ORDER BY recorded_at", (p["id"],))]} for p in parts], "activations": events}

    @app.get("/parts")
    def list_parts(request: Request) -> list[dict[str, Any]]:
        profile_id = _profile_from_request(request)
        db: Database = app.state.db
        rows = db.all("SELECT * FROM parts WHERE profile_id = ? ORDER BY created_at", (profile_id,))
        result = []
        for part in rows:
            activations = db.all("SELECT * FROM activations WHERE part_id = ? ORDER BY activated_at", (part["id"],))
            attrs = db.all("SELECT key, value, recorded_at FROM attributes WHERE part_id = ? ORDER BY recorded_at", (part["id"],))
            result.append({"id": part["id"], "name": part["name"], "created_at": part["created_at"], "attributes": [dict(a) for a in attrs], "activations": len(activations), "last_seen": activations[-1]["activated_at"] if activations else None})
        return result

    @app.get("/parts/{part_id}")
    def part_detail(request: Request, part_id: str) -> dict[str, Any]:
        profile_id = _profile_from_request(request)
        db: Database = app.state.db
        part = db.one("SELECT * FROM parts WHERE id = ? AND profile_id = ?", (part_id, profile_id))
        if not part:
            raise HTTPException(404, "Part not found")
        events = []
        attrs = [dict(a) for a in db.all("SELECT key, value, recorded_at FROM attributes WHERE part_id = ? ORDER BY recorded_at", (part_id,))]
        for activation in db.all("SELECT * FROM activations WHERE part_id = ? ORDER BY activated_at", (part_id,)):
            event = dict(activation)
            event["date"] = event.get("activated_at")
            event["body_location"] = event.get("body_region")
            event["attributes"] = [a for a in attrs if a["recorded_at"] <= event["activated_at"]]
            events.append(event)
        return {"id": part["id"], "name": part["name"], "created_at": part["created_at"], "attributes": attrs, "activations": events}

    @app.post("/voice/tts")
    def tts(request: Request, payload: MessageRequest) -> Response:
        profile_id = _profile_from_request(request)
        if not app.state.voice_limiter.allow(f"tts:{profile_id}"):
            raise HTTPException(429, "Voice request limit reached. Try again shortly")
        audio = app.state.speech.synthesize(payload.text)
        if audio is None:
            return Response(status_code=204, headers={"X-Speech-Fallback": "text"})
        return Response(content=audio, media_type="audio/mpeg")

    @app.post("/voice/stt")
    async def stt(request: Request, audio: UploadFile = File(...)) -> dict[str, Any]:
        profile_id = _profile_from_request(request)
        if not app.state.voice_limiter.allow(f"stt:{profile_id}"):
            raise HTTPException(429, "Voice request limit reached. Try again shortly")
        data = await audio.read(MAX_AUDIO_BYTES + 1)
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Audio upload exceeds the 10 MB limit")
        text = app.state.speech.transcribe(data, audio.content_type or "audio/wav")
        return {"text": text, "fallback": text is None}

    return app


app = create_app()
