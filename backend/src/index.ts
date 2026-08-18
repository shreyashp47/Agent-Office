import { serve } from "@hono/node-server";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, SAMPLE_KEY, VERSION } from "./app.js";
import { createSweeper } from "./sweeper.js";
import { StateStore } from "./store.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..", "..");
const PORT = Number(process.env.PORT ?? 4099);
const HOST = process.env.HOST ?? "127.0.0.1";
const STATE_PATH = process.env.STATE_PATH ?? join(ROOT, "state.json");
const FRONTEND_DIST = join(ROOT, "frontend", "dist");

const store = new StateStore(STATE_PATH);
store.ensureJoinKey(SAMPLE_KEY, 3);

const app = createApp(store, FRONTEND_DIST);

if (HOST !== "127.0.0.1" && HOST !== "localhost") {
  console.warn("[agent-office] ⚠️ binding to non-loopback host — anyone on your network can reach this server");
}

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST });

const sweeper = createSweeper(store);

function shutdown() {
  sweeper.stop();
  store.writeNow();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[agent-office] v${VERSION} → http://${HOST}:${PORT}`);
console.log(`[agent-office] state file: ${STATE_PATH}`);
console.log(`[agent-office] default join key: ${SAMPLE_KEY}`);