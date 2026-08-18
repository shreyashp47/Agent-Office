# Agent Office — Architecture

> **Note:** Frontend (M3) is in progress — see [board.md](../board.md) for current status. This doc describes the implemented backend (M1–M2) and planned frontend.

---

## 1. System Overview

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
│ Frontend (Canvas 2D) — M3 IN PROGRESS                   │
│  office scene → zones (desk / sofa / server corner /    │
│  door) → characters tween between zones + bubbles       │
└─────────────────────────────────────────────────────────┘
```

**Core differentiator:** Unlike Star-Office-UI (which requires agents to run `set_state.py`), OpenCode Office hooks directly into OpenCode's plugin events — state updates are automatic and accurate, zero agent cooperation required.

---

## 2. Backend (M1 — Done)

### Tech
- Node.js 20+, TypeScript, Hono
- Port from `PORT` env, default 4099
- Atomic JSON persistence (`state.json`) via tmp-file + rename
- Vitest for unit tests (18 passing)

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | — | `{ ok: true, version }` |
| GET | `/status` | — | Office-wide snapshot (all agents) |
| GET | `/events` | — | SSE stream of state changes |
| POST | `/join-agent` | join key | Join office → `{ agentId, token }` |
| POST | `/agent-push` | bearer token | Update own state (rate-limited 4 req/s) |
| POST | `/leave-agent` | bearer token | Leave office |
| POST | `/set_state` | — | Manual override for primary agent |
| GET | `/assets/:name` | — | Serve sprite/scene assets |

### State store (`backend/src/store.ts`)

- `StateStore` class: in-memory map + debounced atomic write (250ms)
- CRUD for agents with state enum validation
- Join key management: `joinAgent` enforces `maxAgents`, issues per-agent bearer token
- `sweep()`: agent silent > 60s → `idle`; > 120s → `offline` (removed)

### Stale sweeper (`backend/src/sweeper.ts`)

- Runs every 1s (configurable)
- Transitions logged: `[sweeper] agent_xyz: idle (65000ms silent)`

### Join keys (`backend/src/join-keys.ts`)

- `join-keys.json` auto-created from sample on first run
- Key → `maxAgents`; `/join-agent` enforces limits (401 invalid, 403 at capacity)
- Backend reads on startup; `syncJoinKeys()` reconciles config

---

## 3. State Model (PLAN.md §5)

### Agent states

| State | Zone | Trigger (OpenCode event) | Visual |
|-------|------|--------------------------|--------|
| `idle` | sofa | `session.idle` | Sits, zzz bubble |
| `writing` | desk | `tool.execute.before` ∈ {`edit`, `write`, `patch`} | Typing animation |
| `researching` | desk | tool ∈ {`read`, `grep`, `glob`, `list`, `webfetch`, `websearch`} | Reading animation |
| `executing` | desk | tool ∈ {`bash`, `task`} | Terminal glow |
| `thinking` | desk | `message.part.updated` (text streaming, no tool) | Thought bubble |
| `waiting` | door | `permission.asked` | ❗ bubble, gentle bounce |
| `error` | server corner | `session.error` | Red blink, 🔥 on server rack |

### Resolution rules

- Most recent event wins, 250ms debounce
- `permission.asked` → `waiting` until `permission.replied`, then revert
- `session.idle` always ends in `idle`
- Heartbeat: plugin pings every 15s; backend marks `offline` after 120s silence

### Data model (`state.json`)

```jsonc
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

---

## 4. OpenCode Plugin Design (M2 — Done)

**File:** `plugin/src/office-sync.ts`

### Hooks registered

| Hook | Action |
|------|--------|
| `chat.message` | → `thinking` ("processing your message") |
| `permission.ask` | → `waiting` ("needs your permission"), force push |
| `tool.execute.before` | Map tool → state via `TOOL_STATE`, push with detail |
| `tool.execute.after` | → `thinking` ("finished {tool}") |
| `event: session.idle` | → `idle`, force |
| `event: session.error` | → `error`, force |
| `event: permission.replied` | → revert to `prevState` |

### Rules (observe-only)

1. Never throw, never mutate tool args, never block
2. Fire-and-forget HTTP with 2s timeout; swallow network errors
3. Debounce pushes to max 1 per 250ms
4. Config via env: `OFFICE_URL`, `OFFICE_JOIN_KEY`, `OFFICE_AGENT_NAME`
5. Install = copy one file to `.opencode/plugin/` (project) or `~/.config/opencode/plugins/` (global)

### Heartbeat

- 15s interval pushes current state (force=true) to survive backend restarts
- On dispose: calls `/leave-agent` (best effort)

---

## 5. Frontend (M3 — In Progress)

### Planned (Issues #11–#14)

- **#11 Canvas scene renderer:** Fixed 960×540 logical canvas, pixelated scaling, background + furniture layers, zone definitions in JSON layout, debug overlay
- **#12 Character sprite system:** Sprite-sheet loader; walk (4-dir × 4-frame), sit, type animations; sprite registry (add new sprite = drop sheet + JSON entry)
- **#13 State→zone movement + speech bubbles:** On snapshot/poll update: tween character to zone, play zone animation, show `detail` bubble (80 char cap)
- **#14 SSE live updates with polling fallback:** `GET /events` SSE; frontend uses SSE, falls back to 2s polling on failure; connection indicator dot (green/amber/red)

### Tech choices

- Vanilla TS + HTML5 Canvas 2D (no framework)
- `image-rendering: pixelated` for crisp scaling
- Mobile: scene scales down, sidebar becomes bottom sheet (M5 #20)

---

## 6. Multi-Agent (M4 — Planned)

| Issue | Scope |
|-------|-------|
| #15 Join keys | `join-keys.json`, `maxAgents` limits, 401/403 enforcement |
| #16 Multi-agent rendering | N characters, name tags, deterministic sprite/desk assignment (hash of agentId) |
| #17 Leave/offline cleanup | `/leave-agent` + sweeper (backend); frontend walk-off fade (Pam, post-M3) |

---

## 7. Polish (M5 — Planned)

| Issue | Scope |
|-------|-------|
| #18 Yesterday's memo card | Read memory log, sanitize, show as card |
| #19 Public access guide + tunnel | `docs/PUBLIC_ACCESS.md` + `scripts/tunnel.sh` (Cloudflare) |
| #20 Mobile layout pass | Bottom-sheet agent list, tap for detail |
| #21 Asset manager sidebar | Password-protected scene/sprite swap |
| #22 Smoke test script | `scripts/smoke_test.ts` hitting all endpoints, CI-integrated |

---

## 8. Security (PLAN.md §10)

- Join keys + per-agent bearer tokens = only auth (no PII, no accounts)
- Bearer token required on all mutating agent endpoints
- `detail` text sanitized/escaped before rendering (no HTML injection)
- Rate limits: 4 req/s per agent on push endpoints
- Backend binds to `127.0.0.1` by default; `--host 0.0.0.0` prints warning
- Reverse proxy with basic auth recommended for public exposure

---

## 9. Data Flow Summary

```
OpenCode tool call
      │
      ▼
plugin: tool.execute.before  ──debounce 250ms──► POST /agent-push (bearer token)
      │                                          │
      │                                          ▼
      │                                 StateStore.setState()
      │                                          │
      │                                          ▼
      │                                 atomic write state.json
      │                                          │
      │                                          ▼
      │                                 broadcast via SSE
      │                                          │
      ▼                                          ▼
Frontend SSE ◄───────────────────── /events ──► subscribers
      │
      ▼
tween character → zone, play animation, show bubble
```