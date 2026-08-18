// Entry point: canvas scene, sprite registry, live character management,
// demo mode, set-state toolbar and debug overlay toggle.

import { Scene } from "./scene.js";
import { loadSprites } from "./sprites.js";
import { Character } from "./character.js";
import { connectOffice } from "./api.js";
import { hashId } from "./logic.js";
import { MemoCard } from "./memo.js";
import { initMobileSheet } from "./mobile.js";

const params = new URLSearchParams(location.search);
const debugFlag = params.get("debug") === "1";
const demoEnabled = params.get("demo") !== "0";

const canvas = document.getElementById("scene");
const scene = new Scene(canvas, { debug: debugFlag });
await scene.loadLayout("assets/scene.json");
const registry = await loadSprites("assets/sprites.json");

const characters = new Map();
let mode = "offline";

const SPRITE_IDS = ["worker", "sam", "dino"];

function pickSprite(registry, agentId) {
  const available = SPRITE_IDS.filter((id) => registry.has(id));
  if (available.length === 0) return registry.get(registry.defaultId);
  return registry.get(available[hashId(agentId) % available.length]);
}

function upsertAgent(agent) {
  let c = characters.get(agent.id);
  if (!c) {
    const sprite = agent.sprite ? registry.get(agent.sprite) : pickSprite(registry, agent.id);
    c = new Character({ id: agent.id, name: agent.name ?? agent.id, sprite, layout: scene.layout });
    characters.set(agent.id, c);
  }
  c.setState(agent.state, agent.detail, agent.zone);
}

connectOffice({
  onSnapshot: (snap) => {
    const seen = new Set();
    for (const [id, agent] of Object.entries(snap.agents ?? {})) {
      seen.add(id);
      upsertAgent(agent);
    }
    for (const id of [...characters.keys()]) {
      if (!seen.has(id)) characters.delete(id);
    }
    mobileSheet.sheet.update(characters);
  },
  onModeChange: (m) => {
    mode = m;
  },
});

// Mobile agent sheet (M5 #20)
const mobileSheet = initMobileSheet({
  characters,
  onSelect: (agentId) => {
    const char = characters.get(agentId);
    if (char) {
      // Center camera on selected agent (future enhancement)
    }
  },
});

// Demo character (PLAN.md #12: "a test character idles and walks between two
// points"). Takes over when the office is empty; real agents hide it.
const DEMO_LOOP = [
  { state: "idle", zone: "sofa", detail: null, hold: 3500 },
  { state: "writing", zone: "desk", detail: "writing README.md — adding the pixel office docs", hold: 4500 },
  { state: "thinking", zone: "desk", detail: null, hold: 2500 },
  { state: "researching", zone: "desk", detail: "reading hive/PROTOCOL.md for context…", hold: 3500 },
  { state: "waiting", zone: "door", detail: "Waiting for permission to run npm install", hold: 4000 },
  { state: "error", zone: "server", detail: "TypeError: cannot read property of undefined", hold: 3000 },
];

function makeDemo() {
  const sprite = registry.get(registry.defaultId);
  const char = new Character({ id: "__demo__", name: "Demo", sprite, layout: scene.layout });
  let i = 0;
  let t = 0;
  return {
    list() {
      return characters.size === 0 ? [char] : [];
    },
    update(dt, _time) {
      if (characters.size > 0) return;
      const step = DEMO_LOOP[i];
      char.setState(step.state, step.detail, step.zone);
      char.update(dt);
      t += dt * 1000;
      if (t >= step.hold) {
        t = 0;
        i = (i + 1) % DEMO_LOOP.length;
      }
    },
  };
}
const demo = demoEnabled ? makeDemo() : null;

let last = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  if (demo) demo.update(dt, t / 1000);
  for (const c of characters.values()) c.update(dt);
  const visible = demo ? demo.list() : [...characters.values()];
  scene.draw({ characters: visible, mode, time: t / 1000 });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Set-state toolbar (PLAN.md #13 acceptance: POST /set_state reflects on screen).
const STATE_BUTTONS = [
  ["idle", "Idle", null],
  ["writing", "Writing", "writing frontend/src/main.js — wiring the SSE client"],
  ["researching", "Researching", "reading hive/PROTOCOL.md for context…"],
  ["executing", "Executing", "npm run build && npm test"],
  ["thinking", "Thinking", null],
  ["waiting", "Waiting", "Permission needed: npm install"],
  ["error", "Error", "TypeError: Cannot read properties of undefined"],
];
const toolbar = document.getElementById("toolbar");
for (const [state, label, detail] of STATE_BUTTONS) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    const body = { state };
    if (detail) body.detail = detail;
    try {
      await fetch("/set_state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // backend offline; demo keeps the office alive
    }
  });
  toolbar.appendChild(btn);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "d" || e.key === "D") scene.debug = !scene.debug;
});

// Memo card (M5 #18)
const memo = new MemoCard({ container: document.body, fetchUrl: "/api/memo" });
memo.mount();
memo.show();
