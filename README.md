# Agent Office

A 2D status board for your AI coding agents. Each agent is a little badge that
sits at a desk while it's working, moves to the Requirements room when it's
idle, and heads to the Café when it's rate-limited / out of tokens.

## Quick start (just look at it)

Double-click `index.html` — it opens in your browser with one demo agent
already seated. Turn on **Demo mode** in the side panel to watch agents move
between rooms automatically, or use the ● / ◐ / ☕ buttons next to each agent
to move them yourself.

This mode is fully manual/offline — nothing is being monitored yet.

## Live mode (auto-tracks real OpenCode activity)

```bash
node server.js
# then open:
open http://localhost:4747
```

`server.js` does two things:

1. Serves `index.html` and `status.json` on `http://localhost:4747` (the page
   polls `status.json` every 3 seconds — this only works over `http://`, not
   when you open the file directly, due to browser file-access restrictions).
2. Tails OpenCode's own log file and flips the agent's state:
   - matches something that looks like active work → **working** (desk)
   - matches a `429` / rate-limit / quota line → **break** (café)
   - no activity for 15s → back to **waiting** (requirements room)

On startup it runs `opencode debug paths` to find your log directory. If that
command isn't found it falls back to `~/.local/share/opencode/log`. Check the
first console line it prints to confirm it found the right folder.

## The detection is a starting point, not exact

I don't know your exact OpenCode version's log format, so the patterns in
`server.js` (`workingPattern`, `breakPattern`) are a reasonable guess based on
its public log format (`ERROR service=llm error={"statusCode":429,...}`).
Open a real log file in the folder it printed and see what your activity
actually looks like, then tighten those two regexes in `server.js`. That's
the one part of this you'll likely want to tune by hand.

There's no way to reliably detect "out of tokens" versus a generic API error
purely from the outside — OpenCode itself is the only thing that really knows
that. The 429/rate-limit match is the closest external signal available.

## Tracking more than one tool

`WATCHERS` near the top of `server.js` is a list — duplicate the OpenCode
entry, point `logDir` at the other tool's log location, and adjust the
patterns. Each entry gets its own desk/room slot automatically. If a tool
doesn't write logs you can watch, you can still represent it manually: add it
with the **Add agent** form in the UI and move it with the state buttons —
useful for tools you're running by hand.

## Files

- `index.html` — the office UI (self-contained, no build step)
- `server.js` — local server + OpenCode log watcher (Node, no dependencies)
- `status.json` — written by `server.js`; the UI polls this for live state
