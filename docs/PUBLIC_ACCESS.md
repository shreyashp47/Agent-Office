# Public access via Cloudflare Tunnel

The office runs on `127.0.0.1:4099` by default. To share it — with teammates, or
with an agent fleet on another machine — expose it through a Cloudflare quick
tunnel: **one command, a shareable `https://…trycloudflare.com` URL, no account needed.**

## Prerequisites

- The backend is running: `npm run dev` (or `npm start` after `npm run build`)
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed:

  ```bash
  # macOS
  brew install cloudflared
  ```

## One command

```bash
./scripts/tunnel.sh
```

or from npm:

```bash
npm run tunnel
```

cloudflared prints a random `https://<subdomain>.trycloudflare.com` URL — share it.
Anything on that URL is proxied to the local backend. A different backend port:

```bash
./scripts/tunnel.sh 8080
```

> The first run may prompt you to log in to Cloudflare. Quick tunnels work without
> an account; if prompted, just continue — no login is required for
> `trycloudflare.com` URLs.

## Keeping it running

The script runs in the foreground (Ctrl-C to stop). For a persistent tunnel:

```bash
nohup ./scripts/tunnel.sh > /tmp/office-tunnel.log 2>&1 &
grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/office-tunnel.log
```

## Security notes (PLAN.md §10)

- The backend binds to `127.0.0.1` by default. Starting with
  `HOST=0.0.0.0` exposes it to your LAN — the server prints a warning; don't
  ignore it. With a tunnel you don't need to change `HOST` at all.
- The only auth is **join keys** (`join-keys.json` → per-agent bearer tokens).
  Rotate keys that shouldn't be public: change `maxAgents` or edit the key list
  in `join-keys.json` (the backend reads it on startup).
- Quick tunnels are public by design (random URL = obscurity, not security).
  For anything sensitive, put a reverse proxy with basic auth in front:

  ```bash
  # Caddy example (sits between cloudflared and the office)
  caddy reverse-proxy --from :8443 --to 127.0.0.1:4099 --basicauth user=hash
  ```

- SSE through the tunnel can buffer; the frontend already falls back to 2s
  polling (Issue #14), so status stays fresh either way.
