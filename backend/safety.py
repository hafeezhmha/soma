"""Deterministic immediate-harm gate, called before any model or retrieval."""

from __future__ import annotations

import re

# Deliberately conservative crisis phrases. This is an interruption signal,
# not a diagnosis or risk assessment. A real deployment should add a reviewed
# crisis service and localized emergency resources.
IMMEDIATE_HARM_PATTERNS = (
    r"\bkill myself\b", r"\bsuicid(?:e|al)\b", r"\bend my life\b",
    r"\btake my own life\b", r"\bhurt myself\b", r"\bself[- ]harm\b",
    r"\bwant to die\b", r"\bgoing to die\b", r"\bkill (?:him|her|them|someone)\b",
    r"\bhurt (?:him|her|them|someone)\b", r"\bkill my (?:partner|spouse|child)\b",
)
_compiled = tuple(re.compile(p, re.IGNORECASE) for p in IMMEDIATE_HARM_PATTERNS)


def imminent_harm(text: str) -> bool:
    return any(pattern.search(text) for pattern in _compiled)


SAFETY_MESSAGE = (
    "I’m really sorry you’re facing this. I can’t help with an immediate danger "
    "situation. Please call your local emergency number now, or go to the nearest "
    "emergency department. If you can, move away from anything you could use to "
    "hurt yourself or someone else and contact a trusted person to stay with you."
)

