import type { StateStore } from "./store.js";

export interface SweeperOptions {
  intervalMs?: number;
  idleMs?: number;
  offlineMs?: number;
}

export function createSweeper(
  store: StateStore,
  log: (line: string) => void = console.log,
  { intervalMs = 1_000, idleMs = 60_000, offlineMs = 120_000 }: SweeperOptions = {},
) {
  const timer = setInterval(() => {
    for (const line of store.sweep(Date.now(), idleMs, offlineMs)) {
      log(`[sweeper] ${line}`);
    }
  }, intervalMs);
  timer.unref?.();
  return {
    stop: () => clearInterval(timer),
  };
}