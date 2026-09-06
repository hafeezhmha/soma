#!/usr/bin/env bash

set -euo pipefail

api_url="http://127.0.0.1:8000"

if ! curl --fail --silent --show-error --max-time 5 "${api_url}/health" >/dev/null; then
  echo "SOMA backend is not reachable at ${api_url}. Start it first:" >&2
  echo "  docker compose up -d --build" >&2
  echo "or: .venv/bin/python scripts/run_backend.py" >&2
  exit 1
fi

if command -v cloudflared >/dev/null 2>&1; then
  echo "Starting Cloudflare Tunnel for ${api_url}. Keep this process running."
  exec cloudflared tunnel --url "${api_url}"
fi

if command -v ngrok >/dev/null 2>&1; then
  echo "Starting ngrok for ${api_url}. Keep this process running."
  exec ngrok http 8000
fi

cat >&2 <<'EOF'
No tunnel client was found.

Install one manually, then run this script again:
  brew install cloudflared
  # or install ngrok from https://ngrok.com/download
EOF
exit 1
