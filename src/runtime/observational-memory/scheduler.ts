import type { HybridObserverExtractor, ObserverExtractionResult } from "./observer.js";
import type { BoundedSourceEnvelopeStore } from "./source.js";

export interface ObservationWork<T> { id: string; origin: "foreground" | "memory-internal"; run(): Promise<T>; }

export class ManagedInternalMemoryScheduler {
  private readonly queue: Array<{ work: ObservationWork<unknown>; resolve(value: unknown): void; reject(error: unknown): void }> = [];
  private readonly ids = new Set<string>();
  private running = false;
  constructor(private readonly maximumQueued = 128) {}

  submit<T>(work: ObservationWork<T>): Promise<T> {
    if (work.origin === "memory-internal") return Promise.reject(new Error("observational memory recursion denied"));
    if (this.queue.length >= this.maximumQueued) return Promise.reject(new Error("observational memory queue is full"));
    if (this.ids.has(work.id)) return Promise.reject(new Error("duplicate observational memory work"));
    this.ids.add(work.id);
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ work, resolve: resolve as (value: unknown) => void, reject });
      void this.drain();
    });
  }

  get status() { return Object.freeze({ backend: "managed-internal" as const, running: this.running, queued: this.queue.length, public: false }); }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift()!;
        try { item.resolve(await item.work.run()); } catch (error) { item.reject(error); } finally { this.ids.delete(item.work.id); }
      }
    } finally { this.running = false; }
  }
}

export type HighValueEvent = "confirmed-preference" | "accepted-decision" | "verified-solution" | "material-blocker" | "recovery-transition";

export function detectHighValueEvent(text: string, role: "user" | "assistant" | "tool-outcome"): HighValueEvent | undefined {
  const value = text.trim().slice(0, 8_192);
  if (role === "user" && (/\b(?:i (?:prefer|always want)|please always|my preference is)\b/i.test(value) || /(?:我(?:更)?(?:偏好|喜欢)|我的偏好是|请(?:始终|总是)|我希望(?:始终|总是))/.test(value))) return "confirmed-preference";
  if (/\b(?:decision accepted|we (?:decided|choose)|approved decision)\b/i.test(value) || /(?:(?:决定|决策)(?:已)?(?:接受|批准|确认)|我们(?:决定|选择)|已(?:决定|选定|敲定))/.test(value)) return "accepted-decision";
  if (role === "tool-outcome" && (/\b(?:tests? passed|verified|fixed and passing)\b/i.test(value) || /(?:测试(?:已)?通过|验证(?:已)?通过|已经?验证|修复.{0,32}通过)/.test(value))) return "verified-solution";
  if (/\b(?:material blocker|blocked because|cannot proceed)\b/i.test(value) || /(?:实质性阻塞|被.{0,32}阻塞|因.{1,64}(?:无法|不能)(?:继续|推进)|(?:无法|不能)(?:继续|推进))/.test(value)) return "material-blocker";
  if (/\b(?:recovery point|resume from|checkpoint ready)\b/i.test(value) || /(?:恢复点|从.{1,64}继续|检查点(?:已)?就绪|可从.{1,64}恢复)/.test(value)) return "recovery-transition";
  return undefined;
}

export interface ObservationTriggerResult { scheduled: boolean; reason: "below-threshold" | "token-threshold" | "high-value" | "coalesced" | "no-source"; settlement?: Promise<ObserverExtractionResult>; }

/** Token/event trigger controller. It only invokes the injected managed-internal observer seam. */
export class AutomaticObservationCoordinator {
  private readonly pending = new Map<string, Promise<ObserverExtractionResult>>();
  private readonly rerun = new Set<string>();
  private readonly boundedFlush = new Set<string>();

  constructor(private readonly sources: BoundedSourceEnvelopeStore, private readonly extractor: HybridObserverExtractor, private readonly scheduler: ManagedInternalMemoryScheduler, private readonly tokenThreshold = 2_048, private readonly onExtraction?: (result: ObserverExtractionResult) => void) {
    if (!Number.isSafeInteger(tokenThreshold) || tokenThreshold < 1) throw new Error("observation token threshold is invalid");
  }

  async flush(branchId: string, compactedEntryIds?: readonly string[]): Promise<void> {
    if (compactedEntryIds) {
      this.boundedFlush.add(branchId);
      try {
        const current = this.pending.get(branchId);
        if (current) await current;
        const batch = this.sources.cutBatch(branchId, compactedEntryIds);
        if (!batch) return;
        await this.schedule(branchId, batch);
      } finally { this.rerun.delete(branchId); this.boundedFlush.delete(branchId); }
      return;
    }
    while (this.sources.unobservedTokens(branchId) > 0) {
      const result = this.consider(branchId, "recovery-transition");
      if (!result.settlement) return;
      await result.settlement;
    }
  }

  consider(branchId: string, event?: HighValueEvent): ObservationTriggerResult {
    const qualifies = event !== undefined || this.sources.unobservedTokens(branchId) >= this.tokenThreshold;
    if (!qualifies) return { scheduled: false, reason: "below-threshold" };
    const current = this.pending.get(branchId);
    if (current) { this.rerun.add(branchId); return { scheduled: false, reason: "coalesced", settlement: current }; }
    const batch = this.sources.cutBatch(branchId);
    if (!batch) return { scheduled: false, reason: "no-source" };
    const reason = event ? "high-value" : "token-threshold";
    return { scheduled: true, reason, settlement: this.schedule(branchId, batch) };
  }

  private schedule(branchId: string, batch: NonNullable<ReturnType<BoundedSourceEnvelopeStore["cutBatch"]>>): Promise<ObserverExtractionResult> {
    const settlement = this.scheduler.submit({ id: `observer:${batch.id}`, origin: "foreground", run: async () => {
      try { const result = await this.extractor.extract(batch); this.sources.commitCoverage(batch.id); this.onExtraction?.(result); return result; }
      catch (error) { this.sources.releaseBatch(batch.id); throw error; }
    }});
    this.pending.set(branchId, settlement);
    void settlement.finally(() => {
      this.pending.delete(branchId);
      if (this.rerun.delete(branchId) && !this.boundedFlush.has(branchId)) this.consider(branchId);
    }).catch(() => undefined);
    return settlement;
  }
}
