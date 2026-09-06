"""Typed API and domain models."""

from __future__ import annotations

from enum import Enum
from typing import Any
from pydantic import BaseModel, Field, ConfigDict


class Stage(str, Enum):
    CHECK_IN = "CHECK_IN"
    BODY_LOCATION = "BODY_LOCATION"
    BODY_SENSATION = "BODY_SENSATION"
    INTENSITY = "INTENSITY"
    REGULATION = "REGULATION"
    RECHECK = "RECHECK"
    IFS_EXPLORATION = "IFS_EXPLORATION"
    REFLECTION = "REFLECTION"
    SAFETY = "SAFETY"
    COMPLETE = "COMPLETE"


class UIAction(BaseModel):
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class Safety(BaseModel):
    flagged: bool = False
    immediate_support: bool = False


class AgentResponse(BaseModel):
    message: str
    current_stage: Stage
    suggested_next_stage: Stage | None = None
    ui_action: UIAction | None = None
    observations: dict[str, Any] = Field(default_factory=dict)
    retrieval_needed: bool = False
    safety: Safety = Field(default_factory=Safety)


class ProfileResponse(BaseModel):
    profile_id: str
    profile_token: str
    display_name: str = ""


class ProfileView(BaseModel):
    profile_id: str
    display_name: str


class ProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)


class CreateSessionRequest(BaseModel):
    profile_token: str | None = None


class MessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=12000)


class BodyMarkRequest(BaseModel):
    region: str = Field(min_length=1, max_length=80)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    spread: float = Field(default=0.08, ge=0, le=1)
    sensation: str | None = Field(default=None, max_length=120)
    intensity: int | None = Field(default=None, ge=1, le=10)


class RegulationRequest(BaseModel):
    technique: str = Field(min_length=1, max_length=120)
    completed: bool = True


class RecheckRequest(BaseModel):
    intensity: int = Field(ge=1, le=10)


class ExplorationRequest(BaseModel):
    concern: str | None = Field(default=None, max_length=2000)
    protective_intention: str | None = Field(default=None, max_length=2000)
    possible_need: str | None = Field(default=None, max_length=2000)


class PartAttribute(BaseModel):
    key: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=2000)


class ConfirmPartRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    attributes: list[PartAttribute] = Field(default_factory=list, max_length=20)


class CompleteRequest(BaseModel):
    reflection: str | None = Field(default=None, max_length=5000)


class HealthResponse(BaseModel):
    status: str
