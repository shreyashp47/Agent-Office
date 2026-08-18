import { describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/store.js";
import { createSweeper } from "../src/sweeper.js";

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), "office-"));
  return new StateStore(join(dir, "state.json"));
}

describe("StateStore", () => {
  it("starts empty", () => {
    const store = tempStore();
    expect(store.snapshot().agents).toEqual({});
  });

  it("upserts and reads an agent", () => {
    const store = tempStore();
    store.upsertAgent("a1", { name: "refactor-bot" });
    expect(store.getAgent("a1")?.name).toBe("refactor-bot");
    expect(store.getAgent("a1")?.state).toBe("idle");
    expect(store.getAgent("a1")?.zone).toBe("sofa");
  });

  it("maps state to zone and sets detail", () => {
    const store = tempStore();
    store.upsertAgent("a1", { name: "bot" });
    store.setState("a1", "writing", "editing src/auth.ts");
    const agent = store.getAgent("a1")!;
    expect(agent.state).toBe("writing");
    expect(agent.zone).toBe("desk");
    expect(agent.detail).toBe("editing src/auth.ts");
  });

  it("truncates detail to 80 chars", () => {
    const store = tempStore();
    store.upsertAgent("a1", { name: "bot" });
    store.setState("a1", "writing", "x".repeat(200));
    expect(store.getAgent("a1")!.detail!.length).toBe(80);
  });

  it("rejects unknown states", () => {
    const store = tempStore();
    expect(store.validateState("sleeping")).toBe(false);
    expect(store.validateState("writing")).toBe(true);
  });

  it("persists state across instances (atomic write)", () => {
    const dir = mkdtempSync(join(tmpdir(), "office-"));
    const file = join(dir, "state.json");
    const store1 = new StateStore(file);
    store1.upsertAgent("a1", { name: "bot" });
    store1.setState("a1", "executing");
    store1.writeNow();
    expect(existsSync(file)).toBe(true);

    const store2 = new StateStore(file);
    expect(store2.getAgent("a1")?.state).toBe("executing");
  });

  it("join key: invalid key → 401, capacity → 403, valid → agent + token", () => {
    const store = tempStore();
    store.ensureJoinKey("team", 1);
    const bad = store.joinAgent("nope", "x");
    expect("status" in bad && bad.status).toBe(401);

    const good = store.joinAgent("team", "bot");
    expect("error" in good).toBe(false);
    if ("error" in good) return;
    expect(good.agent.token).toBeTruthy();

    const full = store.joinAgent("team", "bot2");
    expect("status" in full && full.status).toBe(403);
  });

  it("agent-push requires matching token", () => {
    const store = tempStore();
    store.ensureJoinKey("team", 3);
    const joined = store.joinAgent("team", "bot");
    if ("error" in joined) throw new Error("join failed");
    const { id, token } = joined.agent;
    expect(store.pushAgent(id, "wrong-token", "writing")).toBeUndefined();
    expect(store.pushAgent(id, token!, "writing")?.state).toBe("writing");
  });

  it("sweeper: silent > idleMs → idle, > offlineMs → removed", () => {
    const store = tempStore();
    store.upsertAgent("a1", { name: "bot" });
    store.setState("a1", "writing");
    const transitions = store.sweep(store.getAgent("a1")!.lastSeen + 70_000, 60_000, 120_000);
    expect(transitions).toHaveLength(1);
    expect(store.getAgent("a1")?.state).toBe("idle");

    const offline = store.sweep(store.getAgent("a1")!.lastSeen + 130_000, 60_000, 120_000);
    expect(offline).toHaveLength(1);
    expect(store.getAgent("a1")).toBeUndefined();
  });

  it("sweeper interval ticks and logs", async () => {
    const store = tempStore();
    store.upsertAgent("a1", { name: "bot" });
    store.setState("a1", "writing");
    store.getAgent("a1")!.lastSeen = Date.now() - 70_000;

    const lines: string[] = [];
    const sweeper = createSweeper(store, (l) => lines.push(l), {
      intervalMs: 10,
      idleMs: 60_000,
      offlineMs: 120_000,
    });
    await new Promise((r) => setTimeout(r, 50));
    sweeper.stop();
    expect(lines.some((l) => l.includes("idle"))).toBe(true);
    expect(store.getAgent("a1")?.state).toBe("idle");
  });

  it("loads missing file as empty", () => {
    const store = new StateStore(join(tmpdir(), "does-not-exist", "state.json"));
    expect(store.snapshot().agents).toEqual({});
  });

  it("readFileSync round-trip content is valid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "office-"));
    const file = join(dir, "state.json");
    const store = new StateStore(file);
    store.ensureJoinKey("k", 3);
    store.writeNow();
    expect(() => JSON.parse(readFileSync(file, "utf8"))).not.toThrow();
  });
});