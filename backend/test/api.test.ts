import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, SAMPLE_KEY } from "../src/app.js";
import { StateStore } from "../src/store.js";

function testApp() {
  const dir = mkdtempSync(join(tmpdir(), "office-api-"));
  const store = new StateStore(join(dir, "state.json"));
  store.ensureJoinKey(SAMPLE_KEY, 3);
  const dist = join(dir, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  return { app: createApp(store, dist), store };
}

describe("API", () => {
  it("GET /health", async () => {
    const { app } = testApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("GET /status returns empty office", async () => {
    const { app } = testApp();
    const res = await app.request("/status");
    expect(await res.json()).toMatchObject({ agents: {} });
  });

  it("GET /assets/ (directory) returns placeholder, not a 500", async () => {
    const { app } = testApp();
    const res = await app.request("/assets/");
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
    expect((await res.text()).toLowerCase()).toContain("agent office");
  });

  it("GET /src/app.js serves a real file from dist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "office-api-"));
    const store = new StateStore(join(dir, "state.json"));
    const dist = join(dir, "dist");
    mkdirSync(join(dist, "src"), { recursive: true });
    writeFileSync(join(dist, "src", "app.js"), "console.log('hi')");
    const app = createApp(store, dist);
    const res = await app.request("/src/app.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/javascript/);
  });

  it("POST /set_state round-trips", async () => {
    const { app } = testApp();
    const set = await app.request("/set_state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "writing", detail: "editing files" }),
    });
    expect(set.status).toBe(200);
    const body = await set.json();
    expect(body.state).toBe("writing");
    expect(body.zone).toBe("desk");

    const status = await app.request("/status");
    const snapshot = await status.json();
    expect(snapshot.agents.primary.state).toBe("writing");
  });

  it("POST /set_state rejects invalid state with 400", async () => {
    const { app } = testApp();
    const res = await app.request("/set_state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "sleeping" }),
    });
    expect(res.status).toBe(400);
  });

  it("join → push → leave flow", async () => {
    const { app } = testApp();
    const join = await app.request("/join-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: SAMPLE_KEY, name: "refactor-bot" }),
    });
    expect(join.status).toBe(201);
    const { agentId, token } = await join.json();

    const push = await app.request("/agent-push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, token, state: "researching", detail: "grepping code" }),
    });
    expect(push.status).toBe(200);
    expect((await push.json()).zone).toBe("desk");

    const bad = await app.request("/agent-push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, token: "nope", state: "error" }),
    });
    expect(bad.status).toBe(401);

    const leave = await app.request("/leave-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, token }),
    });
    expect(leave.status).toBe(200);

    const status = await app.request("/status");
    const snapshot = await status.json();
    expect(snapshot.agents[agentId]).toBeUndefined();
  });

  it("wrong join key → 401, capacity → 403", async () => {
    const { app } = testApp();
    const bad = await app.request("/join-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "unknown", name: "x" }),
    });
    expect(bad.status).toBe(401);

    // fill the key to capacity (3), then reject
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/join-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: SAMPLE_KEY, name: `bot${i}` }),
      });
      expect(res.status).toBe(201);
    }
    const full = await app.request("/join-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: SAMPLE_KEY, name: "bot4" }),
    });
    expect(full.status).toBe(403);
  });

  it("agent-push is rate limited to 4 req/s (429)", async () => {
    const { app } = testApp();
    const join = await app.request("/join-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: SAMPLE_KEY, name: "spammer" }),
    });
    const { agentId, token } = await join.json();

    let limited = false;
    for (let i = 0; i < 6; i++) {
      const res = await app.request("/agent-push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, token, state: "writing" }),
      });
      if (res.status === 429) limited = true;
      else expect(res.status).toBe(200);
    }
    expect(limited).toBe(true);
  });

  it("leave-agent with wrong token → 401, agent stays", async () => {
    const { app } = testApp();
    const join = await app.request("/join-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: SAMPLE_KEY, name: "stubborn" }),
    });
    const { agentId } = await join.json();

    const bad = await app.request("/leave-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, token: "nope" }),
    });
    expect(bad.status).toBe(401);

    const status = await app.request("/status");
    const snapshot = await status.json();
    expect(snapshot.agents[agentId]).toBeDefined();
  });

  it("leave-agent clears the agent from its join key roster", async () => {
    const { app, store } = testApp();
    const join = await app.request("/join-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: SAMPLE_KEY, name: "leaver" }),
    });
    const { agentId, token } = await join.json();
    expect(store.snapshot().joinKeys[SAMPLE_KEY]!.agents).toContain(agentId);

    const leave = await app.request("/leave-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, token }),
    });
    expect(leave.status).toBe(200);
    expect(store.snapshot().joinKeys[SAMPLE_KEY]!.agents).not.toContain(agentId);
  });
});