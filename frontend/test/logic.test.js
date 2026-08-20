import { describe, it, expect } from "vitest";
import { hashId, pickSpot, spreadOffsets, stepToward, clampText, zoneById, zoneForState, WALK_SPEED, TWEEN_EPS, DETAIL_MAX } from "../src/logic.js";

const MOCK_LAYOUT = {
  size: [960, 540],
  stateZone: {
    idle: "sofa",
    writing: "desk",
    researching: "desk",
    executing: "desk",
    thinking: "desk",
    waiting: "door",
    error: "server",
  },
  zones: [
    { id: "sofa", x: 50, y: 310, w: 230, h: 150, spots: [[165, 385]] },
    { id: "desk", x: 320, y: 260, w: 290, h: 140, spots: [[370, 390], [510, 390]] },
    { id: "door", x: 40, y: 420, w: 140, h: 110, spots: [[95, 500]] },
    { id: "server", x: 790, y: 160, w: 130, h: 130, spots: [[855, 252]] },
  ],
};

describe("hashId", () => {
  it("returns consistent hash for same input", () => {
    expect(hashId("agent_123")).toBe(hashId("agent_123"));
  });

  it("returns different hashes for different inputs", () => {
    expect(hashId("agent_1")).not.toBe(hashId("agent_2"));
  });

  it("returns unsigned 32-bit integer", () => {
    const h = hashId("test");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("zoneById", () => {
  it("finds zone by id", () => {
    const zone = zoneById(MOCK_LAYOUT, "desk");
    expect(zone).not.toBeNull();
    expect(zone.id).toBe("desk");
  });

  it("returns null for unknown zone", () => {
    expect(zoneById(MOCK_LAYOUT, "nonexistent")).toBeNull();
  });
});

describe("zoneForState", () => {
  it("maps state to zone from layout.stateZone", () => {
    expect(zoneForState(MOCK_LAYOUT, "idle")).toBe("sofa");
    expect(zoneForState(MOCK_LAYOUT, "writing")).toBe("desk");
    expect(zoneForState(MOCK_LAYOUT, "waiting")).toBe("door");
    expect(zoneForState(MOCK_LAYOUT, "error")).toBe("server");
  });

  it("returns null for unknown state", () => {
    expect(zoneForState(MOCK_LAYOUT, "unknown")).toBeNull();
  });
});

describe("pickSpot", () => {
  it("returns a spot within the zone bounds", () => {
    const spot = pickSpot(MOCK_LAYOUT, "desk", "agent_1");
    expect(spot.x).toBeGreaterThanOrEqual(320);
    expect(spot.x).toBeLessThanOrEqual(610);
    expect(spot.y).toBeGreaterThanOrEqual(260);
    expect(spot.y).toBeLessThanOrEqual(400);
  });

  it("returns deterministic spot for same agentId", () => {
    const spot1 = pickSpot(MOCK_LAYOUT, "desk", "agent_1");
    const spot2 = pickSpot(MOCK_LAYOUT, "desk", "agent_1");
    expect(spot1).toEqual(spot2);
  });

  it("returns different spots for different agentIds", () => {
    const spots = new Set();
    for (let i = 0; i < 10; i++) {
      const spot = pickSpot(MOCK_LAYOUT, "desk", `agent_${i}`);
      spots.add(`${spot.x},${spot.y}`);
    }
    expect(spots.size).toBeGreaterThan(1);
  });

  it("returns center of zone when no spots defined", () => {
    const layoutNoSpots = {
      ...MOCK_LAYOUT,
      zones: [{ id: "empty", x: 100, y: 100, w: 50, h: 50, spots: [] }],
    };
    const spot = pickSpot(layoutNoSpots, "empty", "agent_1");
    expect(spot.x).toBe(125);
    expect(spot.y).toBe(125);
  });

  it("returns null for unknown zone", () => {
    expect(pickSpot(MOCK_LAYOUT, "nonexistent", "agent_1")).toBeNull();
  });

  it("spreads agents around a single-spot zone deterministically (P1-2)", () => {
    const layout = {
      size: [960, 540],
      zones: [{ id: "sofa", x: 50, y: 310, w: 230, h: 150, spots: [[165, 385]] }],
    };
    const spots = new Set();
    for (let i = 0; i < 7; i++) {
      spots.add(`${pickSpot(layout, "sofa", `agent_${i}`).x},${pickSpot(layout, "sofa", `agent_${i}`).y}`);
    }
    // 7 distinct positions (deterministic fan-out), same agent always same spot
    expect(spots.size).toBeGreaterThan(1);
    expect(pickSpot(layout, "sofa", "agent_1")).toEqual(pickSpot(layout, "sofa", "agent_1"));
  });

  it("spreadOffsets stay within the zone bounds", () => {
    const offs = spreadOffsets({ x: 0, y: 0, w: 80, h: 60 });
    for (const [ox, oy] of offs) {
      expect(Math.abs(ox)).toBeLessThanOrEqual(80);
      expect(Math.abs(oy)).toBeLessThanOrEqual(60);
    }
    expect(offs[0]).toEqual([0, 0]);
  });
});

describe("stepToward", () => {
  it("returns target when already at target", () => {
    const result = stepToward({ x: 100, y: 100 }, { x: 100, y: 100 }, WALK_SPEED, 0.016);
    expect(result.arrived).toBe(true);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
    expect(result.dir).toBeNull();
  });

  it("moves toward target", () => {
    const result = stepToward({ x: 0, y: 0 }, { x: 100, y: 0 }, WALK_SPEED, 0.016);
    expect(result.arrived).toBe(false);
    expect(result.x).toBeGreaterThan(0);
    expect(result.x).toBeLessThan(100);
    expect(result.dir).toBe("right");
  });

  it("arrives when distance <= TWEEN_EPS", () => {
    const result = stepToward({ x: 99, y: 0 }, { x: 100, y: 0 }, WALK_SPEED, 0.016);
    expect(result.arrived).toBe(true);
    expect(result.x).toBe(100);
  });

  it("calculates correct direction for vertical movement", () => {
    const result = stepToward({ x: 100, y: 0 }, { x: 100, y: 100 }, WALK_SPEED, 0.016);
    expect(result.dir).toBe("down");
  });

  it("calculates correct direction for diagonal movement (horizontal dominant)", () => {
    const result = stepToward({ x: 0, y: 0 }, { x: 100, y: 10 }, WALK_SPEED, 0.016);
    expect(result.dir).toBe("right");
  });

  it("calculates correct direction for diagonal movement (vertical dominant)", () => {
    const result = stepToward({ x: 0, y: 0 }, { x: 10, y: 100 }, WALK_SPEED, 0.016);
    expect(result.dir).toBe("down");
  });
});

describe("clampText", () => {
  it("returns text unchanged when under limit", () => {
    expect(clampText("hello")).toBe("hello");
  });

  it("truncates and adds ellipsis when over limit", () => {
    const long = "a".repeat(100);
    const result = clampText(long);
    expect(result.length).toBe(DETAIL_MAX);
    expect(result.endsWith("…")).toBe(true);
  });

  it("handles null/undefined", () => {
    expect(clampText(null)).toBe("");
    expect(clampText(undefined)).toBe("");
  });

  it("trims whitespace", () => {
    expect(clampText("  hello  ")).toBe("hello");
  });
});

describe("constants", () => {
  it("WALK_SPEED is positive", () => {
    expect(WALK_SPEED).toBeGreaterThan(0);
  });

  it("TWEEN_EPS is positive", () => {
    expect(TWEEN_EPS).toBeGreaterThan(0);
  });

  it("DETAIL_MAX is 80", () => {
    expect(DETAIL_MAX).toBe(80);
  });
});