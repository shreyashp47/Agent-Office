# Agent Office v0.2.0 — Release Notes

A pixel-art office where your OpenCode agents are characters that walk around,
sit at desks, and show what they're working on — live.

## What's new in v0.2.0

- **Multi-agent office** — run two (or more) OpenCode instances in the same
  office. Every agent gets a name tag, its own sprite, and a fixed desk, and
  moves independently as its state changes.
- **Join keys** — the office is now keyed: `join-keys.json` (auto-created from
  a sample on first run) maps each key to a capacity (`maxAgents`). Wrong key
  → 401, office full → 403. Each joining agent receives a per-agent bearer
  token.
- **Leave & cleanup** — closing an OpenCode instance sends `leave-agent`;
  stale agents are swept and their characters fade out of the scene.
- **"Yesterday's memo" card** — the office reads the latest agent memory log,
  sanitizes it, and shows it as a card.
- **Mobile layout** — on small screens the agent list becomes a bottom sheet;
  tap a character for details.
- **Asset manager sidebar** — swap scenes and sprites from the browser without
  redeploying (password-protected; default password `office`).
- **Public access via Cloudflare Tunnel** — one command, a shareable
  `https://…trycloudflare.com` URL, no account needed.
- **Smoke tests** — `npm run smoke` checks every endpoint end-to-end and runs
  in CI.

## Quick start

```bash
npm install
npm run build
npm start            # office on http://127.0.0.1:4099
```

Join the office from any OpenCode instance:

```bash
npm run install-plugin   # copies the office-sync plugin into the global config
```

The default join key (`ocj_local_01`, capacity 3) is created in
`join-keys.json` on first run — edit it to add keys or change capacity, then
restart the backend.

## Sharing your office

While the backend runs, one command exposes it publicly:

```bash
npm run tunnel    # prints a shareable https://<subdomain>.trycloudflare.com URL
```

Quick tunnels are public by design — for anything sensitive, put a reverse
proxy with basic auth in front (example in `docs/PUBLIC_ACCESS.md`).

## Full changelog

See [CHANGELOG.md](./CHANGELOG.md) for the complete list of changes,
including the M0–M3 foundation (Hono backend, office-sync plugin, pixel
frontend with SSE live updates).