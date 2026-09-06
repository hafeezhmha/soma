# SOMA

SOMA is a quiet, body-aware web experience for discovering and revisiting
IFS-informed Parts.

The MVP supports a public anonymous-user journey:

1. check in with what is happening;
2. place a sensation on an interactive body map;
3. describe intensity and try an optional regulation exercise;
4. recheck the sensation;
5. approach a possible Part with user-led curiosity and naming;
6. save the Part and review its activation history.

SOMA is an emotional-awareness companion, not therapy, diagnosis, or an
emergency service.

## Architecture

- `frontend/`: Next.js and TypeScript, deployable to Vercel.
- `backend/`: FastAPI and SQLite, intended for one persistent VM in the MVP.
- `src/ifs_assistant/`: Actian VectorAI knowledge-store adapter.
- `knowledge/`: version-controlled demo IFS, somatic, regulation, and safety content.
- `scripts/`: VectorAI health and knowledge-ingestion commands.

Actian stores curated knowledge only. Profiles, Parts, activations, summaries,
and session state live in SQLite. Raw message transcripts are deleted when a
session completes or automatically cleared after 24 hours for an abandoned
session.

## Local development

Start VectorAI:

```bash
docker compose up -d vectorai
```

Install Python dependencies:

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev,rag]'
.venv/bin/pip install -r backend/requirements.txt
```

Initialize and ingest the curated corpus:

```bash
.venv/bin/python scripts/check_vectorai.py
.venv/bin/python scripts/ingest_knowledge.py
```

Copy `.env.example` to `.env`, add provider keys if available, then start the API:

```bash
.venv/bin/python scripts/run_backend.py
```

In another terminal, start the frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Without provider keys, the guided text journey
uses deterministic safe copy. Voice endpoints fall back cleanly when ElevenLabs
is not configured.

### Local Voice Studio

The pulled ElevenLabs Voice Studio automatically reads SOMA's root `.env` and
prefers `ELEVENLABS_VOICE_ID` when it is available in the returned voice list.
It is a local configuration/testing tool and must not be exposed publicly.

```bash
python3 voice_studio/server.py
```

Open <http://localhost:8055> to test TTS voices and STT recordings.

## Docker backend stack

The VM-oriented stack runs FastAPI and VectorAI with persistent volumes:

```bash
cp .env.example .env
docker compose up -d --build
docker compose run --rm backend python scripts/ingest_knowledge.py
```

For a public deployment, place an HTTPS reverse proxy in front of port 8000 and
do not expose VectorAI ports. Set `CORS_ORIGINS` to the exact Vercel frontend URL.
Enforce per-IP rate limits at that trusted proxy or hosting edge. If the proxy
overwrites (never appends) `X-Forwarded-For`, set `TRUST_PROXY_HEADERS=true` so
anonymous profile creation is limited per real visitor rather than per proxy.
The in-process limits are defense in depth and reset when the API restarts.

## Deployment split

### Frontend — Vercel

Import the repository into Vercel, set the root directory to `frontend`, and add:

```text
NEXT_PUBLIC_API_URL=https://api.your-domain.example
```

### Backend and VectorAI — persistent Linux VM

Use a VM with at least 8 GB RAM and 10 GB free disk; 16 GB RAM is preferable.
Install Docker, copy the repository and `.env`, start the Compose stack, ingest
the corpus, and expose only FastAPI through HTTPS.

Actian Community Edition is capped at 5,000 vectors and marked development-only.
The emailed 1-million-vector key is a 30-day trial. This public hackathon demo
must be time-boxed; continued production use requires an appropriate license and
a full privacy, security, backup, retention, and clinical-content review.

## Validation

```bash
.venv/bin/python -m pytest -q backend/tests tests
cd frontend && npm run typecheck && npm test && npm run lint && npm run build
```

Implementation status and validation history are tracked in `progress.md`.
