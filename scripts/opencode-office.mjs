#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_DIST = join(ROOT, "backend", "dist", "index.js");
const FRONTEND_INDEX = join(ROOT, "frontend", "dist", "index.html");

const USAGE = `opencode-office — one command, your agents in a pixel-art office

Usage:
  opencode-office [--port 4099] [--host 127.0.0.1] [--open] [--help]

Options:
  --port N   HTTP port (default: 4099, or $PORT)
  --host H   bind host (default: 127.0.0.1)
  --open     open the office in your default browser
  --help     show this help

Env:
  PORT, HOST, OFFICE_URL, OFFICE_JOIN_KEY, OFFICE_AGENT_NAME`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

function flagValue(flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  const inline = args[i + 1];
  if (inline === undefined || inline.startsWith("--")) return fallback;
  return inline;
}

const port = Number(flagValue("--port", process.env.PORT ?? "4099"));
const host = flagValue("--host", process.env.HOST ?? "127.0.0.1");
const open = args.includes("--open");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`opencode-office: invalid port "${port}"`);
  process.exit(1);
}

if (!existsSync(BACKEND_DIST) || !existsSync(FRONTEND_INDEX)) {
  console.log("[opencode-office] building backend + frontend (first run)...");
  const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (build.status !== 0) {
    console.error("[opencode-office] build failed");
    process.exit(build.status ?? 1);
  }
}

console.log(`[opencode-office] http://${host}:${port}  (Ctrl+C to stop)`);
if (open) console.log("[opencode-office] opening browser…");

const child = spawn(process.execPath, [BACKEND_DIST], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, OFFICE_ROOT: ROOT, PORT: String(port), HOST: host },
});

if (open) {
  setTimeout(() => {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn(cmd, [`http://${host}:${port}`], { stdio: "ignore", detached: true }).unref();
  }, 400);
}

function shutdown() {
  child.kill("SIGTERM");
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code) => process.exit(code ?? 0));