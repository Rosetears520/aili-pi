import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const FORMAT_VERSION = 1;
const MAX_EVENT_BYTES = 8_192;
const MAX_DIMENSION_LENGTH = 96;
const MAX_DIMENSIONS_PER_QUERY = 64;
const SAFE_SCOPE = /^[A-Za-z0-9_-]{16,128}$/;
const SAFE_DIMENSION = /^[a-z0-9][a-z0-9._:/@-]{0,95}$/;
const KINDS = ["response", "llm_call", "tool", "skill", "agent", "mcp", "provider_error"] as const;
const OUTCOMES = ["success", "error", "aborted", "interrupted", "unknown"] as const;
const ERROR_CATEGORIES = ["dns", "timeout", "connection", "tls", "network", "provider", "unknown"] as const;
const ALLOWED_FIELDS = new Set([
  "timestampMs", "durationMs", "scope", "kind", "provider", "model", "tool", "skill", "agent", "mcp",
  "outcome", "errorCategory", "responseCount", "llmCallCount", "inputTokens", "outputTokens", "costMicros",
]);

export type AnalyticsKind = (typeof KINDS)[number];
export type AnalyticsOutcome = (typeof OUTCOMES)[number];
export type AnalyticsErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** This is the complete ingestion allowlist. Unknown keys fail closed. */
export interface AnalyticsEventInput {
  readonly timestampMs: number;
  readonly scope: string;
  readonly kind: AnalyticsKind;
  readonly durationMs?: number;
  readonly provider?: string;
  readonly model?: string;
  readonly tool?: string;
  readonly skill?: string;
  readonly agent?: string;
  readonly mcp?: string;
  readonly outcome?: AnalyticsOutcome;
  readonly errorCategory?: AnalyticsErrorCategory;
  readonly responseCount?: number;
  readonly llmCallCount?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costMicros?: number;
}

export interface AnalyticsEvent extends AnalyticsEventInput {
  readonly formatVersion: 1;
}

export interface AnalyticsTimeRange {
  readonly fromMs: number;
  readonly toMs: number;
}

export interface AnalyticsSummary {
  records: number;
  responseCount: number;
  llmCallCount: number;
  toolCount: number;
  errorCount: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  dimensions: Record<string, number>;
  corruptRecords: number;
  truncatedDimensions: boolean;
}

export interface AnalyticsQueryResult {
  readonly range: AnalyticsTimeRange;
  readonly summary: AnalyticsSummary;
  readonly sizeBytes: number;
}

export interface AnalyticsCleanupResult {
  readonly kind: "range" | "all";
  readonly deletedRecords: number;
  readonly retainedRecords: number;
  readonly deletedBytes: number;
  readonly corruptRecords: number;
}

export interface AnalyticsStoreOptions {
  readonly root: string;
  readonly createId?: () => string;
}

/**
 * Content-free local event store. Each accepted event is atomically finalized
 * into its own opaque segment, so queries stream records without retaining
 * history in memory. It deliberately has no session, prompt, or provider API.
 */
export class AnalyticsStore {
  private readonly segments: string;
  private readonly quarantine: string;
  private readonly createId: () => string;
  private mutationTail: Promise<void> = Promise.resolve();

  public constructor(private readonly options: AnalyticsStoreOptions) {
    this.segments = join(options.root, "segments");
    this.quarantine = join(options.root, "quarantine");
    this.createId = options.createId ?? randomUUID;
  }

  public async append(input: AnalyticsEventInput | Record<string, unknown>): Promise<AnalyticsEvent> {
    const event = normalizeAnalyticsEvent(input);
    const frame = JSON.stringify(event);
    if (Buffer.byteLength(frame, "utf8") > MAX_EVENT_BYTES) throw new Error("Analytics event exceeds its content-free size bound");
    await this.mutate(async () => {
      await mkdir(this.segments, { recursive: true, mode: 0o700 });
      const id = safeSegmentId(this.createId());
      const temporary = join(this.segments, `.${id}.tmp`);
      const target = join(this.segments, `${id}.json`);
      await writeFile(temporary, frame, { encoding: "utf8", mode: 0o600, flag: "wx" });
      try { await rename(temporary, target); }
      catch (error) { await rm(temporary, { force: true }); throw error; }
    });
    return event;
  }

  public async query(range: AnalyticsTimeRange): Promise<AnalyticsQueryResult> {
    assertRange(range);
    const summary = emptySummary();
    for (const entry of await this.segmentEntries()) {
      const parsed = await this.readSegment(entry);
      if (!parsed) { summary.corruptRecords += 1; continue; }
      if (parsed.timestampMs < range.fromMs || parsed.timestampMs >= range.toMs) continue;
      addEvent(summary, parsed);
    }
    return Object.freeze({ range: Object.freeze({ ...range }), summary: freezeSummary(summary), sizeBytes: await this.sizeBytes() });
  }

