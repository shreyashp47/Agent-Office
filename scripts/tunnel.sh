#!/usr/bin/env bash
# Agent Office — one-command public access via a Cloudflare quick tunnel.
#
# Usage:
#   ./scripts/tunnel.sh            # expose http://127.0.0.1:4099
#   ./scripts/tunnel.sh 8080       # expose another port
#   PORT=8080 ./scripts/tunnel.sh
#
# Prints a shareable https://…trycloudflare.com URL. Requires cloudflared:
#   brew install cloudflared        (macOS)
#   see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
set -euo pipefail

PORT="${1:-${PORT:-4099}}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "error: cloudflared not found. Install it first:" >&2
  echo "  macOS:  brew install cloudflared" >&2
  echo "  other:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

echo "[agent-office] exposing http://127.0.0.1:${PORT} via Cloudflare quick tunnel…"
echo "[agent-office] share the trycloudflare.com URL that cloudflared prints below."
exec cloudflared tunnel --url "http://127.0.0.1:${PORT}"
