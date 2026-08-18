export const STATE_ENUM = [
  "idle",
  "writing",
  "researching",
  "executing",
  "thinking",
  "waiting",
  "error",
] as const;

export type AgentState = (typeof STATE_ENUM)[number];

export const STATE_ZONE: Record<AgentState, string> = {
  idle: "sofa",
  writing: "desk",
  researching: "desk",
  executing: "desk",
  thinking: "desk",
  waiting: "door",
  error: "server",
};

export function isState(value: unknown): value is AgentState {
  return typeof value === "string" && (STATE_ENUM as readonly string[]).includes(value);
}

export interface Agent {
  id: string;
  name: string;
  state: AgentState;
  detail?: string;
  sprite?: string;
  zone: string;
  token?: string;
  joinedAt: number;
  lastSeen: number;
}

export interface JoinKey {
  maxAgents: number;
  agents: string[];
}

export interface OfficeState {
  agents: Record<string, Agent>;
  joinKeys: Record<string, JoinKey>;
}