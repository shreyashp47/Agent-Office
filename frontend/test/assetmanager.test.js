import { describe, it, expect } from "vitest";
import {
  validateSceneJson,
  validateSpritesJson,
  hashPassword,
  checkPassword,
  saveOverride,
  loadOverride,
  clearOverride,
  wrapIndex,
  STORAGE_KEYS,
} from "../src/assetmanager.js";

function stubStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const VALID_SCENE = {
  size: [960, 540],
  stateZone: { idle: "sofa", writing: "desk" },
  zones: [
    { id: "sofa", x: 50, y: 310, w: 230, h: 150, spots: [[165, 385]] },
    { id: "desk", x: 320, y: 260, w: 290, h: 140, spots: [[370, 390]] },
  ],
  furniture: [{ type: "window", x: 0, y: 0, w: 100, h: 80 }],
};

const VALID_MANIFEST = {
  default: "worker",
  frameW: 32,
  frameH: 40,
  sprites: {
    worker: { palette: { shirt: "#3a7bd5" } },
    sam: { frames: { "walk-down": 4, sit: 1 } },
  },
};

describe("validateSceneJson", () => {
  it("accepts a valid layout", () => {
    const r = validateSceneJson(VALID_SCENE);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects non-objects", () => {
    for (const bad of [null, undefined, 42, "x", []]) {
      expect(validateSceneJson(bad).ok).toBe(false);
    }
  });

  it("rejects missing or malformed size", () => {
    expect(validateSceneJson({ ...VALID_SCENE, size: undefined }).ok).toBe(false);
    expect(validateSceneJson({ ...VALID_SCENE, size: [0, 540] }).ok).toBe(false);
    expect(validateSceneJson({ ...VALID_SCENE, size: [960] }).ok).toBe(false);
  });

  it("rejects missing/empty zones", () => {
    expect(validateSceneJson({ ...VALID_SCENE, zones: undefined }).ok).toBe(false);
    expect(validateSceneJson({ ...VALID_SCENE, zones: [] }).ok).toBe(false);
  });

  it("rejects a malformed zone entry", () => {
    const r = validateSceneJson({
      ...VALID_SCENE,
      zones: [{ id: "sofa", x: 1, y: 2, w: 3 }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/zones\[0\]/);
  });

  it("rejects non-array furniture", () => {
    expect(validateSceneJson({ ...VALID_SCENE, furniture: "nope" }).ok).toBe(false);
  });
});

describe("validateSpritesJson", () => {
  it("accepts a valid manifest", () => {
    const r = validateSpritesJson(VALID_MANIFEST);
    expect(r.ok).toBe(true);
  });

  it("rejects empty or missing sprites", () => {
    expect(validateSpritesJson({ sprites: {} }).ok).toBe(false);
    expect(validateSpritesJson({}).ok).toBe(false);
    expect(validateSpritesJson(null).ok).toBe(false);
  });

  it("rejects invalid frame counts", () => {
    const r = validateSpritesJson({
      sprites: { worker: { frames: { "walk-down": 0 } } },
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/frames\.walk-down/);
  });

  it("rejects a default referencing a missing sprite", () => {
    expect(validateSpritesJson({ ...VALID_MANIFEST, default: "ghost" }).ok).toBe(false);
  });

  it("rejects negative frame dimensions", () => {
    expect(validateSpritesJson({ sprites: { worker: { frameW: -8 } } }).ok).toBe(false);
  });
});

describe("override persistence", () => {
  it("round-trips save + load", () => {
    const storage = stubStorage();
    saveOverride(storage, STORAGE_KEYS.scene, VALID_SCENE, "test scene");
    const entry = loadOverride(storage, STORAGE_KEYS.scene);
    expect(entry.name).toBe("test scene");
    expect(entry.data).toEqual(VALID_SCENE);
    expect(typeof entry.savedAt).toBe("string");
  });

  it("returns null for missing or corrupt entries", () => {
    const storage = stubStorage();
    expect(loadOverride(storage, STORAGE_KEYS.scene)).toBe(null);
    storage.setItem(STORAGE_KEYS.scene, "{not json");
    expect(loadOverride(storage, STORAGE_KEYS.scene)).toBe(null);
    storage.setItem(STORAGE_KEYS.scene, JSON.stringify({ json: "also not json" }));
    expect(loadOverride(storage, STORAGE_KEYS.scene)).toBe(null);
  });

  it("clears an override", () => {
    const storage = stubStorage();
    saveOverride(storage, STORAGE_KEYS.sprites, VALID_MANIFEST);
    clearOverride(storage, STORAGE_KEYS.sprites);
    expect(loadOverride(storage, STORAGE_KEYS.sprites)).toBe(null);
  });
});

describe("wrapIndex (focus trap)", () => {
  it("cycles forward and wraps to the start", () => {
    expect(wrapIndex(4, 0, 1)).toBe(1);
    expect(wrapIndex(4, 3, 1)).toBe(0);
  });

  it("cycles backward and wraps to the end", () => {
    expect(wrapIndex(4, 0, -1)).toBe(3);
    expect(wrapIndex(4, 3, -1)).toBe(2);
  });

  it("handles multi-step jumps and empty lists", () => {
    expect(wrapIndex(4, 1, 5)).toBe(2);
    expect(wrapIndex(4, 1, -5)).toBe(0);
    expect(wrapIndex(0, 0, 1)).toBe(-1);
  });
});

describe("password gate", () => {
  it("hashes to a 64-char hex digest", async () => {
    const h = await hashPassword("office");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts the right password against a stored hash", async () => {
    const storage = stubStorage();
    storage.setItem(STORAGE_KEYS.password, await hashPassword("s3cret"));
    expect(await checkPassword("s3cret", storage.getItem(STORAGE_KEYS.password))).toBe(true);
    expect(await checkPassword("wrong", storage.getItem(STORAGE_KEYS.password))).toBe(false);
  });

  it("falls back to the documented default when no hash is stored", async () => {
    expect(await checkPassword("office", null)).toBe(true);
    expect(await checkPassword("nope", null)).toBe(false);
  });
});