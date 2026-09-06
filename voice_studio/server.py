#!/usr/bin/env python3
"""Tiny ElevenLabs speech app: text-to-speech and speech-to-text. Stdlib only.

Reads ELEVENLABS_API_KEY from .env (same folder) and proxies requests to the
ElevenLabs API so the key never reaches the browser.
"""
import errno
import json
import re
import os
import secrets
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API = "https://api.elevenlabs.io/v1"
PORT = int(os.environ.get("PORT", "8055"))


def load_env():
    # A studio-specific file can override the shared SOMA configuration.
    # The repository root .env is used automatically when no override exists.
    for env in (ROOT / ".env", ROOT.parent / ".env"):
        if not env.exists():
            continue
        for line in env.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def api_key():
    return os.environ.get("ELEVENLABS_API_KEY", "").strip()


def preferred_voice_id():
    return os.environ.get("ELEVENLABS_VOICE_ID", "").strip()


def preferred_first(voices):
    preferred = preferred_voice_id()
    if not preferred:
        return voices
    return sorted(voices, key=lambda voice: voice.get("id") != preferred)


def call(path, payload=None, method="GET"):
    """Call ElevenLabs. Returns (status, content_type, body_bytes)."""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("xi-api-key", api_key())
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, "application/json", e.read()
    except urllib.error.URLError as e:
        return 502, "application/json", json.dumps({"detail": str(e.reason)}).encode()

MAX_UPLOAD = 100 * 1024 * 1024  # 100 MB


def call_multipart(path, fields, filename, filetype, filedata):
    """POST a multipart/form-data body to ElevenLabs (stdlib has no builder)."""
    boundary = "----ellabs" + secrets.token_hex(16)
    sep = f"--{boundary}\r\n".encode()
    body = bytearray()
    for name, value in fields.items():
        body += sep
        body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        body += f"{value}\r\n".encode()
    body += sep
    body += (
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {filetype}\r\n\r\n"
    ).encode()
    body += filedata + b"\r\n"
    body += f"--{boundary}--\r\n".encode()

    req = urllib.request.Request(f"{API}{path}", data=bytes(body), method="POST")
    req.add_header("xi-api-key", api_key())
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except urllib.error.URLError as e:
        return 502, json.dumps({"detail": str(e.reason)}).encode()


# ElevenLabs premade voices — used when the API key lacks the `voices_read`
# permission (a scoped key can still synthesize speech, it just can't list).
PREMADE = [
    {"id": "9BWtsMINqrJLrRacOk9x", "name": "Aria", "labels": {"gender": "female", "accent": "american"}},
    {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "labels": {"gender": "female", "accent": "american"}},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "soft": True, "labels": {"gender": "female", "accent": "american"}},
    {"id": "FGY2WhTYpPnrIDTdsKH5", "name": "Laura", "soft": True, "labels": {"gender": "female", "accent": "american"}},
    {"id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte", "soft": True, "labels": {"gender": "female", "accent": "swedish"}},
    {"id": "Xb7hH8MSUJpSbSDYk0k2", "name": "Alice", "soft": True, "labels": {"gender": "female", "accent": "british"}},
    {"id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda", "soft": True, "labels": {"gender": "female", "accent": "american"}},
    {"id": "cgSgspJ2msm6clMCkdW9", "name": "Jessica", "labels": {"gender": "female", "accent": "american"}},
    {"id": "pFZP5JQG7iQjIQuC4Bku", "name": "Lily", "soft": True, "labels": {"gender": "female", "accent": "british"}},
    {"id": "CwhRBWXzGAHq8TQ4Fs17", "name": "Roger", "labels": {"gender": "male", "accent": "american"}},
    {"id": "IKne3meq5aSn9XLyUdCD", "name": "Charlie", "labels": {"gender": "male", "accent": "australian"}},
    {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "George", "soft": True, "labels": {"gender": "male", "accent": "british"}},
    {"id": "N2lVS1w4EtoT3dr4eOWO", "name": "Callum", "labels": {"gender": "male", "accent": "transatlantic"}},
    {"id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Liam", "labels": {"gender": "male", "accent": "american"}},
    {"id": "bIHbv24MWmeRgasZH58o", "name": "Will", "labels": {"gender": "male", "accent": "american"}},
    {"id": "cjVigY5qzO86Huf0OWal", "name": "Eric", "labels": {"gender": "male", "accent": "american"}},
    {"id": "iP95p4xoKVk53GoZ742B", "name": "Chris", "labels": {"gender": "male", "accent": "american"}},
    {"id": "nPczCjzI2devNBz1zQrb", "name": "Brian", "soft": True, "labels": {"gender": "male", "accent": "american"}},
    {"id": "onwK4e9ZLuTAKqWW03F9", "name": "Daniel", "soft": True, "labels": {"gender": "male", "accent": "british"}},
    {"id": "pqHfZKP75CvOlQylNhV4", "name": "Bill", "soft": True, "labels": {"gender": "male", "accent": "american"}},
]


# eleven_v3 understands inline audio tags like "[whispers]". Every other model
# would read them out loud, so they get stripped for non-v3 requests.
TAG_RE = re.compile(r"\[[^\]]{1,40}\]")
V3_STABILITY = (0.0, 0.5, 1.0)  # v3 only accepts these three


