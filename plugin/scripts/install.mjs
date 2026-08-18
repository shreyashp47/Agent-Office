import { copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src", "office-sync.ts");
const destDir = join(homedir(), ".config", "opencode", "plugins");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, "office-sync.ts"));

console.log(`[agent-office] plugin installed → ${join(destDir, "office-sync.ts")}`);
console.log("[agent-office] restart opencode to load the plugin (it auto-registers its hooks).");