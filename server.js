#!/usr/bin/env node
/**
 * Agent Office server
 * -------------------
 * Serves index.html + status.json, and tails OpenCode's log file so agents
 * move on their own: active log lines -> "working", a 429 / rate-limit line
 * -> "break", quiet for a while -> "idle".
 *
 * Usage:
 *   node server.js
 *   open http://localhost:4747
 *
 * The log-line patterns below are a starting guess. Open a real log file
 * (path printed on startup) and adjust WATCHERS[].workingPattern /
 * breakPattern to match what you actually see — log formats vary by
 * OpenCode version.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PORT = 4747;
const PUBLIC_DIR = __dirname;
const STATUS_PATH = path.join(PUBLIC_DIR, 'status.json');

// ---- 1. Locate OpenCode's log directory -----------------------------------
function detectLogDir() {
  try {
    const out = execSync('opencode debug paths', { encoding: 'utf8' });
    const line = out.split('\n').find(l => l.trim().startsWith('log'));
    if (line) return line.trim().split(/\s+/).slice(1).join(' ');
  } catch (e) {
    // opencode not on PATH, or command differs by version — fall back below
  }
  return path.join(os.homedir(), '.local', 'share', 'opencode', 'log');
}

// ---- 2. One entry per tool you want tracked --------------------------------
// Add more objects here for other CLI tools (Aider, Claude Code, etc.),
// pointing logDir/patterns at their own logs.
const WATCHERS = [
  {
    id: 'opencode-1',
    name: 'OpenCode',
    tool: 'opencode',
    logDir: detectLogDir(),
    workingPattern: /service=llm|tool=|session\.(start|message)/i,
    breakPattern: /statusCode["']?\s*:\s*429|rate.?limit|quota/i,
    idleTimeoutMs: 15000,            // no activity this long -> back to idle
    breakCooldownMs: 5 * 60 * 1000,  // stay "on break" this long after a 429
  },
];

let agents = {};
WATCHERS.forEach(w => {
  agents[w.id] = { id: w.id, name: w.name, tool: w.tool, state: 'idle' };
});

function writeStatus() {
  fs.writeFileSync(STATUS_PATH, JSON.stringify(Object.values(agents), null, 2));
}
writeStatus();

function latestFile(dir) {
  try {
    const files = fs.readdirSync(dir).map(f => ({
      f, t: fs.statSync(path.join(dir, f)).mtimeMs,
    }));
    files.sort((a, b) => b.t - a.t);
    return files.length ? path.join(dir, files[0].f) : null;
  } catch (e) {
    return null;
  }
}

// ---- 3. Tail each watcher's most recent log file ---------------------------
WATCHERS.forEach(w => {
  console.log(`[${w.name}] watching log dir: ${w.logDir}`);
  let filePath = latestFile(w.logDir);
  let pos = filePath ? fs.statSync(filePath).size : 0;
  let lastActive = 0;
  let breakUntil = 0;

  setInterval(() => {
    const current = latestFile(w.logDir);
    if (current && current !== filePath) { filePath = current; pos = 0; }
    if (!filePath) return;

    let size;
    try { size = fs.statSync(filePath).size; } catch (e) { return; }

    if (size > pos) {
      const stream = fs.createReadStream(filePath, { start: pos, end: size });
      let chunk = '';
      stream.on('data', d => { chunk += d; });
      stream.on('end', () => {
        pos = size;
        const now = Date.now();
        if (w.breakPattern.test(chunk)) {
          agents[w.id].state = 'break';
          breakUntil = now + w.breakCooldownMs;
          writeStatus();
        } else if (w.workingPattern.test(chunk)) {
          lastActive = now;
          if (agents[w.id].state !== 'break') {
            agents[w.id].state = 'working';
            writeStatus();
          }
        }
      });
    }

    const now = Date.now();
    if (agents[w.id].state === 'working' && now - lastActive > w.idleTimeoutMs) {
      agents[w.id].state = 'idle';
      writeStatus();
    }
    if (agents[w.id].state === 'break' && now > breakUntil) {
      agents[w.id].state = 'idle';
      writeStatus();
    }
  }, 1000);
});

// ---- 4. Tiny static file server ---------------------------------------------
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript' };

http.createServer((req, res) => {
  const file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, file);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Agent office running → http://localhost:${PORT}`);
});
