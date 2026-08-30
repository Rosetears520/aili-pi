import type { AgentDriverKind, ExecutionBackendKind } from "./backends/types.js";

export type ActivityKind = "run.started" | "turn.started" | "tool.started" | "tool.completed" | "ui.prompt.started" | "ui.prompt.ended" | "interaction.requested" | "interaction.resolved" | "turn.completed" | "turn.failed" | "manual.input" | "run.observed" | "run.stopped";
export interface ActivityEvent {
  seq: number; at: string; kind: ActivityKind; source: "precise" | "auxiliary";
  parentId: string; agentId: string; jobId?: string; turnId?: string; runId?: string;
  backend: ExecutionBackendKind; driver: AgentDriverKind; sourceSequence?: number; data?: Readonly<Record<string, unknown>>;
}
export interface ActivityOverlay {
  /** Existing liveness overlay; never a lifecycle authority. */
  state: "active" | "stalled" | "idle";
  /** Small user-facing activity vocabulary shared by managed and Herdr. */
  workState: "working" | "waiting-for-user" | "idle";
  lastSeq: number;
  since: string;
}

export class ActivityBus {
  private seq = 0;
  private readonly events: ActivityEvent[] = [];
  private readonly sourceKeys = new Map<string, ActivityEvent>();
  private readonly listeners = new Set<(event: ActivityEvent) => void>();
  constructor(private readonly parentId: string, private readonly now: () => Date = () => new Date(), private readonly maximum = 2_048) {}
  publish(input: Omit<ActivityEvent, "seq" | "at" | "parentId">): ActivityEvent {
    const sourceKey = input.sourceSequence === undefined ? undefined : `${input.backend}\0${input.driver}\0${input.runId ?? ""}\0${input.source}\0${input.sourceSequence}`;
    if (sourceKey && this.sourceKeys.has(sourceKey)) return this.sourceKeys.get(sourceKey)!;
    const event = Object.freeze({ ...input, seq: ++this.seq, at: this.now().toISOString(), parentId: this.parentId });
    this.events.push(event); if (sourceKey) this.sourceKeys.set(sourceKey, event);
    while (this.events.length > this.maximum) {
      const removed = this.events.shift()!;
      if (removed.sourceSequence !== undefined) this.sourceKeys.delete(`${removed.backend}\0${removed.driver}\0${removed.runId ?? ""}\0${removed.source}\0${removed.sourceSequence}`);
    }
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* Observability listeners are best-effort. */ }
    }
    return event;
  }
  subscribe(listener: (event: ActivityEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  list(agentId?: string): readonly ActivityEvent[] { return Object.freeze(this.events.filter((event) => !agentId || event.agentId === agentId)); }
  overlay(agentId: string, stalledAfterMs: number): ActivityOverlay {
    const latest = this.events.filter((event) => event.agentId === agentId).at(-1);
    if (!latest) return { state: "idle", workState: "idle", lastSeq: 0, since: this.now().toISOString() };
    const terminal = latest.kind === "turn.completed" || latest.kind === "turn.failed" || latest.kind === "run.stopped";
    const waiting = latest.kind === "ui.prompt.started" || latest.kind === "interaction.requested";
    return {
      state: terminal ? "idle" : this.now().getTime() - Date.parse(latest.at) >= stalledAfterMs ? "stalled" : "active",
      workState: terminal ? "idle" : waiting ? "waiting-for-user" : "working",
      lastSeq: latest.seq,
      since: latest.at,
    };
  }
}
