"""Claude structured-output boundary.

The MVP defaults to deterministic copy so local demos and tests never depend on
network credentials. A Claude adapter can implement ``ClaudeClient`` and be
injected into ``Orchestrator`` when ANTHROPIC_API_KEY-backed integration is
configured by the application.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Protocol
import httpx
from backend.models import AgentResponse, Stage, UIAction


class ClaudeClient(Protocol):
    def respond(self, *, text: str, stage: Stage, state: dict[str, Any], context: list[str]) -> AgentResponse: ...


class DeterministicClaude:
    def respond(self, *, text: str, stage: Stage, state: dict[str, Any], context: list[str]) -> AgentResponse:
        prompts = {
            Stage.CHECK_IN: "Okay. We don't need to solve everything yet. Where do you notice that feeling most strongly in your body?",
            Stage.BODY_LOCATION: "What does it feel like there?",
            Stage.BODY_SENSATION: "How strong is that sensation right now, from 1 to 10?",
            Stage.INTENSITY: "Let's make a little room around it with a gentle grounding exercise.",
            Stage.REGULATION: "Notice your body again. How strong is the sensation now, from 1 to 10?",
            Stage.RECHECK: "If it feels okay, could we get curious about the part of you connected to this sensation?",
            Stage.IFS_EXPLORATION: "What does this part seem worried might happen?",
            Stage.REFLECTION: "Thank you for noticing this with care. What would you like to remember from today?",
        }
        next_stage = {
            Stage.CHECK_IN: Stage.BODY_LOCATION,
            Stage.BODY_LOCATION: Stage.BODY_SENSATION,
            Stage.BODY_SENSATION: Stage.INTENSITY,
            Stage.INTENSITY: Stage.REGULATION,
            Stage.REGULATION: Stage.RECHECK,
            Stage.RECHECK: Stage.IFS_EXPLORATION,
            Stage.IFS_EXPLORATION: Stage.REFLECTION,
            Stage.REFLECTION: Stage.COMPLETE,
        }.get(stage)
        action = UIAction(type={Stage.CHECK_IN: "SHOW_BODY_MAP", Stage.BODY_LOCATION: "SHOW_BODY_MAP", Stage.BODY_SENSATION: "SHOW_SENSATION_PICKER", Stage.INTENSITY: "SHOW_INTENSITY", Stage.REGULATION: "SHOW_REGULATION", Stage.RECHECK: "SHOW_RECHECK"}.get(stage, "NONE"))
        return AgentResponse(message=prompts.get(stage, "Let's notice what is here, gently."), current_stage=stage, suggested_next_stage=next_stage, ui_action=action)


class ClaudeService(DeterministicClaude):
    """Anthropic Messages API facade with strict local fallback.

    The model is asked for JSON, then validated through the same Pydantic
    ``AgentResponse`` contract exposed to the frontend. Any timeout, provider
    error, malformed JSON, or schema mismatch returns deterministic copy.
    """

    def __init__(self, api_key: str | None = None, client: ClaudeClient | None = None, http_client: httpx.Client | None = None, model: str | None = None, base_url: str = "https://api.anthropic.com"):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.client = client
        self.http_client = http_client
        self.model = model or os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
        self.base_url = base_url.rstrip("/")

    def respond(self, **kwargs: Any) -> AgentResponse:
        if self.client is not None:
            try:
                result = self.client.respond(**kwargs)
                return AgentResponse.model_validate(result)
            except Exception:
                return super().respond(**kwargs)
        if self.api_key:
            try:
                return self._respond_remote(**kwargs)
            except Exception:
                pass
        return super().respond(**kwargs)

    def _respond_remote(self, *, text: str, stage: Stage, state: dict[str, Any], context: list[str]) -> AgentResponse:
        system = (
            "You are SOMA, an emotional awareness companion. Return ONLY valid JSON "
            "matching this schema: {message:string,current_stage:string,suggested_next_stage:string|null,"
            "ui_action:{type:string,payload:object}|null,observations:object,retrieval_needed:boolean,"
            "safety:{flagged:boolean,immediate_support:boolean}}. Never diagnose, invent causes, or invent exercises."
        )
        user = json.dumps({"text": text, "stage": stage.value, "state": state, "curated_context": context}, ensure_ascii=False)
        owns_client = self.http_client is None
        client = self.http_client or httpx.Client(timeout=httpx.Timeout(15.0, connect=5.0))
        try:
            response = client.post(
                f"{self.base_url}/v1/messages",
                headers={"x-api-key": self.api_key or "", "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": self.model, "max_tokens": 500, "temperature": 0, "system": system, "messages": [{"role": "user", "content": user}]},
            )
            response.raise_for_status()
            body = response.json()
            blocks = body.get("content") or []
            raw = next(str(block.get("text", "")) for block in blocks if block.get("type") == "text")
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
            return AgentResponse.model_validate(json.loads(raw))
        finally:
            if owns_client:
                client.close()