  public async sizeBytes(): Promise<number> { return directorySize(this.options.root); }

  public async clearRange(range: AnalyticsTimeRange): Promise<AnalyticsCleanupResult> {
    assertRange(range);
    return this.cleanup("range", (event) => event.timestampMs >= range.fromMs && event.timestampMs < range.toMs);
  }

  public async clearAll(): Promise<AnalyticsCleanupResult> { return this.cleanup("all", () => true); }

  private async cleanup(kind: "range" | "all", matches: (event: AnalyticsEvent) => boolean): Promise<AnalyticsCleanupResult> {
    let deletedRecords = 0;
    let retainedRecords = 0;
    let deletedBytes = 0;
    let corruptRecords = 0;
    await this.mutate(async () => {
      for (const entry of await this.segmentEntries()) {
        const parsed = await this.readSegment(entry);
        if (!parsed) { corruptRecords += 1; continue; }
        if (!matches(parsed)) { retainedRecords += 1; continue; }
        const path = join(this.segments, entry);
        const bytes = (await stat(path)).size;
        await rm(path, { force: false });
        deletedRecords += 1;
        deletedBytes += bytes;
      }
      // Complete cleanup includes quarantined invalid Analytics segments, but
      // never reaches Pi JSONL or any other AILI directory.
      if (kind === "all") {
        deletedBytes += await directorySize(this.quarantine);
        await rm(this.quarantine, { recursive: true, force: true });
      }
    });
    return Object.freeze({ kind, deletedRecords, retainedRecords, deletedBytes, corruptRecords });
  }

  private async segmentEntries(): Promise<string[]> {
    try {
      const entries = await readdir(this.segments, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile() && /^[A-Za-z0-9_-]{8,128}\.json$/.test(entry.name)).map((entry) => entry.name).sort();
    } catch (error) {
      if (isCode(error, "ENOENT")) return [];
      throw error;
    }
  }

  private async readSegment(entry: string): Promise<AnalyticsEvent | undefined> {
    const path = join(this.segments, entry);
    try {
      const frame = await readFile(path, "utf8");
      if (Buffer.byteLength(frame, "utf8") > MAX_EVENT_BYTES) throw new Error("oversized");
      return decodeAnalyticsEvent(JSON.parse(frame));
    } catch {
      await this.quarantineSegment(path, entry);
      return undefined;
    }
  }