def clamp(v, lo, hi, default):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return default


SENT_END = re.compile(r"([.!?])\s+")


def add_pauses(text, level):
    """Slow the read down. v3 paces off punctuation, so ellipses buy breathing
    room between sentences - the single biggest ASMR lever after the tags."""
    if level <= 0:
        return text
    gap = "..." if level == 1 else "......"
    joiner = f"\\1{gap} " if level == 1 else f"\\1{gap}\n\n"
    return SENT_END.sub(joiner, text)


def build_tts(req):
    """Turn a request from the browser into an ElevenLabs TTS payload."""
    model = req.get("model_id") or "eleven_v3"
    text = (req.get("text") or "").strip()
    tag = (req.get("tag") or "").strip()

    text = add_pauses(text, int(clamp(req.get("pauses", 1), 0, 2, 1)))
    if model == "eleven_v3":
        if tag and not text.startswith("["):
            text = f"{tag} {text}"
    else:
        text = TAG_RE.sub("", text).strip()

    stability = clamp(req.get("stability", 0.5), 0.0, 1.0, 0.5)
    if model == "eleven_v3":
        stability = min(V3_STABILITY, key=lambda v: abs(v - stability))

    settings = {
        "stability": stability,
        "similarity_boost": clamp(req.get("similarity", 0.75), 0.0, 1.0, 0.75),
        "style": clamp(req.get("style", 0.0), 0.0, 1.0, 0.0),
        "use_speaker_boost": bool(req.get("speaker_boost", True)),
    }
    # v3 sets pace through tags and punctuation, not a speed knob.
    if model != "eleven_v3":
        settings["speed"] = clamp(req.get("speed", 1.0), 0.7, 1.2, 1.0)

    return text, {"text": text, "model_id": model, "voice_settings": settings}



class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")

    def send(self, status, ctype, body):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def json(self, status, obj):
        self.send(status, "application/json", json.dumps(obj).encode())

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.send(200, "text/html; charset=utf-8", (ROOT / "index.html").read_bytes())
        elif self.path.startswith("/voices"):
            if not api_key():
                return self.json(500, {"detail": "ELEVENLABS_API_KEY missing from .env"})
            status, _, body = call("/voices")
            if status == 200:
                voices = [
                    {"id": v["voice_id"], "name": v["name"], "labels": v.get("labels", {})}
                    for v in json.loads(body).get("voices", [])
                ]
                if voices:
                    return self.json(200, {"voices": preferred_first(voices), "source": "account"})
            # Scoped keys can synthesize without being allowed to list voices.
            show_all = self.path.endswith("all=1")
            voices = PREMADE if show_all else [v for v in PREMADE if v.get("soft")]
            self.json(200, {"voices": preferred_first(voices), "source": "builtin"})
        else:
            self.json(404, {"detail": "not found"})

    def do_POST(self):
        if self.path == "/stt":
            return self.transcribe()
        if self.path != "/tts":
            return self.json(404, {"detail": "not found"})
        if not api_key():
            return self.json(500, {"detail": "ELEVENLABS_API_KEY missing from .env"})
        length = int(self.headers.get("Content-Length") or 0)
        try:
            req = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self.json(400, {"detail": "invalid JSON"})

        voice = req.get("voice_id") or ""
        if not (req.get("text") or "").strip():
            return self.json(400, {"detail": "text is required"})
        if not voice:
            return self.json(400, {"detail": "voice_id is required"})

        text, payload = build_tts(req)
        if not text:
            return self.json(400, {"detail": "nothing left to speak after removing tags"})
        status, ctype, body = call(f"/text-to-speech/{voice}", payload, method="POST")
        self.send(status, ctype or "audio/mpeg", body)

    def transcribe(self):
        """Speech to text. Body is the raw audio; metadata rides in headers."""
        if not api_key():
            return self.json(500, {"detail": "ELEVENLABS_API_KEY missing from .env"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return self.json(400, {"detail": "no audio uploaded"})
        if length > MAX_UPLOAD:
            return self.json(413, {"detail": f"file too large (max {MAX_UPLOAD // 1048576} MB)"})

        audio = self.rfile.read(length)
        filename = self.headers.get("X-Filename") or "audio.webm"
        filetype = self.headers.get("X-Audio-Type") or "application/octet-stream"

        fields = {
            "model_id": self.headers.get("X-Model") or "scribe_v1",
            "diarize": "true" if self.headers.get("X-Diarize") == "1" else "false",
            "tag_audio_events": "true",
        }
        lang = (self.headers.get("X-Language") or "").strip()
        if lang:
            fields["language_code"] = lang

        status, body = call_multipart("/speech-to-text", fields, filename, filetype, audio)
        self.send(status, "application/json", body)


if __name__ == "__main__":
    load_env()
    if not api_key():
        print("!! No ELEVENLABS_API_KEY found. Put it in .env (see .env.example).")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as e:
        if e.errno == errno.EADDRINUSE:
            print(f"Port {PORT} is already in use - the app is probably already running.")
            print(f"Open http://localhost:{PORT}, or start on another port: PORT=8056 python3 server.py")
            raise SystemExit(1)
        raise
    print(f"ElevenLabs TTS running at http://localhost:{PORT}  (ctrl-c to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
