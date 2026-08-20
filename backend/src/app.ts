import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getMimeType } from "hono/utils/mime";
import { StateStore } from "./store.js";
import { isState, STATE_ENUM, type OfficeState } from "./states.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..", "..");
const DEFAULT_FRONTEND_DIST = join(ROOT, "frontend", "dist");

export const VERSION = "0.2.0";
export const SAMPLE_KEY = "ocj_local_01";
const PUSH_LIMIT_PER_SEC = 4;
const pushTimes = new Map<string, number[]>();

function rateLimited(agentId: string): boolean {
  const now = Date.now();
  const recent = (pushTimes.get(agentId) ?? []).filter((t) => now - t < 1_000);
  if (recent.length >= PUSH_LIMIT_PER_SEC) return true;
  recent.push(now);
  pushTimes.set(agentId, recent);
  return false;
}

type SSEStream = Parameters<Parameters<typeof streamSSE>[1]>[0];

export function createApp(store: StateStore, frontendDist = DEFAULT_FRONTEND_DIST) {
  const app = new Hono();
  const subscribers = new Set<SSEStream>();

  function broadcast() {
    const snapshot = JSON.stringify(store.snapshot());
    for (const stream of subscribers) {
      try {
        stream.writeSSE({ data: snapshot, event: "status" });
      } catch {
        subscribers.delete(stream);
      }
    }
  }
  store.onChange = broadcast;

  app.get("/health", (c) => c.json({ ok: true, version: VERSION }));

  app.get("/status", (c) => c.json(store.snapshot()));

  app.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      subscribers.add(stream);
      stream.onAbort(() => {
        subscribers.delete(stream);
      });
      try {
        stream.writeSSE({ data: JSON.stringify(store.snapshot()), event: "status" });
      } catch {
        /* not yet readable */
      }
      while (true) {
        await stream.sleep(1_000);
      }
    }),
  );

  app.post("/set_state", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { state, detail } = body as { state?: unknown; detail?: unknown };
    if (!store.validateState(state)) {
      return c.json({ error: `invalid state; expected one of: ${STATE_ENUM.join(", ")}` }, 400);
    }
    store.upsertAgent("primary", { name: "Primary" });
    const updated = store.setState("primary", state, typeof detail === "string" ? detail : undefined);
    return c.json(updated ?? null, 200);
  });

  app.post("/join-agent", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { key, name, sprite } = body as { key?: unknown; name?: unknown; sprite?: unknown };
    if (typeof key !== "string" || typeof name !== "string") {
      return c.json({ error: "key and name are required" }, 400);
    }
    const result = store.joinAgent(key, name, typeof sprite === "string" ? sprite : undefined);
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401 | 403 | 400);
    }
    return c.json({ agentId: result.agent.id, token: result.agent.token }, 201);
  });

  app.post("/agent-push", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { agentId, token, state, detail } = body as {
      agentId?: unknown;
      token?: unknown;
      state?: unknown;
      detail?: unknown;
    };
    if (typeof agentId !== "string" || typeof token !== "string" || !isState(state)) {
      return c.json({ error: "agentId, token and valid state are required" }, 400);
    }
    if (rateLimited(agentId)) return c.json({ error: "rate limited" }, 429);
    const updated = store.pushAgent(agentId, token, state, typeof detail === "string" ? detail : undefined);
    if (!updated) return c.json({ error: "agent not found or token mismatch" }, 401);
    return c.json(updated, 200);
  });

  app.post("/leave-agent", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { agentId, token } = body as { agentId?: unknown; token?: unknown };
    const agent = store.getAgent(typeof agentId === "string" ? agentId : "");
    if (!agent || agent.token !== token) return c.json({ error: "agent not found or token mismatch" }, 401);
    store.removeAgent(agent.id);
    return c.json({ ok: true }, 200);
  });

  const PLACEHOLDER = `<!doctype html><html><head><meta charset="utf-8"><title>Agent Office</title></head>
<body><h1>Agent Office</h1><p>Backend running (v${VERSION}). Frontend not built yet — milestone M3.</p>
<p>Status: <a href="/status">/status</a> · Health: <a href="/health">/health</a></p></body></html>`;

  app.get("*", (c) => {
    const urlPath = c.req.path === "/" ? "/index.html" : c.req.path;
    const filePath = join(frontendDist, urlPath);
    try {
      if (statSync(filePath).isFile()) {
        return c.body(readFileSync(filePath), 200, {
          "Content-Type": getMimeType(filePath) ?? "application/octet-stream",
        });
      }
    } catch {
      // missing, directory, or unreadable — fall through to placeholder
    }
    return c.html(PLACEHOLDER);
  });

  return app;
}

export type AppStore = StateStore;
export type { OfficeState };