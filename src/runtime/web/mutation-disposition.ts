import { createHash } from "node:crypto";
import { mkdir, open, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  mutationIdentityDigest,
  validateMutationEnvelope,
  type MutationDisposition,
  type MutationDispositionV1,
  type MutationEnvelopeV1,
  type MutationOrigin,
} from "./contracts.js";

export interface MutationDispositionJournalOptions {
  readonly now?: () => Date;
  readonly directory?: string;
  readonly retentionMs?: number;
  readonly maxEntries?: number;
  readonly maxJournalBytes?: number;
}

export type MutationAdmission =
  | { readonly kind: "execute"; readonly execute: true; readonly disposition: MutationDispositionV1 }
  | { readonly kind: "known"; readonly execute: false; readonly disposition: MutationDispositionV1 }
  | { readonly kind: "join"; readonly execute: false; readonly disposition: MutationDispositionV1; readonly settled: Promise<MutationDispositionV1> }
  | { readonly kind: "collision"; readonly execute: false; readonly disposition: MutationDispositionV1 }
  | { readonly kind: "unknown"; readonly execute: false; readonly disposition: MutationDispositionV1 };

interface Entry {
  current: MutationDispositionV1;
  settled?: Promise<MutationDispositionV1>;
  resolve?: (value: MutationDispositionV1) => void;
}

/**
 * General bounded idempotency journal. It persists only admission identity
 * digests and bounded dispositions, never mutation arguments or results.
 */
export class MutationDispositionJournal {
  private readonly now: () => Date;
  private readonly retentionMs: number;
  private readonly maxEntries: number;
  private readonly maxJournalBytes: number;
  private readonly entries = new Map<string, Entry>();
  private readonly journalPath?: string;
  private writeChain: Promise<void> = Promise.resolve();

  public constructor(readonly sessionHandle: string, options: MutationDispositionJournalOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.retentionMs = bounded(options.retentionMs ?? 10 * 60_000, 1_000, 24 * 60 * 60_000, "retentionMs");
    this.maxEntries = bounded(options.maxEntries ?? 1_024, 1, 10_000, "maxEntries");
    this.maxJournalBytes = bounded(options.maxJournalBytes ?? 4 * 1024 * 1024, 4_096, 64 * 1024 * 1024, "maxJournalBytes");
    this.journalPath = options.directory ? join(options.directory, `${hash(sessionHandle)}.jsonl`) : undefined;
  }

