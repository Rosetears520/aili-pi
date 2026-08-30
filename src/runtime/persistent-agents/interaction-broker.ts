export type InteractionKind = "permission" | "question";
export type InteractionState = "pending" | "resolved" | "expired" | "cancelled";

export interface InteractionRecord<TRequest = unknown, TAnswer = unknown> {
  id: string;
  kind: InteractionKind;
  agentId: string;
  jobId: string;
  runId?: string;
  state: InteractionState;
  request: TRequest;
  answer?: TAnswer;
  createdAt: string;
  expiresAt?: string;
}

interface Pending<TAnswer> { record: InteractionRecord<unknown, TAnswer>; settle(answer: TAnswer): void; cancel(): void; timer?: ReturnType<typeof setTimeout>; }

export class InteractionBroker {
  private readonly pending = new Map<string, Pending<unknown>>();
  private sequence = 0;
  private closed = false;

  async request<TRequest, TAnswer>(input: {
    kind: InteractionKind; agentId: string; jobId: string; runId?: string; request: TRequest;
    render(record: InteractionRecord<TRequest, TAnswer>): Promise<TAnswer>;
    signal?: AbortSignal; timeoutMs?: number; fallback: TAnswer;
  }): Promise<TAnswer> {
    if (this.closed || input.signal?.aborted) return input.fallback;
    const id = `interaction-${++this.sequence}`;
    const now = Date.now();
    const record: InteractionRecord<TRequest, TAnswer> = { id, kind: input.kind, agentId: input.agentId, jobId: input.jobId, ...(input.runId ? { runId: input.runId } : {}), state: "pending", request: input.request, createdAt: new Date(now).toISOString(), ...(input.timeoutMs ? { expiresAt: new Date(now + input.timeoutMs).toISOString() } : {}) };
    let settle!: (answer: TAnswer) => void;
    const gate = new Promise<TAnswer>((resolve) => { settle = resolve; });
    const pending: Pending<TAnswer> = { record: record as InteractionRecord<unknown, TAnswer>, settle, cancel: () => settle(input.fallback) };
    if (input.timeoutMs) pending.timer = setTimeout(() => { record.state = "expired"; settle(input.fallback); }, input.timeoutMs);
    this.pending.set(id, pending as Pending<unknown>);
    const abort = () => { record.state = "cancelled"; settle(input.fallback); };
    input.signal?.addEventListener("abort", abort, { once: true });
    const rendered = input.render(record).catch(() => input.fallback);
    const answer = await Promise.race([rendered, gate]);
    if (record.state === "pending") record.state = "resolved";
    record.answer = answer;
    if (pending.timer) clearTimeout(pending.timer);
    input.signal?.removeEventListener("abort", abort);
    this.pending.delete(id);
    return answer;
  }

  answer(id: string, answer: unknown): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    pending.record.state = "resolved";
    pending.record.answer = answer;
    pending.settle(answer);
    return true;
  }

  pendingRecords(jobId?: string): readonly InteractionRecord[] { return Object.freeze([...this.pending.values()].map((item) => item.record).filter((item) => !jobId || item.jobId === jobId)); }
  shutdown(): void { this.closed = true; for (const item of this.pending.values()) item.cancel(); this.pending.clear(); }
}
