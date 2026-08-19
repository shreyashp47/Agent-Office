import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureJoinKeysFile, loadJoinKeysFile, SAMPLE_JOIN_KEYS } from "../src/join-keys.js";
import { createApp, SAMPLE_KEY } from "../src/app.js";
import { StateStore } from "../src/store.js";

function tempFile(prefix: string): string {
  return join(mkdtempSync(join(tmpdir(), prefix)), "join-keys.json");
}

describe("join-keys.json (#15)", () => {
  it("auto-creates the file from a sample on first run", () => {
    const file = tempFile("office-jk-");
    expect(existsSync(file)).toBe(false);
    ensureJoinKeysFile(file);
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(SAMPLE_JOIN_KEYS);
  });

  it("does not overwrite an existing file", () => {
    const file = tempFile("office-jk-");
    writeFileSync(file, JSON.stringify({ team_x: { maxAgents: 5 } }));
    ensureJoinKeysFile(file);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ team_x: { maxAgents: 5 } });
  });

  it("loads bare-number and {maxAgents} forms, ignoring invalid entries", () => {
    const file = tempFile("office-jk-");
    writeFileSync(
      file,
      JSON.stringify({ a: 2, b: { maxAgents: 4 }, c: -1, d: "three", e: { maxAgents: "x" } }),
    );
    const warnings: string[] = [];
    const keys = loadJoinKeysFile(file, (w) => warnings.push(w));
    expect(keys).toEqual({ a: 2, b: 4 });
    expect(warnings.length).toBe(3);
  });

  it("returns no keys when the file is unreadable", () => {
    const file = join(mkdtempSync(join(tmpdir(), "office-jk-")), "missing.json");
    expect(loadJoinKeysFile(file, () => undefined)).toEqual({});
  });

  it("syncs keys into the store and enforces capacity from the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "office-jk-"));
    const file = join(dir, "join-keys.json");
    ensureJoinKeysFile(file);
    const store = new StateStore(join(dir, "state.json"));
    store.syncJoinKeys(loadJoinKeysFile(file));

    const first = store.joinAgent("ocj_local_01", "bot1");
    expect("error" in first).toBe(false);
    store.joinAgent("ocj_local_01", "bot2");
    const third = store.joinAgent("ocj_local_01", "bot3");
    expect("error" in third).toBe(false);
    const full = store.joinAgent("ocj_local_01", "bot4");
    expect("status" in full && full.status).toBe(403);
  });

  it("updates maxAgents and preserves live agents on resync", () => {
    const dir = mkdtempSync(join(tmpdir(), "office-jk-"));
    const store = new StateStore(join(dir, "state.json"));
    store.ensureJoinKey("team", 1);
    const joined = store.joinAgent("team", "bot");
    if ("error" in joined) throw new Error("join failed");

    store.syncJoinKeys({ team: 5 });
    const snap = store.snapshot();
    expect(snap.joinKeys.team?.maxAgents).toBe(5);
    expect(snap.joinKeys.team?.agents).toContain(joined.agent.id);

    const rejoin = store.joinAgent("team", "bot2");
    expect("error" in rejoin).toBe(false);
  });

  it("keeps a key that still has agents even when removed from the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "office-jk-"));
    const store = new StateStore(join(dir, "state.json"));
    store.ensureJoinKey("doomed", 2);
    const joined = store.joinAgent("doomed", "bot");
    if ("error" in joined) throw new Error("join failed");

    const warnings: string[] = [];
    store.syncJoinKeys({}, (w) => warnings.push(w));
    expect(store.snapshot().joinKeys.doomed?.maxAgents).toBe(2);
    expect(warnings.some((w) => w.includes("doomed"))).toBe(true);
  });

  it("full bootstrap: join-keys file → store → API 401/403 (issue #15)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "office-jk-"));
    const keysFile = join(dir, "join-keys.json");
    writeFileSync(keysFile, JSON.stringify({ ocj_local_01: { maxAgents: 1 } }));
    const store = new StateStore(join(dir, "state.json"));
    store.syncJoinKeys(loadJoinKeysFile(keysFile));
    const app = createApp(store, join(dir, "dist"));

    const wrong = await app.request("/join-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "nope", name: "x" }),
    });
    expect(wrong.status).toBe(401);

    const ok = await app.request("/join-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: SAMPLE_KEY, name: "bot" }),
    });
    expect(ok.status).toBe(201);

    const full = await app.request("/join-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: SAMPLE_KEY, name: "bot2" }),
    });
    expect(full.status).toBe(403);
  });
});
