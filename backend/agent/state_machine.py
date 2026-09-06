"""Allowed state transitions, useful to callers and tests."""

from __future__ import annotations

from backend.models import Stage

TRANSITIONS: dict[Stage, set[Stage]] = {
    Stage.CHECK_IN: {Stage.BODY_LOCATION, Stage.SAFETY},
    Stage.BODY_LOCATION: {Stage.BODY_SENSATION, Stage.INTENSITY, Stage.REGULATION, Stage.SAFETY},
    Stage.BODY_SENSATION: {Stage.INTENSITY, Stage.REGULATION, Stage.SAFETY},
    Stage.INTENSITY: {Stage.REGULATION, Stage.SAFETY},
    Stage.REGULATION: {Stage.REGULATION, Stage.RECHECK, Stage.SAFETY},
    Stage.RECHECK: {Stage.IFS_EXPLORATION, Stage.SAFETY},
    Stage.IFS_EXPLORATION: {Stage.REFLECTION, Stage.SAFETY},
    Stage.REFLECTION: {Stage.COMPLETE, Stage.SAFETY},
    Stage.SAFETY: {Stage.SAFETY},
    Stage.COMPLETE: {Stage.COMPLETE},
}


def can_transition(current: Stage, target: Stage) -> bool:
    return target in TRANSITIONS.get(current, set())