  private async quarantineSegment(path: string, entry: string): Promise<void> {
    await mkdir(this.quarantine, { recursive: true, mode: 0o700 });
    const destination = join(this.quarantine, `${Date.now()}-${basename(entry)}`);
    try { await rename(path, destination); } catch (error) { if (!isCode(error, "ENOENT")) throw error; }
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

/** Random scopes are process-local mappings and are never added to model context. */
export class AnalyticsScopeRegistry {
  private readonly scopes = new Map<string, string>();
  public constructor(private readonly createScope: () => string = createOpaqueAnalyticsScope) {}
  public scopeForSession(sessionId: string): string {
    if (typeof sessionId !== "string" || !sessionId.trim()) throw new Error("Analytics session scope requires a session");
    let scope = this.scopes.get(sessionId);
    if (!scope) { scope = this.createScope(); this.scopes.set(sessionId, scope); }
    return scope;
  }
  public release(sessionId: string): void { this.scopes.delete(sessionId); }
  public clear(): void { this.scopes.clear(); }
}

export function createOpaqueAnalyticsScope(): string { return randomBytes(24).toString("base64url"); }

export function normalizeAnalyticsEvent(input: AnalyticsEventInput | Record<string, unknown>): AnalyticsEvent {
  if (!isRecord(input)) throw new Error("Analytics event must be an object");
  for (const key of Object.keys(input)) if (!ALLOWED_FIELDS.has(key)) throw new Error("Analytics event contains a forbidden or unsupported field");
  const scope = boundedScope(input.scope);
  const kind = enumValue(input.kind, KINDS, "kind");
  const event: AnalyticsEvent = {
    formatVersion: FORMAT_VERSION,
    timestampMs: boundedNumber(input.timestampMs, "timestampMs"),
    scope,
    kind,
    ...optionalNumber(input.durationMs, "durationMs"),
    ...optionalDimension(input.provider, "provider"),
    ...optionalDimension(input.model, "model"),
    ...optionalDimension(input.tool, "tool"),
    ...optionalDimension(input.skill, "skill"),
    ...optionalDimension(input.agent, "agent"),
    ...optionalDimension(input.mcp, "mcp"),
    ...optionalEnum(input.outcome, OUTCOMES, "outcome"),
    ...optionalEnum(input.errorCategory, ERROR_CATEGORIES, "errorCategory"),
    ...optionalNumber(input.responseCount, "responseCount"),
    ...optionalNumber(input.llmCallCount, "llmCallCount"),
    ...optionalNumber(input.inputTokens, "inputTokens"),
    ...optionalNumber(input.outputTokens, "outputTokens"),
    ...optionalNumber(input.costMicros, "costMicros"),
  };
  return Object.freeze(event);
}

export function decodeAnalyticsEvent(input: unknown): AnalyticsEvent {
  if (!isRecord(input) || input.formatVersion !== FORMAT_VERSION) throw new Error("Analytics segment uses an unsupported schema");
  const { formatVersion: _formatVersion, ...event } = input;
  return normalizeAnalyticsEvent(event);
}

function emptySummary(): AnalyticsSummary { return { records: 0, responseCount: 0, llmCallCount: 0, toolCount: 0, errorCount: 0, durationMs: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, dimensions: {}, corruptRecords: 0, truncatedDimensions: false }; }
function addEvent(summary: AnalyticsSummary, event: AnalyticsEvent): void {
  summary.records += 1;
  summary.responseCount += event.responseCount ?? (event.kind === "response" ? 1 : 0);
  summary.llmCallCount += event.llmCallCount ?? (event.kind === "llm_call" ? 1 : 0);
  summary.toolCount += event.kind === "tool" ? 1 : 0;
  summary.errorCount += event.outcome === "error" || event.kind === "provider_error" ? 1 : 0;
  summary.durationMs += event.durationMs ?? 0;
  summary.inputTokens += event.inputTokens ?? 0;
  summary.outputTokens += event.outputTokens ?? 0;
  summary.costMicros += event.costMicros ?? 0;
  for (const value of [event.provider, event.model, event.tool, event.skill, event.agent, event.mcp, event.errorCategory]) {
    if (!value) continue;
    if (!(value in summary.dimensions) && Object.keys(summary.dimensions).length >= MAX_DIMENSIONS_PER_QUERY) { summary.truncatedDimensions = true; continue; }
    summary.dimensions[value] = (summary.dimensions[value] ?? 0) + 1;
  }
}
function freezeSummary(summary: AnalyticsSummary): AnalyticsSummary { return Object.freeze({ ...summary, dimensions: Object.freeze({ ...summary.dimensions }) }); }
function assertRange(range: AnalyticsTimeRange): void { if (!isRecord(range) || !Number.isSafeInteger(range.fromMs) || !Number.isSafeInteger(range.toMs) || range.fromMs < 0 || range.toMs <= range.fromMs) throw new Error("Analytics time range is invalid"); }
function boundedScope(value: unknown): string { if (typeof value !== "string" || !SAFE_SCOPE.test(value)) throw new Error("Analytics scope is invalid"); return value; }
function boundedNumber(value: unknown, name: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`Analytics ${name} is invalid`); return value as number; }
function optionalNumber(value: unknown, name: string): Record<string, number> { return value === undefined ? {} : { [name]: boundedNumber(value, name) }; }
function dimension(value: unknown, name: string): string { if (typeof value !== "string") throw new Error(`Analytics ${name} is invalid`); const normalized = value.trim().toLowerCase(); if (!normalized || normalized.length > MAX_DIMENSION_LENGTH || !SAFE_DIMENSION.test(normalized)) throw new Error(`Analytics ${name} is invalid`); return normalized; }
function optionalDimension(value: unknown, name: string): Record<string, string> { return value === undefined ? {} : { [name]: dimension(value, name) }; }
function enumValue<T extends readonly string[]>(value: unknown, choices: T, name: string): T[number] { if (typeof value !== "string" || !choices.includes(value)) throw new Error(`Analytics ${name} is invalid`); return value as T[number]; }
function optionalEnum<T extends readonly string[]>(value: unknown, choices: T, name: string): Record<string, T[number]> { return value === undefined ? {} : { [name]: enumValue(value, choices, name) }; }
function safeSegmentId(value: string): string { if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) throw new Error("Analytics segment identifier is invalid"); return value; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isCode(error: unknown, code: string): boolean { return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code; }
async function directorySize(path: string): Promise<number> { try { const entries = await readdir(path, { withFileTypes: true }); let total = 0; for (const entry of entries) { const item = join(path, entry.name); if (entry.isDirectory()) total += await directorySize(item); else if (entry.isFile()) total += (await stat(item)).size; } return total; } catch (error) { if (isCode(error, "ENOENT")) return 0; throw error; } }