  public async restore(): Promise<void> {
    if (!this.journalPath) return;
    let text: string;
    try {
      const info = await stat(this.journalPath);
      if (!info.isFile() || info.size > this.maxJournalBytes) throw new Error("mutation disposition journal exceeds its bounded size");
      text = await readFile(this.journalPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const latest = new Map<string, MutationDispositionV1>();
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      try {
        const value = JSON.parse(line) as MutationDispositionV1;
        if (valid(value) && value.sessionHandle === this.sessionHandle && value.reason !== "request-id-collision") latest.set(value.requestId, Object.freeze(value));
      } catch {
        // A truncated final write is not authoritative and cannot be replayed.
      }
    }
    for (const record of latest.values()) {
      const restored = record.disposition === "pending"
        ? Object.freeze({ ...record, disposition: "unknown" as const, reason: "owner-restart-outcome-unknown", at: this.now().toISOString() })
        : record;
      this.entries.set(restored.requestId, { current: restored });
      if (restored !== record) await this.persist(restored);
    }
    this.prune();
  }

  public async admit(envelopeValue: MutationEnvelopeV1, origin: MutationOrigin): Promise<MutationAdmission> {
    const envelope = validateMutationEnvelope(envelopeValue);
    if (envelope.sessionHandle !== this.sessionHandle) throw new Error("mutation session does not match journal");
    this.prune();
    const digest = mutationIdentityDigest(envelope, origin);
    const existing = this.entries.get(envelope.requestId);
    if (existing) {
      if (existing.current.identityDigest !== digest) {
        return { kind: "collision", execute: false, disposition: await this.persistCollision(envelope, origin, digest) };
      }
      if (existing.current.disposition === "pending" && existing.settled) {
        return { kind: "join", execute: false, disposition: existing.current, settled: existing.settled };
      }
      if (existing.current.disposition === "unknown") return { kind: "unknown", execute: false, disposition: existing.current };
      return { kind: "known", execute: false, disposition: existing.current };
    }

    let resolve!: (value: MutationDispositionV1) => void;
    const settled = new Promise<MutationDispositionV1>((done) => { resolve = done; });
    const pending = this.makeRecord(envelope, origin, "pending", "writer-admitted", digest);
    // Persist pending before execution. A crash from this point becomes unknown.
    await this.persist(pending);
    this.entries.set(envelope.requestId, { current: pending, settled, resolve });
    return { kind: "execute", execute: true, disposition: pending };
  }

  public async reject(envelopeValue: MutationEnvelopeV1, origin: MutationOrigin, reason: string): Promise<MutationDispositionV1> {
    const envelope = validateMutationEnvelope(envelopeValue);
    const digest = mutationIdentityDigest(envelope, origin);
    const existing = this.entries.get(envelope.requestId);
    if (existing) {
      if (existing.current.identityDigest !== digest) return this.makeRecord(envelope, origin, "rejected", "request-id-collision", digest);
      if (existing.current.disposition !== "pending") return existing.current;
    } else {
      const record = this.makeRecord(envelope, origin, "rejected", reason, digest);
      await this.persist(record);
      this.entries.set(envelope.requestId, { current: record });
      this.prune();
      return record;
    }
    return this.settle(envelope, origin, "rejected", reason);
  }

  public async complete(envelopeValue: MutationEnvelopeV1, origin: MutationOrigin, sequence?: number): Promise<MutationDispositionV1> {
    return this.settle(validateMutationEnvelope(envelopeValue), origin, "completed", "mutation-completed", sequence);
  }

  public async fail(envelopeValue: MutationEnvelopeV1, origin: MutationOrigin, reason: string): Promise<MutationDispositionV1> {
    return this.settle(validateMutationEnvelope(envelopeValue), origin, "failed", reason);
  }

  /** Reconcile an unknown restart outcome from authoritative service state. */
  public async reconcile(
    envelopeValue: MutationEnvelopeV1,
    origin: MutationOrigin,
    outcome: "completed" | "failed" | "not-applied",
    sequence?: number,
  ): Promise<MutationDispositionV1> {
    const envelope = validateMutationEnvelope(envelopeValue);
    const current = this.entries.get(envelope.requestId)?.current;
    if (!current || current.disposition !== "unknown" || current.identityDigest !== mutationIdentityDigest(envelope, origin)) {
      throw new Error("mutation does not have an unknown disposition to reconcile");
    }
    if (outcome === "completed") return this.settle(envelope, origin, "completed", "authoritative-state-confirms-completed", sequence);
    if (outcome === "failed") return this.settle(envelope, origin, "failed", "authoritative-state-confirms-failed");
    // Explicit not-applied is a terminal failure; callers may use a new request id
    // after a fresh operation-specific preflight rather than blindly replaying.
    return this.settle(envelope, origin, "failed", "authoritative-state-confirms-not-applied");
  }

  public get(requestId: string): MutationDispositionV1 | undefined {
    return this.entries.get(requestId)?.current;
  }

  public list(): readonly MutationDispositionV1[] {
    this.prune();
    return [...this.entries.values()].map((entry) => entry.current);
  }

  private async persistCollision(envelope: MutationEnvelopeV1, origin: MutationOrigin, digest: string): Promise<MutationDispositionV1> {
    const record = this.makeRecord(envelope, origin, "rejected", "request-id-collision", digest);
    await this.persist(record);
    // The conflicting record is evidence only. It must never replace the
    // original request-id disposition in the in-memory index.
    return record;
  }

  private async settle(
    envelope: MutationEnvelopeV1,
    origin: MutationOrigin,
    disposition: Exclude<MutationDisposition, "pending" | "unknown">,
    reason: string,
    sequence?: number,
  ): Promise<MutationDispositionV1> {
    const digest = mutationIdentityDigest(envelope, origin);
    const current = this.entries.get(envelope.requestId);
    if (current && current.current.identityDigest !== digest) return this.makeRecord(envelope, origin, "rejected", "request-id-collision", digest);
    if (current && current.current.disposition !== "pending" && current.current.disposition !== "unknown") return current.current;
    const record = this.makeRecord(envelope, origin, disposition, reason, digest, sequence);
    await this.persist(record);
    current?.resolve?.(record);
    this.entries.delete(envelope.requestId);
    this.entries.set(envelope.requestId, { current: record });
    this.prune();
    return record;
  }

  private makeRecord(
    envelope: MutationEnvelopeV1,
    origin: MutationOrigin,
    disposition: MutationDisposition,
    reason: string,
    identityDigest = mutationIdentityDigest(envelope, origin),
    sequence?: number,
  ): MutationDispositionV1 {
    return Object.freeze({
      schemaVersion: 1,
      requestId: envelope.requestId,
      clientId: envelope.clientId,
      runtimeEpoch: envelope.runtimeEpoch,
      leaseGeneration: envelope.leaseGeneration,
      sessionHandle: envelope.sessionHandle,
      capability: envelope.capability,
      commandType: envelope.commandType,
      origin,
      disposition,
      reason: boundedReason(reason),
      at: this.now().toISOString(),
      identityDigest,
      ...(sequence === undefined ? {} : { sequence }),
    });
  }

  private async persist(record: MutationDispositionV1): Promise<void> {
    if (!this.journalPath) return;
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.journalPath!), { recursive: true, mode: 0o700 });
      let size = 0;
      try { size = (await stat(this.journalPath!)).size; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const line = `${JSON.stringify(record)}\n`;
      if (size + Buffer.byteLength(line) > this.maxJournalBytes) throw new Error("mutation disposition journal storage limit reached");
      const handle = await open(this.journalPath!, "a", 0o600);
      try {
        await handle.appendFile(line, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
    await this.writeChain;
  }

  private prune(): void {
    const cutoff = this.now().getTime() - this.retentionMs;
    for (const [key, entry] of this.entries) {
      if (entry.current.disposition !== "pending" && Date.parse(entry.current.at) < cutoff) this.entries.delete(key);
    }
    while (this.entries.size > this.maxEntries) {
      const candidate = [...this.entries].find(([, entry]) => entry.current.disposition !== "pending");
      if (!candidate) break;
      this.entries.delete(candidate[0]);
    }
  }
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function boundedReason(value: string): string { return value.replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 160) || "unspecified"; }
function bounded(value: number, min: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} out of range`);
  return value;
}
function valid(value: MutationDispositionV1): boolean {
  return value?.schemaVersion === 1 && typeof value.requestId === "string" && typeof value.clientId === "string"
    && typeof value.runtimeEpoch === "string" && typeof value.leaseGeneration === "string" && typeof value.sessionHandle === "string"
    && typeof value.capability === "string" && typeof value.commandType === "string"
    && (value.origin === "tui" || value.origin === "web") && ["pending", "rejected", "completed", "failed", "unknown"].includes(value.disposition)
    && typeof value.reason === "string" && !Number.isNaN(Date.parse(value.at)) && /^[a-f0-9]{64}$/.test(value.identityDigest)
    && (value.sequence === undefined || (Number.isSafeInteger(value.sequence) && value.sequence >= 1));
}
