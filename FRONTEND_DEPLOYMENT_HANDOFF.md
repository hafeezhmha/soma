# SOMA frontend deployment handoff

This document is for deploying the SOMA **frontend to Vercel** while the
FastAPI backend and Actian VectorAI run on the developer's local machine.
The result is a public Vercel link that other people can use, as long as the
developer's backend, VectorAI container, computer, and HTTPS tunnel remain
running.

Do not deploy the current `backend/` to Vercel. It uses persistent SQLite and a
local VectorAI service. Vercel hosts the Next.js frontend only.

## 1. Vercel project setup

1. Import the Git repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Keep the detected framework as **Next.js**.
4. Keep the default build settings:
   - Install command: `npm install` (or Vercel's detected npm install)
   - Build command: `npm run build`
   - Output directory: default for Next.js
5. Add this environment variable for **Preview** and **Production**:

   ```text
   NEXT_PUBLIC_API_URL=https://REPLACE_WITH_TUNNEL_URL
   ```

   Use the tunnel's HTTPS origin without a trailing slash. `NEXT_PUBLIC_*`
   values are included at build time, so redeploy after changing this value.

   **Important:** `NEXT_PUBLIC_API_URL` is the public HTTPS **backend tunnel**
   URL. Do not enter `localhost`, and do not enter the Vercel frontend URL in
   this field.

   There is no permanent backend tunnel URL stored in this repository. Generate
   one at runtime with `bash scripts/public-demo-tunnel.sh`, then paste the URL
   it prints into this Vercel variable.

The repository includes `frontend/vercel.json` with Next.js detection and basic
security headers. Do not change the project root to the repository root unless
you also intentionally redesign the monorepo build.

## 2. Start the local backend

Use one backend option only. Running both options will conflict on port 8000.

### Option A — existing Python environment (recommended for this demo)

From the repository root:

```bash
docker compose up -d vectorai
SOMA_RELOAD=false .venv/bin/python scripts/run_backend.py
```

Leave the backend process running. In another terminal, verify it:

```bash
curl -fsS http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

The backend reads provider credentials and other settings from the root `.env`.
Never commit `.env` or paste its values into Vercel logs or this handoff.

### Option B — Docker backend

Use this only when the Docker image has already been built successfully:

```bash
docker compose up -d --build
curl -fsS http://127.0.0.1:8000/health
```

The Compose volumes persist SQLite, VectorAI data, and the embedding cache on
the local machine.

## 3. Expose only FastAPI through HTTPS

A deployed browser cannot call the developer's `localhost`; expose port 8000
through a tunnel. VectorAI must remain private on localhost.

The checked-in helper verifies the API and starts Cloudflare Tunnel when it is
installed, otherwise ngrok:

```bash
bash scripts/public-demo-tunnel.sh
```

If using ngrok for the first time, authenticate it first:

```bash
ngrok config add-authtoken YOUR_NGROK_TOKEN
```

If neither tunnel client is installed, install one manually:

```bash
brew install cloudflared
# or install ngrok from https://ngrok.com/download
```

The tunnel prints a URL such as `https://example.ngrok-free.app`. Confirm the
public health endpoint before deploying the frontend:

```bash
curl -fsS https://REPLACE_WITH_TUNNEL_URL/health
```

## 4. Connect Vercel and local API

1. Set Vercel `NEXT_PUBLIC_API_URL` to the backend tunnel URL. This is the only
   backend URL the frontend needs.
2. Update the root `.env` so `CORS_ORIGINS` contains the exact Vercel origin:

   ```text
   CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://YOUR-APP.vercel.app
   ```

   Include a custom Vercel domain too if one is used. Do not add a trailing
   slash or a path to an origin.

3. Restart the local backend so it reads the new CORS setting.
4. Redeploy the Vercel frontend.

The frontend calls the API directly from the visitor's browser. The browser
therefore needs the exact Vercel origin in backend CORS, and the tunnel needs to
remain online.

## 5. Smoke test from the public link

Open the Vercel URL in an incognito window and verify:

- the SOMA landing screen loads;
- a text check-in creates a profile and session;
- the body map and multi-select sensations work;
- saving a Part appears in **Your parts**;
- voice input works after granting microphone permission;
- voice playback works when ElevenLabs is configured;
- the browser network panel shows successful calls to the tunnel URL, not
  `localhost`.

If the UI loads but shows demo mode, `NEXT_PUBLIC_API_URL` was missing at build
time. If API calls fail with CORS errors, the backend `.env` has the wrong
Vercel origin or the backend was not restarted. If the tunnel URL changed,
update Vercel and redeploy again.

## Important demo limitations

This is a temporary public demo, not a production deployment:

- the developer's computer, Docker/VectorAI, backend, and tunnel must stay
  awake and connected;
- free tunnel URLs can change or disconnect;
- all visitors share the local SQLite database;
- public visitors can consume Anthropic and ElevenLabs credits;
- do not use real sensitive or clinical data;
- do not expose VectorAI ports 6573–6575 publicly.

For a durable deployment, move FastAPI and VectorAI to a persistent host and
use a managed database instead of local SQLite.

## Files Claude should know

- `frontend/` — Next.js application deployed to Vercel
- `frontend/vercel.json` — Vercel project configuration
- `frontend/lib/api.ts` — reads `NEXT_PUBLIC_API_URL` and calls FastAPI
- `backend/` — FastAPI application, kept local for this demo
- `compose.yaml` — local VectorAI/backend services and persistent volumes
- `scripts/public-demo-tunnel.sh` — API check plus tunnel launcher
- `.env` — local secrets and backend configuration; never commit
