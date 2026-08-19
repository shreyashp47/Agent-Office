#!/usr/bin/env tsx
/**
 * Smoke test for the Agent Office backend.
 *
 * Hits every endpoint that exists today and reports pass/fail per check.
 * Designed to be tolerant of milestones landing in parallel: parts of the
 * API that may not exist yet are skipped (with a note) instead of failing.
 *
 * Usage:
 *   npx tsx scripts/smoke_test.ts
 *
 * Env guards / skip flags:
 *   SMOKE_BASE_URL       base URL (default http://127.0.0.1:4099)
 *   SMOKE_PORT           shorthand for the port (default 4099)
 *   SMOKE_JOIN_KEY       join key to test with (default ocj_local_01)
 *   SMOKE_WAIT_MS        how long to wait for /health before failing (default 15000)
 *   SMOKE_SKIP_SSE=1     skip the /events SSE check
 *   SMOKE_SKIP_JOIN=1    skip the join/push/leave flow
 *   SMOKE_REQUIRE_JOIN=1 fail if the join key is rejected (default: warn+skip)
 *   SMOKE_SET_STATE=1    also exercise POST /set_state (creates a persistent
 *                        "primary" agent — opt in so shared/live offices aren't polluted)
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${process.env.SMOKE_PORT ?? 4099}`;
const JOIN_KEY = process.env.SMOKE_JOIN_KEY ?? "ocj_local_01";
const WAIT_MS = Number(process.env.SMOKE_WAIT_MS ?? 15_000);
const REQUIRE_JOIN = process.env.SMOKE_REQUIRE_JOIN === "1";

const results: { name: string; ok: boolean; note?: string }[] = [];
let failures = 0;

function record(name: string, ok: boolean, note?: string) {
  results.push({ name, ok, note });
  if (!ok) failures += 1;
}

async function check(
  name: string,
  fn: () => Promise<void>,
  opts: { skip?: boolean; skipNote?: string } = {},
): Promise<void> {
  if (opts.skip) {
    record(name, true, `skipped (${opts.skipNote ?? "flag set"})`);
    return;
  }
  try {
    await fn();
    record(name, true);
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
  }
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.status === 200) {
        const body = (await res.json()) as { ok?: boolean; version?: string };
        if (body.ok) return;
      }
    } catch {
      /* server not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no healthy server at ${BASE_URL} after ${WAIT_MS}ms (is it running? SMOKE_BASE_URL?)`);
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function main(): Promise<void> {
  console.log(`[smoke] Agent Office backend @ ${BASE_URL} (join key: ${JOIN_KEY})`);

  await check("wait for /health", waitForHealth);

  await check("GET /health", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const body = (await res.json()) as { ok?: boolean; version?: string };
    if (res.status !== 200 || !body.ok) throw new Error(`status=${res.status} body=${JSON.stringify(body)}`);
    console.log(`[smoke]   version: ${body.version ?? "unknown"}`);
  });

  await check("GET /status", async () => {
    const res = await fetch(`${BASE_URL}/status`);
    const body = (await res.json()) as { agents?: unknown };
    if (res.status !== 200 || typeof body.agents !== "object" || body.agents === null) {
      throw new Error(`status=${res.status} body=${JSON.stringify(body)}`);
    }
  });

  await check("GET /events (SSE)", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${BASE_URL}/events`, { signal: controller.signal });
    if (res.status !== 200 || !res.body) throw new Error(`status=${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sawEvent = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text.includes("event:") || text.includes("data:")) {
        sawEvent = true;
        break;
      }
    }
    clearTimeout(timer);
    controller.abort();
    if (!sawEvent) throw new Error("no SSE frame received within timeout");
  }, { skip: process.env.SMOKE_SKIP_SSE === "1", skipNote: "SMOKE_SKIP_SSE=1" });

  await check("POST /set_state", async () => {
    const res = await post("/set_state", { state: "thinking", detail: "smoke test" });
    const body = (await res.json()) as { state?: unknown };
    if (res.status !== 200 || body.state !== "thinking") {
      throw new Error(`status=${res.status} body=${JSON.stringify(body)}`);
    }
  }, { skip: process.env.SMOKE_SET_STATE !== "1", skipNote: "opt-in via SMOKE_SET_STATE=1 (creates persistent agent)" });

  const skipJoin = process.env.SMOKE_SKIP_JOIN === "1";

  await check("POST /join-agent → agent-push → leave-agent", async () => {
    const joined = await post("/join-agent", { key: JOIN_KEY, name: `smoke-${Date.now() % 100000}` });
    if (joined.status === 401) {
      if (REQUIRE_JOIN) throw new Error(`join key "${JOIN_KEY}" rejected (401) but SMOKE_REQUIRE_JOIN=1`);
      console.log(`[smoke]   note: join key "${JOIN_KEY}" rejected (401) — join flow not configured here, skipping`);
      record("join-key 401 (key not configured)", true, "verified endpoint responds 401");
      return;
    }
    if (joined.status === 403) {
      console.log("[smoke]   note: join key at capacity (403) — key is valid, limit enforced");
      record("join-key capacity 403 (key valid, full)", true, "verified limit enforcement");
      return;
    }
    if (joined.status !== 201) {
      throw new Error(`join failed: status=${joined.status} body=${await joined.text()}`);
    }
    const { agentId, token } = (await joined.json()) as { agentId: string; token: string };
    console.log(`[smoke]   joined as ${agentId}`);
    try {
      const status = await fetch(`${BASE_URL}/status`);
      const snapshot = (await status.json()) as { agents: Record<string, unknown> };
      if (!snapshot.agents[agentId]) throw new Error("joined agent missing from /status");

      const push = await post("/agent-push", { agentId, token, state: "writing", detail: "smoke" });
      const pushBody = (await push.json()) as { state?: unknown; zone?: unknown };
      if (push.status !== 200 || pushBody.state !== "writing" || pushBody.zone !== "desk") {
        throw new Error(`push: status=${push.status} body=${JSON.stringify(pushBody)}`);
      }

      const badPush = await post("/agent-push", { agentId, token: "wrong", state: "error" });
      if (badPush.status !== 401) throw new Error(`expected 401 on bad token, got ${badPush.status}`);

      let saw429 = false;
      for (let i = 0; i < 6; i++) {
        const r = await post("/agent-push", { agentId, token, state: "thinking" });
        if (r.status === 429) saw429 = true;
        else if (r.status !== 200) throw new Error(`burst push: status=${r.status}`);
      }
      if (!saw429) throw new Error("rate limit never kicked in (expected a 429 in a 6-push burst)");
    } finally {
      const leave = await post("/leave-agent", { agentId, token });
      record(
        "POST /leave-agent (cleanup)",
        leave.status === 200,
        leave.status !== 200 ? `status=${leave.status}` : undefined,
      );
    }
  }, { skip: skipJoin, skipNote: "SMOKE_SKIP_JOIN=1" });

  await check("GET /assets/:name (responds, no 5xx)", async () => {
    const res = await fetch(`${BASE_URL}/assets/placeholder.png`);
    if (res.status >= 500) throw new Error(`status=${res.status}`);
  });

  console.log("\n[smoke] results:");
  for (const r of results) {
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? ` — ${r.note}` : ""}`);
  }
  if (failures > 0) {
    console.error(`\n[smoke] ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("\n[smoke] all checks passed");
  }
}

main().catch((err) => {
  console.error(`[smoke] fatal: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
