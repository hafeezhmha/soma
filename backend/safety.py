"""Deterministic immediate-harm gate, called before any model or retrieval."""

from __future__ import annotations

import re
import unicodedata

# Deliberately conservative crisis phrases. This is an interruption signal,
# not a diagnosis or risk assessment. A real deployment should add a reviewed
# crisis service and localized emergency resources.
IMMEDIATE_HARM_PATTERNS = (
    r"\bkill myself\b", r"\bsuicid(?:e|al)\b", r"\bend my life\b",
    r"\btake my own life\b", r"\bhurt myself\b", r"\bself[- ]harm\b",
    r"\bwant to die\b", r"\bgoing to die\b", r"\bkill (?:him|her|them|someone)\b",
    r"\bhurt (?:him|her|them|someone)\b", r"\bkill my (?:partner|spouse|child)\b",
    # Explicit means and threats must still interrupt when the model is offline.
    r"\b(?:shoot|stab|strangle|poison|murder)\s+(?:myself|him|her|them|someone|somebody|people|everyone|my\s+(?:partner|spouse|wife|husband|child|kids|boss|friend|mother|father))\b",
    r"\b(?:hang|drown|cut|burn)\s+myself\b",
    r"\b(?:i(?:'m| am)?|i have|i've)\s+(?:just\s+)?(?:overdosed|overdosing)\b",
    r"\b(?:i(?:'m| am)?|i will|i'll)\s+(?:going to\s+|about to\s+|planning to\s+)?(?:overdose|jump off (?:a|the) (?:bridge|roof|building))\b",
    r"\b(?:took|taken|swallowed)\s+(?:too many|a handful of|a bottle of|all (?:of )?my)\s+(?:pills|tablets|medication)\b",
    r"\b(?:took|taken|swallowed)\s+(?:some\s+)?(?:pills|tablets).{0,80}\b(?:may|might|will|want to|going to)\s+take\s+more\b",
    r"\b(?:i can't|i cannot|i can not|can't|cannot)\s+(?:keep myself|stay)\s+safe\b",
    r"\b(?:gun|knife)\s+(?:to|against|at)\s+my\s+(?:head|throat|chest)\b",
)
_compiled = tuple(re.compile(p, re.IGNORECASE) for p in IMMEDIATE_HARM_PATTERNS)


def imminent_harm(text: str) -> bool:
    normalized = unicodedata.normalize("NFKC", text).replace("’", "'")
    normalized = re.sub(r"\s+", " ", normalized)
    return any(pattern.search(normalized) for pattern in _compiled)


SAFETY_MESSAGE = (
    "I’m really sorry you’re facing this. I can’t help with an immediate danger "
    "situation. Please call your local emergency number now, or go to the nearest "
    "emergency department. If you can, move away from anything you could use to "
    "hurt yourself or someone else and contact a trusted person to stay with you."
)
