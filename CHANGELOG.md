# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Issue numbers refer to PLAN.md §9.

## [Unreleased]

### Added

- **Single-command start** (`npx opencode-office`): zero-dependency CLI that builds if needed and serves the office on one port (`--port`, `--host`, `--open` flags; `$PORT`/`$HOST` honored). Backend honors `OFFICE_ROOT` so it runs from any install location.

## [0.2.0] — 2026-08-19

### Added

- **M4 — Multi-agent office** (#16): several agents rendered simultaneously, each with a name tag and a deterministic sprite + desk assignment (hash of agent ID).
- **M4 — Join keys** (#15): `join-keys.json` auto-created from a sample on first run; per-key `maxAgents` capacity enforced by `/join-agent` (wrong key → 401, office full → 403); per-agent bearer tokens.
- **M4 — Leave / offline cleanup** (#17): `POST /leave-agent` plus a sweeper that marks stale agents offline; characters fade out of the scene.
- **M5 — "Yesterday's memo" card** (#18): the frontend reads the latest agent memory log, sanitizes it, and shows it as a card.
- **M5 — Public access guide + Cloudflare Tunnel script** (#19): `scripts/tunnel.sh` / `npm run tunnel` — one command produces a shareable `https://…trycloudflare.com` URL; see `docs/PUBLIC_ACCESS.md`.
- **M5 — Mobile layout pass** (#20): bottom-sheet agent list on small screens, tap a character for detail.
- **M5 — Asset manager sidebar** (#21): password-protected panel to swap scenes and sprites at runtime without redeploying (default password `office`, overrides persisted in `localStorage`).
- **M5 — Smoke test script** (#22): `scripts/smoke_test.ts` / `npm run smoke` exercises every endpoint end-to-end and is wired into CI.

## [0.1.0] — 2026-08-18

### Added

- **M0 — Scaffold** (base): npm-workspaces monorepo (`backend/`, `frontend/`, `plugin/`, `assets/`), strict TypeScript, ESLint, Prettier, MIT license, CI workflow.
- **M1 — Backend** (base): Hono app on `:4099` (`PORT` env) — `/health`, `/status`, `/events` (SSE), `/set_state`, `/join-agent`, `/agent-push` (rate-limited), `/leave-agent`; atomic `state.json` persistence.
- **M2 — OpenCode plugin** (base): `plugin/src/office-sync.ts` auto-joins the office and maps OpenCode events to character states — `chat.message` → thinking, `tool.execute.before` → writing/researching/executing, `session.idle` → idle, heartbeat every 15 s, clean `leave-agent` on dispose.
- **M3 — Pixel office frontend** (#11–#14): Canvas-2D scene renderer (960×540, zone layout JSON, debug overlay), character sprite system with walk/sit/type animations, state→zone movement with speech bubbles, and SSE live updates with a 2 s polling fallback + connection indicator.