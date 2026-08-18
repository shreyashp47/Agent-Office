# OpenCode Office — Requirements & Issue Plan

A pixel-art office dashboard that visualizes [OpenCode](https://opencode.ai) agents in real time: each agent is a character, each work state is a place in the office. Inspired by Star-Office-UI, built natively for OpenCode.

---

## 1. Project Overview

**One-liner:** A cozy pixel-art office where your OpenCode agents visibly walk around, work at desks, and show what they're doing — driven by OpenCode's plugin hook system.

**Problem it solves:** AI coding agents work invisibly in a terminal. This gives them a physical, glanceable presence — who is working, on what, and whether anything needs your attention.

## 1.6 Implementation Status (M0–M2)

Implemented and verified end-to-end on 2026-08-18 (OpenCode 1.18.18, Node 20):

| Milestone | Status | Notes |
|---|---|---|
| **M0 — Scaffold** | ✅ Done | npm workspaces monorepo (`backend/`, `frontend/`, `plugin/`, `assets/`), strict TS, ESLint, Prettier, MIT license, CI workflow |
| **M1 — Backend** | ✅ Done | Hono app on `:4099` (`PORT` env): `/health`, `/status`, `/events` (SSE), `/set_state`, `/join-agent`, `/agent-push` (rate-limited), `/leave-agent`; atomic `state.json` persistence; 18 passing tests (`npm test`) |
| **M2 — OpenCode plugin** | ✅ Done | `plugin/src/office-sync.ts` auto-discovered from `~/.config/opencode/plugins/` (plural; the singular `plugin/` dir is NOT scanned). Verified live: joins office, `chat.message`→thinking, `tool.execute.before`→writing/researching/executing, `session.idle`→idle, heartbeat every 15s, clean `leave-agent` on dispose |
| **M3 — Frontend** | ⏳ Pending | Pixel office canvas (Issue #11–#14) |
| **M4 — Multi-agent** | ⏳ Pending | (Issue #15–#17) |
| **M5 — Polish** | ⏳ Pending | (Issue #18–#22) |

Implementation learnings (feed back into M3+):
- **Plugin discovery:** OpenCode scans `{plugin,plugins}/*.{ts,js}` in each config directory. Global plugins live in `~/.config/opencode/plugins/`. OpenCode auto-installs `@opencode-ai/plugin` into the config dir on first boot — a plugin imported from it silently fails to load until that install completes (our first test ran too early).
- **Hooks vs events:** `session.idle` / `session.error` / `permission.replied` arrive via the generic `event` hook, not dedicated hooks. `chat.message`, `permission.ask`, `tool.execute.before/after` are real hooks.
- **Install:** `npm run install-plugin` copies the plugin into the global config dir; a restart (or new process) loads it. Every new OpenCode instance creates its own office agent.

**Core differentiator vs. Star-Office-UI:** Star-Office-UI relies on agents voluntarily running `set_state.py`. OpenCode Office hooks directly into OpenCode's plugin events (`tool.execute.before/after`, `session.idle`, `session.error`, `permission.asked`), so state updates are automatic and accurate — no agent cooperation required.

## 1.5 Current State & Migration Path

Existing prototype in this repo (superseded by this plan):

| File | Purpose | Fate |
|---|---|---|
| `index.html` | CSS/DOM status board, polls `status.json` every 3s, 3 states (working/idle/break) | Replaced by Canvas-2D frontend (M3) |
| `server.js` | Zero-dep Node server on :4747; serves page + **tails OpenCode log** via regex; writes `status.json` | Replaced by Hono backend (M1); log-tailing kept only as **fallback** if plugin hooks prove incompatible with a future OpenCode version |

Key migration decisions:
- Primary state source = OpenCode plugin hooks (M2). Log-tailing stays as an optional `WATCHERS`-style fallback for tools without plugin support (e.g. Claude Code).
- Port moves 4747 → 4099 (`PORT` env, M1).
- State file evolves from flat agent list to `state.json` schema in §5.3.

## 2. Goals / Non-Goals

### Goals
- Real-time visualization of one or more OpenCode agents as pixel characters
- Automatic state detection via OpenCode plugin hooks (zero agent-side scripting)
- Multi-agent support: multiple OpenCode instances join one shared office
- Self-hosted, single command to run, works locally and over a tunnel
- MIT-licensed code; original or freely-licensed art assets only

### Non-Goals (v1)
- No agent orchestration (this is a *dashboard*, not a task dispatcher)
- No database server (JSON file / SQLite only)
- No user accounts/auth system (join keys only)
- No mobile app (mobile-responsive web is enough)
- No 3D, no Electron desktop pet (post-v1 candidates)

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js 20+ / TypeScript / Hono | Same language as OpenCode plugins; Hono is tiny and serves static files + SSE |
| State | `state.json` file (atomic writes) | Zero-setup; upgrade path to SQLite later |
| Frontend | Vanilla TS + HTML5 Canvas 2D | No framework needed for a sprite scene; keeps bundle tiny |
| Frontend→Backend | SSE (`GET /events`), fallback to 2s polling | SSE is native in Hono; polling fallback for tunnels |
| OpenCode integration | Plugin at `.opencode/plugin/office-sync.ts` | Official hook API; works in both TUI and `opencode serve` modes |
| Tests | Vitest (backend + state logic) | Fast, TS-native |
| Packaging | `npm create opencode-office` / single `npx` start | DX matters for adoption |

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│ OpenCode instance (TUI or `opencode serve`)             │
│  └─ .opencode/plugin/office-sync.ts                     │
│       hooks: tool.execute.before/after, session.idle,   │
│              session.error, permission.asked            │
└──────────────┬──────────────────────────────────────────┘
               │ POST /agent-push  (debounced, observe-only)
               ▼
┌─────────────────────────────────────────────────────────┐
│ Backend (Hono, port 4099)                               │
│  ├─ REST: /health /status /set_state /agents            │
│  │        /join-agent /agent-push /leave-agent          │
│  ├─ SSE:  /events                                       │
│  ├─ state.json (agents, states, join keys)              │
│  └─ stale sweeper: no heartbeat 60s → idle              │
└──────────────┬──────────────────────────────────────────┘
               │ SSE /events
               ▼
┌─────────────────────────────────────────────────────────┐
│ Frontend (Canvas 2D)                                    │
│  office scene → zones (desk / sofa / server corner /    │
│  door) → characters tween between zones + bubbles       │
└─────────────────────────────────────────────────────────┘
```

## 5. State Model

### 5.1 Agent states

| State | Zone | Trigger (OpenCode event) | Visual |
|---|---|---|---|
| `idle` | Sofa / break area | `session.idle` | Character sits, zzz bubble |
| `writing` | Desk | `tool.execute.before` where tool ∈ {`edit`, `write`, `patch`} | Typing animation |
| `researching` | Desk (alt pose) | tool ∈ {`read`, `grep`, `glob`, `list`, `webfetch`, `websearch`} | Reading animation |
| `executing` | Desk (focused) | tool ∈ {`bash`, `task`} | Terminal glow animation |
| `thinking` | Desk (leaning back) | `message.part.updated` (text streaming, no tool active) | Thought bubble |
| `waiting` | Door / user side | `permission.asked` | ❗ bubble, gentle bounce |
| `error` | Server corner | `session.error` | Red blink, 🔥 on server rack |

### 5.2 State resolution rules
- Most recent event wins, with 250ms debounce to smooth tool-call bursts.
- `permission.asked` → `waiting` until `permission.replied`, then revert to previous state.
- `session.idle` always ends in `idle` regardless of prior state.
- Heartbeat: plugin pings every 15s; backend marks agent `offline` (character leaves) after 120s silence.

### 5.3 Data model

```jsonc
// state.json
{
  "agents": {
    "agent_01": {
      "id": "agent_01",
      "name": "refactor-bot",
      "state": "writing",
      "detail": "editing src/auth.ts",
      "sprite": "char_03",
      "zone": "desk",
      "joinedAt": 1760000000000,
      "lastSeen": 1760000050000
    }
  },
  "joinKeys": { "ocj_team_alpha": { "maxAgents": 3, "agents": ["agent_01"] } }
}
```

## 6. API Specification

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/health` | — | `{ ok: true, version }` |
| GET | `/status` | — | Office-wide snapshot (all agents) |
| GET | `/events` | — | SSE stream of state changes |
| POST | `/join-agent` | `{ key, name, sprite? }` | Join office → `{ agentId, token }` |
| POST | `/agent-push` | `{ agentId, token, state, detail? }` | Update own state |
| POST | `/leave-agent` | `{ agentId, token }` | Leave office |
| POST | `/set_state` | `{ state, detail? }` | Manual override for primary agent (CLI/testing) |
| GET | `/assets/:name` | — | Serve sprite/scene assets |

Notes:
- Per-agent bearer token issued at join; prevents one guest spoofing another.
- Rate limit `/agent-push` to 4 req/s per agent.
- All mutating endpoints validate against the state enum; unknown states → 400.

## 7. OpenCode Plugin Design (`office-sync.ts`)

```ts
// Sketch — final implementation in M2
import type { Plugin } from "@opencode-ai/plugin"

const TOOL_STATE: Record<string, string> = {
  edit: "writing", write: "writing", patch: "writing",
  read: "researching", grep: "researching", glob: "researching",
  webfetch: "researching", websearch: "researching",
  bash: "executing", task: "executing",
}

export const OfficeSync: Plugin = async ({ directory }) => {
  const url = process.env.OFFICE_URL ?? "http://127.0.0.1:4099"
  // join on load, register hooks, debounce, heartbeat
  return {
    "tool.execute.before": async ({ tool }) => { /* push TOOL_STATE[tool] */ },
    "event": async ({ event }) => {
      // session.idle → idle, session.error → error,
      // permission.asked → waiting, permission.replied → revert
    },
  }
}
```

**Rules for the plugin:**
1. **Observe-only.** Never throw, never mutate tool args, never block. A broken dashboard must never break the agent.
2. **Fire-and-forget HTTP** with 2s timeout; swallow network errors.
3. **Debounce** pushes to max 1 per 250ms.
4. Config via env: `OFFICE_URL`, `OFFICE_JOIN_KEY`, `OFFICE_AGENT_NAME`.
5. Install = copy one file to `.opencode/plugin/` (project) or `~/.config/opencode/plugin/` (global).

## 8. Frontend Requirements

- Canvas 2D scene, fixed logical resolution (e.g. 960×540), scaled to viewport, `image-rendering: pixelated`
- Scene: one office with 4 zones (desk area ×2, sofa, server corner, door), static background PNG + furniture sprites
- Character sprites: 4-directional walk cycle (4 frames/dir minimum) + sit + type poses; use **original or properly licensed** pixel art (see §11)
- On state change: character pathfinds (straight-line tween is fine for v1) to target zone, then plays zone animation
- Speech bubble above character showing `detail` text, truncates at 80 chars
- `waiting` state gets visual priority treatment (bounce + color) since it needs human action
- Mobile: scene scales down, sidebar becomes bottom sheet
- Connection indicator: green (SSE live) / amber (polling) / red (disconnected)

## 9. Milestones & GitHub Issues

Each item below is formatted to paste directly into a GitHub issue.

---

### Milestone M0 — Project Setup
**Goal:** Buildable, CI-checked empty repo.

---

**Issue #1 — Scaffold repo with pnpm workspaces**
Labels: `setup`, `M0`
- `backend/`, `frontend/`, `plugin/`, `assets/` packages
- TypeScript strict mode, ESLint + Prettier, Vitest
- **Acceptance criteria:** `pnpm install && pnpm build` succeeds; `pnpm test` runs (even if 0 tests); MIT LICENSE present.

**Issue #2 — GitHub Actions CI**
Labels: `setup`, `ci`, `M0`
- Lint, typecheck, test on PR and push to main
- **Acceptance criteria:** CI badge in README; failing lint blocks merge.

---

### Milestone M1 — Backend Core
**Goal:** `GET /status` returns a manually-set state.

---

**Issue #3 — Hono server with health + static file serving**
Labels: `backend`, `M1`
- GET `/health`; serves `frontend/dist` at `/`; port from `PORT` env, default 4099
- **Acceptance criteria:** `curl localhost:4099/health` → `{ ok: true }`; index.html loads.

**Issue #4 — State store with atomic JSON persistence**
Labels: `backend`, `M1`
- `StateStore` class: in-memory map + debounced atomic write (tmp file + rename) to `state.json`
- CRUD for agents; state enum validation
- **Acceptance criteria:** unit tests cover set/get/validation; state survives server restart.

**Issue #5 — POST /set_state + GET /status**
Labels: `backend`, `api`, `M1`
- Manual state override for primary agent; snapshot endpoint
- **Acceptance criteria:** curl round-trip works; invalid state → 400 with error message.

**Issue #6 — Stale-state sweeper**
Labels: `backend`, `M1`
- Interval job: agent silent > 60s → `idle`; > 120s → `offline` (removed from scene)
- **Acceptance criteria:** unit test with fake timers; log line on transition.

---

### Milestone M2 — OpenCode Plugin
**Goal:** Running OpenCode with the plugin drives the backend automatically.

---

**Issue #7 — Plugin skeleton + join on load**
Labels: `plugin`, `M2`
- `office-sync.ts`: reads env config, POSTs `/join-agent`, stores token, starts 15s heartbeat
- **Acceptance criteria:** starting OpenCode with plugin → agent appears in `GET /status` as `idle`.

**Issue #8 — Tool-event → state mapping**
Labels: `plugin`, `M2`
- `tool.execute.before` maps tool name → state (see §5.1), pushes with debounce (250ms) and fire-and-forget HTTP (2s timeout, errors swallowed)
- **Acceptance criteria:** running an edit in OpenCode flips `GET /status` to `writing`; killing the backend mid-run never hangs or errors OpenCode.

**Issue #9 — Session & permission events**
Labels: `plugin`, `M2`
- `session.idle` → `idle`; `session.error` → `error`; `permission.asked` → `waiting`; `permission.replied` → revert
- **Acceptance criteria:** end-to-end: idle TUI shows sofa; a permission prompt flips state to `waiting`.

**Issue #10 — Plugin README + install script**
Labels: `plugin`, `docs`, `M2`
- `npx opencode-office install-plugin` copies file to `.opencode/plugin/` or global config
- **Acceptance criteria:** fresh project can be wired up in ≤ 2 commands from README alone.

---

### Milestone M3 — Frontend Pixel Office
**Goal:** Open the page, see characters move when states change.

---

**Issue #11 — Canvas scene renderer**
Labels: `frontend`, `M3`
- Fixed 960×540 logical canvas, pixelated scaling, background + furniture layers, zone definitions in a JSON layout file
- **Acceptance criteria:** scene renders at any window size without blur; zones verifiable via debug overlay flag.

**Issue #12 — Character sprite system**
Labels: `frontend`, `assets`, `M3`
- Sprite-sheet loader; walk (4-dir × 4-frame), sit, type animations; sprite registry
- **Acceptance criteria:** a test character idles and walks between two points; adding a new sprite = dropping a sheet + JSON entry.

**Issue #13 — State → zone movement + speech bubbles**
Labels: `frontend`, `M3`
- On snapshot/poll update: tween character to zone, play zone animation, show `detail` bubble (80 char cap)
- **Acceptance criteria:** `POST /set_state` is reflected on screen within 2s (polling) with visible movement, no teleport flicker.

**Issue #14 — SSE live updates with polling fallback**
Labels: `frontend`, `backend`, `M3`
- `GET /events` SSE on backend; frontend uses SSE, falls back to 2s polling on failure; connection indicator dot
- **Acceptance criteria:** state change appears in < 300ms over SSE; killing SSE endpoint degrades gracefully to polling.

---

### Milestone M4 — Multi-Agent
**Goal:** Two OpenCode instances share one office.

---

**Issue #15 — Join keys**
Labels: `backend`, `M4`
- `join-keys.json` (auto-created from sample on first run); key → maxAgents; `/join-agent` enforces limits and issues per-agent token
- **Acceptance criteria:** exceeding maxAgents → 403; wrong key → 401.

**Issue #16 — Multi-agent frontend rendering**
Labels: `frontend`, `M4`
- N characters in scene; name tag under each; deterministic sprite + desk assignment (hash of agentId)
- **Acceptance criteria:** 3 agents visible simultaneously, each moving independently per its own state.

**Issue #17 — Agent leave / offline cleanup**
Labels: `backend`, `frontend`, `M4`
- `/leave-agent`; offline agents fade out after sweeper marks them
- **Acceptance criteria:** killing one OpenCode instance → its character walks off screen within ~2 min.

---

### Milestone M5 — Polish (post-v1, prioritize later)

**Issue #18 — "Yesterday's memo" card** — read latest `memory/*.md`-style log, sanitize, show as card. Labels: `feature`, `M5`

**Issue #19 — Public access guide + Cloudflare Tunnel script** — one command, shareable URL. Labels: `docs`, `devops`, `M5`

**Issue #20 — Mobile layout pass** — bottom-sheet agent list, tap character for detail. Labels: `frontend`, `ux`, `M5`

**Issue #21 — Asset manager sidebar** — password-protected panel to swap scenes/sprites without redeploy. Labels: `feature`, `M5`

**Issue #22 — Smoke test script** — `scripts/smoke_test.ts` hitting all endpoints, CI-integrated. Labels: `testing`, `M5`

## 10. Security Requirements

- Join keys and per-agent tokens are the only auth — no PII, no accounts
- Bearer token required on all mutating agent endpoints
- `detail` text sanitized/escaped before rendering (no HTML injection via bubbles)
- Rate limits: 4 req/s per agent on push endpoints
- Backend binds to `127.0.0.1` by default; `--host 0.0.0.0` must print a warning
- If `OPENCODE_SERVER_PASSWORD`-style basic auth is needed for public exposure, document it via reverse proxy, not in-app

## 11. Art Asset Requirements

⚠️ **Do not copy Star-Office-UI's assets** — its art is non-commercial-only, and LimeZu packs have their own license terms.

- Option A: commission/create original 32×32 or 48×48 pixel sprites (recommended for long-term MIT cleanliness)
- Option B: use CC0 packs (e.g. Kenney.nl) as placeholders, replace before v1.0
- Asset manifest: `assets/manifest.json` mapping sprite IDs → sheets, frame counts, attribution
- Attribution page in README for every third-party asset

## 12. Success Metrics (v1)

- `npx opencode-office` → working office in < 60 seconds
- Plugin install → first automatic state change visible in < 2 minutes
- State latency (tool call → character moves): < 1s local
- Plugin overhead: zero measurable slowdown of OpenCode tool execution (observe-only, fire-and-forget)
- 2+ simultaneous agents on one office without visual glitches

## 13. Risks & Open Questions

| Risk | Mitigation |
|---|---|
| OpenCode plugin event names/payloads change across versions | Pin tested OpenCode version in README; integration test in CI against latest; wrap all event access in try/catch |
| SSE through Cloudflare Tunnel buffers | Polling fallback already planned (Issue #14) |
| Art assets are the schedule risk, not the code | Start asset search/commission in M0, use CC0 placeholders |
| `message.part.updated` fires too often for `thinking` state | Heuristic: only set `thinking` if no tool ran in last 2s; tune in M2 dogfooding |
| Multi-instance OpenCode on one machine (same plugin file) | Agent identity = `OFFICE_AGENT_NAME` + project directory hash |
