"""ElevenLabs STT/TTS interfaces with credential-free text fallback."""

from __future__ import annotations

import os
import re
from typing import Protocol
import httpx


class SpeechService(Protocol):
    def synthesize(self, text: str) -> bytes | None: ...
    def transcribe(self, audio: bytes, content_type: str = "audio/wav") -> str | None: ...


class ElevenLabsService:
    def __init__(self, api_key: str | None = None, voice_id: str | None = None, http_client: httpx.Client | None = None, base_url: str = "https://api.elevenlabs.io"):
        self.api_key = api_key or os.getenv("ELEVENLABS_API_KEY")
        self.voice_id = voice_id or os.getenv("ELEVENLABS_VOICE_ID")
        self.http_client = http_client
        self.base_url = base_url.rstrip("/")
        self.model_id = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_v3")
        self.stt_model_id = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v1")
        self.tone_tag = os.getenv("ELEVENLABS_TONE_TAG", "[whispers, breathy, very softly, close to the mic]").strip()
        self.pause_level = int(os.getenv("ELEVENLABS_PAUSES", "2"))
        self.voice_settings = {
            "stability": float(os.getenv("ELEVENLABS_STABILITY", "1.0")),
            "similarity_boost": float(os.getenv("ELEVENLABS_SIMILARITY", "0.90")),
            "style": float(os.getenv("ELEVENLABS_STYLE", "0.05")),
            "use_speaker_boost": True,
        }

    def _delivery_text(self, text: str) -> str:
        if self.pause_level > 0:
            gap = "..." if self.pause_level == 1 else "......\n\n"
            text = re.sub(r"([.!?])\s+", rf"\1{gap} ", text.strip())
        if self.model_id == "eleven_v3" and self.tone_tag and not text.startswith("["):
            text = f"{self.tone_tag} {text}"
        return text

    def synthesize(self, text: str) -> bytes | None:
        if not self.api_key or not self.voice_id:
            return None
        owns_client = self.http_client is None
        client = self.http_client or httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0))
        try:
            response = client.post(
                f"{self.base_url}/v1/text-to-speech/{self.voice_id}",
                headers={"xi-api-key": self.api_key, "accept": "audio/mpeg", "content-type": "application/json"},
                json={
                    "text": self._delivery_text(text),
                    "model_id": self.model_id,
                    "voice_settings": self.voice_settings,
                },
            )
            response.raise_for_status()
            return response.content
        except (httpx.HTTPError, ValueError):
            return None
        finally:
            if owns_client:
                client.close()

    def transcribe(self, audio: bytes, content_type: str = "audio/wav") -> str | None:
        if not self.api_key:
            return None
        owns_client = self.http_client is None
        client = self.http_client or httpx.Client(timeout=httpx.Timeout(30.0, connect=5.0))
        try:
            response = client.post(
                f"{self.base_url}/v1/speech-to-text",
                headers={"xi-api-key": self.api_key},
                files={"file": ("audio", audio, content_type)},
                data={"model_id": self.stt_model_id},
            )
            response.raise_for_status()
            text = response.json().get("text")
            return str(text).strip() if text else None
        except (httpx.HTTPError, ValueError, TypeError):
            return None
        finally:
            if owns_client:
                client.close()
