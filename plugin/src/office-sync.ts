import type { PluginModule } from "@opencode-ai/plugin";

/**
 * Office Sync — OpenCode → Agent Office state bridge.
 *
 * Observe-only plugin: never throws, never blocks, never mutates tool args.
 * A broken dashboard must never break the agent.
 *
 * Config (env):
 *   OFFICE_URL         default http://127.0.0.1:4099
 *   OFFICE_JOIN_KEY    default ocj_local_01
 *   OFFICE_AGENT_NAME  default OpenCode
 */

const TOOL_STATE: Record<string, string> = {
  edit: "writing",
  write: "writing",
  patch: "writing",
  read: "researching",
  grep: "researching",
  glob: "researching",
  list: "researching",
  webfetch: "researching",
  websearch: "researching",
  bash: "executing",
  task: "executing",
};

const HEARTBEAT_MS = 15_000;
const DEBOUNCE_MS = 250;
const TIMEOUT_MS = 2_000;

const officeSync: PluginModule = {
  id: "office-sync",
  server: async () => {
    const url = process.env.OFFICE_URL ?? "http://127.0.0.1:4099";
    const key = process.env.OFFICE_JOIN_KEY ?? "ocj_local_01";
    const name = process.env.OFFICE_AGENT_NAME ?? "OpenCode";

    let agentId: string | undefined;
    let token: string | undefined;
    let state = "idle";
    let detail = "joined";
    let prevState = "idle";
    let lastPush = 0;

    async function post(body: unknown): Promise<Response | undefined> {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const res = await fetch(`${url}/agent-push`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);
        return res;
      } catch {
        return undefined;
      }
    }

    async function push(next: string, nextDetail: string, force = false) {
      const now = Date.now();
      if (!force && now - lastPush < DEBOUNCE_MS) return;
      if (!agentId || !token) return;
      lastPush = now;
      state = next;
      detail = nextDetail;
      await post({ agentId, token, state, detail });
    }

    // join on load
    try {
      const res = await fetch(`${url}/join-agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, name }),
      });
      if (res.ok) {
        const body = (await res.json()) as { agentId: string; token: string };
        agentId = body.agentId;
        token = body.token;
      }
    } catch {
      // backend not up yet; heartbeat will resync state anyway
    }

    const heartbeat = setInterval(() => {
      void push(state, detail, true);
    }, HEARTBEAT_MS);

    return {
      dispose: async () => {
        clearInterval(heartbeat);
        if (agentId && token) {
          try {
            await fetch(`${url}/leave-agent`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ agentId, token }),
            });
          } catch {
            /* observe-only */
          }
        }
      },

      "chat.message": async () => {
        await push("thinking", "processing your message");
      },

      "permission.ask": async () => {
        prevState = state;
        await push("waiting", "needs your permission", true);
      },

      "tool.execute.before": async ({ tool }) => {
        const mapped = TOOL_STATE[tool] ?? "executing";
        await push(mapped, `using ${tool}`);
      },

      "tool.execute.after": async ({ tool }) => {
        await push("thinking", `finished ${tool}`);
      },

      event: async ({ event }) => {
        switch (event.type) {
          case "session.idle":
            await push("idle", "idle", true);
            break;
          case "session.error":
            await push("error", "something went wrong", true);
            break;
          case "permission.replied":
            await push(prevState, detail, true);
            break;
          default:
            break;
        }
      },
    };
  },
};

export default officeSync;