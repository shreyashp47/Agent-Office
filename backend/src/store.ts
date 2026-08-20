import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isState, STATE_ZONE, type Agent, type AgentState, type JoinKey, type OfficeState } from "./states.js";

const DEFAULT_STATE: OfficeState = {
  agents: {},
  joinKeys: {},
};

const MAX_DETAIL_LENGTH = 80;

export class StateStore {
  private state: OfficeState;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(private readonly filePath: string, initial?: OfficeState) {
    this.state = initial ?? this.load();
  }

  private load(): OfficeState {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as OfficeState;
      return { agents: parsed.agents ?? {}, joinKeys: parsed.joinKeys ?? {} };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  onChange: ((snapshot: OfficeState) => void) | null = null;

  private scheduleWrite() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.writeNow();
    }, 250);
  }

  writeNow() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.filePath);
  }

  private emit() {
    this.scheduleWrite();
    this.onChange?.(structuredClone(this.state));
  }

  snapshot(): OfficeState {
    return structuredClone(this.state);
  }

  getAgent(id: string): Agent | undefined {
    return this.state.agents[id];
  }

  upsertAgent(id: string, fields: Partial<Agent>): Agent {
    const existing = this.state.agents[id] ?? {
      id,
      name: id,
      state: "idle",
      zone: STATE_ZONE.idle,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
    };
    const agent: Agent = { ...existing, ...fields, id, lastSeen: Date.now() };
    this.state.agents[id] = agent;
    this.emit();
    return structuredClone(agent);
  }

  setState(id: string, state: AgentState, detail?: string): Agent | undefined {
    const agent = this.state.agents[id];
    if (!agent) return undefined;
    const next: Agent = {
      ...agent,
      state,
      detail: detail ? String(detail).slice(0, MAX_DETAIL_LENGTH) : undefined,
      zone: STATE_ZONE[state],
      lastSeen: Date.now(),
    };
    this.state.agents[id] = next;
    this.emit();
    return structuredClone(next);
  }

  removeAgent(id: string): boolean {
    if (!this.state.agents[id]) return false;
    delete this.state.agents[id];
    for (const key of Object.values(this.state.joinKeys)) {
      key.agents = key.agents.filter((a) => a !== id);
    }
    this.emit();
    return true;
  }

  ensureJoinKey(key: string, maxAgents = 3) {
    if (!this.state.joinKeys[key]) {
      this.state.joinKeys[key] = { maxAgents, agents: [] };
      this.emit();
    }
    return this.state.joinKeys[key];
  }

  configureJoinKey(key: string, maxAgents: number): JoinKey {
    const existing = this.state.joinKeys[key];
    if (existing) {
      if (existing.maxAgents !== maxAgents) {
        existing.maxAgents = maxAgents;
        this.emit();
      }
      return existing;
    }
    const created: JoinKey = { maxAgents, agents: [] };
    this.state.joinKeys[key] = created;
    this.emit();
    return created;
  }

  /** Apply the canonical join-keys.json definitions (key -> maxAgents). */
  syncJoinKeys(keys: Record<string, number>, log: (msg: string) => void = console.warn): void {
    for (const [key, maxAgents] of Object.entries(keys)) {
      this.configureJoinKey(key, maxAgents);
    }
    for (const [key, joinKey] of Object.entries(this.state.joinKeys)) {
      if (joinKey.agents.length > 0 && !(key in keys)) {
        log(`[agent-office] join key "${key}" removed from join-keys.json but still has agents — keeping it`);
      }
    }
  }

  joinAgent(key: string, name: string, sprite?: string): { agent: Agent } | { error: string; status: number } {
    const joinKey = this.state.joinKeys[key];
    if (!joinKey) return { error: "invalid join key", status: 401 };
    if (joinKey.agents.length >= joinKey.maxAgents) {
      return { error: "join key at capacity", status: 403 };
    }
    const id = `agent_${randomUUID().slice(0, 8)}`;
    joinKey.agents.push(id);
    const agent = this.upsertAgent(id, {
      name: String(name).slice(0, 40),
      sprite,
      state: "idle",
      zone: STATE_ZONE.idle,
      token: randomUUID(),
    });
    return { agent };
  }

  pushAgent(agentId: string, token: string, state: AgentState, detail?: string): Agent | undefined {
    const agent = this.state.agents[agentId];
    if (!agent || agent.token !== token) return undefined;
    return this.setState(agentId, state, detail);
  }

  sweep(now = Date.now(), idleMs = 60_000, offlineMs = 120_000): string[] {
    const transitions: string[] = [];
    for (const agent of Object.values(this.state.agents)) {
      const silent = now - agent.lastSeen;
      if (silent > offlineMs) {
        this.removeAgent(agent.id);
        transitions.push(`${agent.id}: offline (${silent}ms silent)`);
      } else if (silent > idleMs && agent.state !== "idle") {
        this.setState(agent.id, "idle", "no activity");
        transitions.push(`${agent.id}: idle (${silent}ms silent)`);
      }
    }
    return transitions;
  }

  validateState(value: unknown): value is AgentState {
    return isState(value);
  }
}