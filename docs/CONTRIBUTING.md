# Contributing to Agent Office

This guide covers extending the pixel-art office: adding sprites, zones, state mappings, installing the plugin, and running the full stack.

---

## 1. Adding a Character Sprite

Sprites live in `assets/sprites/`. Each sprite needs:

1. **A sprite sheet** (PNG) — frames laid out horizontally or in a grid
2. **A JSON registry entry** in `assets/sprites/manifest.json`

### Manifest format

```json
{
  "sprites": {
    "char_01": {
      "sheet": "char_01.png",
      "frameWidth": 32,
      "frameHeight": 48,
      "animations": {
        "walk_down":  { "frames": 4, "row": 0, "duration": 150 },
        "walk_up":    { "frames": 4, "row": 1, "duration": 150 },
        "walk_left":  { "frames": 4, "row": 2, "duration": 150 },
        "walk_right": { "frames": 4, "row": 3, "duration": 150 },
        "sit":        { "frames": 1, "row": 4, "col": 0 },
        "type":       { "frames": 2, "row": 4, "col": 1, "duration": 300 }
      }
    }
  }
}
```

- `row` / `col` are zero-indexed grid positions on the sheet
- `duration` is per-frame ms (omit for single-frame poses)
- Add new sprite IDs to the manifest; the frontend auto-discovers them

### Asset licensing (PLAN.md §11)

- **Option A (recommended):** Commission or create original 32×32 or 48×48 pixel art — MIT clean
- **Option B:** Use CC0 packs (e.g., Kenney.nl) as placeholders; replace before v1.0
- Every third-party asset needs attribution in `README.md` and `assets/manifest.json`

---

## 2. Extending the Zone Layout

Zones are defined in `frontend/src/zones.json` (or the layout JSON referenced by Issue #11). Each zone has:

```json
{
  "id": "desk",
  "name": "Desk Area",
  "bounds": { "x": 200, "y": 100, "width": 300, "height": 200 },
  "spawnPoints": [
    { "x": 250, "y": 150 },
    { "x": 400, "y": 150 }
  ],
  "furniture": [
    { "sprite": "desk_01", "x": 220, "y": 120 }
  ]
}
```

- `bounds` = clickable/navigable area
- `spawnPoints` = where characters appear when assigned to this zone
- `furniture` = static background sprites (rendered once per frame)

To add a zone:
1. Add entry to `zones.json`
2. Add background/furniture sprites to `assets/furniture/`
3. Update `STATE_ZONE` map in `backend/src/states.ts` (see §3)

---

## 3. Adding a State → Zone Mapping

State-to-zone mapping lives in `backend/src/states.ts`:

```ts
export const STATE_ZONE: Record<AgentState, string> = {
  idle: "sofa",
  writing: "desk",
  researching: "desk",
  executing: "desk",
  thinking: "desk",
  waiting: "door",
  error: "server",
  // Add new state here
};
```

To add a new agent state:
1. Add to `STATE_ENUM` in `states.ts`
2. Add zone mapping in `STATE_ZONE`
3. Add sprite animations for the new state (sit, type, custom pose)
4. Update plugin `TOOL_STATE` map in `plugin/src/office-sync.ts` if a tool should trigger it
5. Add frontend animation + bubble handling for the new state

---

## 4. Installing the OpenCode Plugin

### Global install (recommended)

```bash
# From repo root
npm run install-plugin
```

This copies `plugin/src/office-sync.ts` to `~/.config/opencode/plugins/office-sync.ts`. Restart OpenCode to load it.

### Project-local install

```bash
# In your project directory
mkdir -p .opencode/plugin
cp /path/to/agent-office/plugin/src/office-sync.ts .opencode/plugin/
```

### Configuration (env vars)

| Variable | Default | Description |
|----------|---------|-------------|
| `OFFICE_URL` | `http://127.0.0.1:4099` | Backend base URL |
| `OFFICE_JOIN_KEY` | `ocj_local_01` | Join key from `join-keys.json` |
| `OFFICE_AGENT_NAME` | `OpenCode` | Display name in office |

Set in your shell config or `.opencode/env`:

```bash
export OFFICE_URL=http://127.0.0.1:4099
export OFFICE_JOIN_KEY=ocj_local_01
export OFFICE_AGENT_NAME=my-bot
```

---

## 5. Running the Full Stack

### Prerequisites

- Node.js 20+
- pnpm (or npm)
- OpenCode (for plugin integration)

### One-time setup

```bash
# Clone & install
git clone https://github.com/shreyashp47/AgentsOffice
cd AgentsOffice
npm install

# Build backend + plugin
npm run build
```

### Development (hot reload)

```bash
# Terminal 1: Backend + frontend dev server
npm run dev

# Terminal 2: (optional) Run tests
npm test
```

- Backend: `http://127.0.0.1:4099`
- Frontend: served at `/` by backend (or `npm run dev -w frontend` for Vite HMR)

### Production

```bash
npm run build
npm start
```

### Running tests

```bash
# Backend unit tests (Vitest)
npm test

# Lint + typecheck
npm run lint
npm run typecheck
```

### Smoke test (all endpoints)

```bash
npm run smoke
```

### Public access via tunnel

```bash
npm run tunnel
# or
./scripts/tunnel.sh
```

See `docs/PUBLIC_ACCESS.md` for details.

---

## 6. Project Structure

```
AgentsOffice/
├── backend/           # Hono server (port 4099)
│   ├── src/
│   │   ├── app.ts      # Routes: /health, /status, /events, /join-agent, /agent-push, /leave-agent, /set_state
│   │   ├── store.ts    # StateStore: atomic JSON persistence, debounced writes
│   │   ├── states.ts   # State enum, zone map, Agent/JoinKey types
│   │   ├── sweeper.ts  # Stale agent cleanup (60s idle, 120s offline)
│   │   └── join-keys.ts # Join key config loader
│   └── test/          # Vitest unit tests
├── frontend/          # Vanilla TS + Canvas 2D (M3)
│   ├── src/
│   │   ├── zones.json     # Zone layout (Issue #11)
│   │   └── sprites/       # Sprite system (Issue #12)
├── plugin/            # OpenCode plugin
│   └── src/office-sync.ts  # Hooks: tool.execute.before/after, session.idle, session.error, permission.asked/replied
├── assets/            # Sprite sheets, furniture, manifest.json
├── scripts/           # smoke_test.ts, tunnel.sh
└── docs/              # This file, ARCHITECTURE.md, PUBLIC_ACCESS.md
```

---

## 7. Git Hygiene

- Work on feature branches off `main`
- `npm run lint && npm run typecheck && npm test` before PR
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- No force-push to shared branches