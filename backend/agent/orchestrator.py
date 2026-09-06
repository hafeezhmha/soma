from __future__ import annotations

from typing import Any
from backend.models import AgentResponse, Stage, UIAction, Safety
from backend.safety import SAFETY_MESSAGE, imminent_harm
from backend.services.claude import ClaudeService
from backend.rag.retrieve import CuratedRetriever, Retriever


class Orchestrator:
    """Coordinates safety, curated retrieval, and the structured response.

    Safety is intentionally checked first and never delegated to Claude.
    """

    def __init__(self, claude: ClaudeService | None = None, retriever: Retriever | None = None):
        self.claude = claude or ClaudeService()
        self.retriever = retriever or CuratedRetriever()

    def respond(self, *, text: str, stage: Stage, state: dict[str, Any]) -> AgentResponse:
        if imminent_harm(text):
            return AgentResponse(
                message=SAFETY_MESSAGE,
                current_stage=Stage.SAFETY,
                suggested_next_stage=Stage.SAFETY,
                ui_action=UIAction(type="SAFETY_INTERRUPTION"),
                safety=Safety(flagged=True, immediate_support=True),
            )
        context = [r.text for r in self.retriever.retrieve(text, stage=stage.value)]
        return self.claude.respond(text=text, stage=stage, state=state, context=context)

