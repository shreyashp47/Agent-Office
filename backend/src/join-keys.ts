import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * join-keys.json — the canonical key -> maxAgents definition.
 * Auto-created from this sample on first run (see ensureJoinKeysFile).
 * Keys may be written as a bare maxAgents number or as { "maxAgents": n }.
 */
export const SAMPLE_JOIN_KEYS: Record<string, { maxAgents: number }> = {
  ocj_local_01: { maxAgents: 3 },
};

export function ensureJoinKeysFile(filePath: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, JSON.stringify(SAMPLE_JOIN_KEYS, null, 2) + "\n");
  }
}

function parseMaxAgents(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  if (typeof value === "object" && value !== null && "maxAgents" in value) {
    const nested = (value as { maxAgents: unknown }).maxAgents;
    if (typeof nested === "number" && Number.isInteger(nested) && nested >= 1) return nested;
  }
  return undefined;
}

export function loadJoinKeysFile(
  filePath: string,
  log: (msg: string) => void = console.warn,
): Record<string, number> {
  const keys: Record<string, number> = {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    log(`[agent-office] join-keys file "${filePath}" unreadable — no keys loaded`);
    return keys;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    log(`[agent-office] join-keys file "${filePath}" has unexpected shape — no keys loaded`);
    return keys;
  }
  for (const [key, value] of Object.entries(raw)) {
    const maxAgents = parseMaxAgents(value);
    if (maxAgents === undefined) {
      log(`[agent-office] join key "${key}" in "${filePath}" has invalid maxAgents — ignoring`);
      continue;
    }
    keys[key] = maxAgents;
  }
  return keys;
}
