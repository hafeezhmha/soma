"""Anonymous profile token handling."""

from __future__ import annotations

import hashlib
import hmac
import secrets


def new_profile_token() -> str:
    # 256 bits of entropy; only its digest is persisted.
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_matches(token: str, digest: str) -> bool:
    return hmac.compare_digest(token_digest(token), digest)

