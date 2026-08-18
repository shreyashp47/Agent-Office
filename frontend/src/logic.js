// Pure logic — no DOM access, unit-testable in vitest.

export const WALK_SPEED = 120; // px/s
export const TWEEN_EPS = 2; // px, arrival tolerance
export const DETAIL_MAX = 80; // speech bubble char cap

export function hashId(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function zoneById(layout, id) {
  return (layout.zones ?? []).find((z) => z.id === id) ?? null;
}

export function zoneForState(layout, state) {
  return (layout.stateZone ?? {})[state] ?? null;
}

export function pickSpot(layout, zoneId, agentId) {
  const zone = zoneById(layout, zoneId);
  if (!zone) return null;
  const spots = zone.spots ?? [];
  if (spots.length === 0) {
    return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
  }
  const [sx, sy] = spots[hashId(agentId ?? "") % spots.length];
  return { x: sx, y: sy };
}

export function stepToward(pos, target, speed, dt) {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= TWEEN_EPS) return { x: target.x, y: target.y, arrived: true, dir: null };
  const step = Math.min(speed * dt, dist);
  const nx = (dx / dist) * step;
  const ny = (dy / dist) * step;
  const dir = Math.abs(nx) >= Math.abs(ny) ? (nx >= 0 ? "right" : "left") : ny >= 0 ? "down" : "up";
  return { x: pos.x + nx, y: pos.y + ny, arrived: false, dir };
}

export function clampText(text, max = DETAIL_MAX) {
  const s = String(text ?? "").trim();
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
