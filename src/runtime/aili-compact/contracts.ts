import { createHash } from "node:crypto";

export const AILI_COMPACT_SCHEMA_V1 = "aili.compact.tx.v1" as const;
export const AILI_COMPACT_SCHEMA_V2 = "aili.compact.tx.v2" as const;
export const AILI_COMPACT_SCHEMA = AILI_COMPACT_SCHEMA_V2;
export const AILI_COMPACT_ENTRY = "aili-compact" as const;

export type CompactTransactionSchema = typeof AILI_COMPACT_SCHEMA_V1 | typeof AILI_COMPACT_SCHEMA_V2;
export type CompactTransactionKind = "compact" | "decompress" | "prune" | "cool" | "control";
export type CompactMode = "range" | "message";
export type CompactGeneration = "young" | "old";
export type CompactDeactivationReason = "decompress" | "recompress" | "nested" | "gc" | "epoch" | "restore-all";
export type CompactControl =
  | "on"
  | "off"
  | "restore-all"
  | "panel-on"
  | "panel-off"
  | "manual-on"
  | "manual-off"
  | "manual-trigger"
  | "manual-clear"
  | "decompress"
  | "recompress";

export interface CompactBlock {
  id: string;
  kind: "semantic" | "prune" | "cool";
  epochId: string;
  sourceEntryIds: string[];
  sourceDigest: string;
  summary: string;
  active: boolean;
  stub?: string;
  mode?: CompactMode;
  topic?: string;
  batchTopic?: string;
  anchorEntryId?: string;
  runId?: string;
  childBlockIds?: string[];
  generation?: CompactGeneration;
  survivedCount?: number;
  age?: number;
  deactivationReason?: CompactDeactivationReason;
  legacy?: boolean;
  queryOnly?: boolean;
}

export interface CompactManualTrigger {
  id: string;
  turnId: string;
  focusHash?: string;
}

export interface CompactPolicyDecision {
  strategy: "cool" | "dedupe" | "purge-error";
  sourceEntryIds: string[];
}

export interface CompactLifecycleUpdate {
  blockId: string;
  /** A provider-free GC replacement; it may only shorten an existing summary. */
  summary?: string;
  generation?: CompactGeneration;
  survivedCount?: number;
  age?: number;
  active?: boolean;
  deactivationReason?: CompactDeactivationReason;
}

export interface CompactTransaction {
  schema: CompactTransactionSchema;
  id: string;
  kind: CompactTransactionKind;
  epochId: string;
  sourceEntryIds?: string[];
  sourceDigest?: string;
  blocks?: CompactBlock[];
  deactivateBlockIds?: string[];
  reactivateBlockIds?: string[];
  control?: CompactControl;
  manualTrigger?: CompactManualTrigger;
  consumeManualTriggerId?: string;
  policy?: CompactPolicyDecision;
  lifecycleUpdates?: CompactLifecycleUpdate[];
}

export interface CompactState {
  epochId: string;
  enabled: boolean;
  autoCooling: boolean;
  manualMode: boolean;
  cachePanel: boolean;
  hasSessionControl: boolean;
  hasAutoCoolingControl: boolean;
  hasManualControl: boolean;
  hasPanelControl: boolean;
  pendingManualTrigger?: CompactManualTrigger;
  blocks: ReadonlyMap<string, CompactBlock>;
  policyDecisions: readonly CompactPolicyDecision[];
  /** Accepted transactions replayed on the selected current branch. */
  transactionCount?: number;
  diagnostics: readonly string[];
}

export interface SessionLikeEntry {
  id: string;
  type: string;
  message?: unknown;
  customType?: string;
  data?: unknown;
  content?: unknown;
  details?: unknown;
}

export function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isCompactTransaction(value: unknown): value is CompactTransaction {
  if (!isRecord(value) || !isCompactSchema(value.schema) || !isBoundedString(value.id, 256)) return false;
  const schema = value.schema;
  if (!isCompactKind(value.kind) || !isBoundedString(value.epochId, 256)) return false;
  if (!isOptionalStringArray(value.sourceEntryIds, 256) || (value.sourceDigest !== undefined && !isBoundedString(value.sourceDigest, 128))) return false;
  if (value.blocks !== undefined && (!Array.isArray(value.blocks) || value.blocks.length > 16 || !value.blocks.every((block) => isCompactBlock(block, schema)))) return false;
  if (!isOptionalStringArray(value.deactivateBlockIds, 16) || !isOptionalStringArray(value.reactivateBlockIds, 16)) return false;
  if (value.control !== undefined && !isCompactControl(value.control)) return false;
  if (value.manualTrigger !== undefined && !isManualTrigger(value.manualTrigger)) return false;
  if (value.consumeManualTriggerId !== undefined && !isBoundedString(value.consumeManualTriggerId, 256)) return false;
  if (value.policy !== undefined && !isPolicyDecision(value.policy)) return false;
  if (value.lifecycleUpdates !== undefined && (!Array.isArray(value.lifecycleUpdates) || value.lifecycleUpdates.length > 64 || !value.lifecycleUpdates.every(isLifecycleUpdate))) return false;
  if (!hasValidPayloadRelation(value)) return false;
  if (schema === AILI_COMPACT_SCHEMA_V1) {
    return value.reactivateBlockIds === undefined
      && value.manualTrigger === undefined
      && value.consumeManualTriggerId === undefined
      && value.policy === undefined
      && value.lifecycleUpdates === undefined;
  }
  return true;
}

function isCompactSchema(value: unknown): value is CompactTransactionSchema {
  return value === AILI_COMPACT_SCHEMA_V1 || value === AILI_COMPACT_SCHEMA_V2;
}

function isCompactKind(value: unknown): value is CompactTransactionKind {
  return value === "compact" || value === "decompress" || value === "prune" || value === "cool" || value === "control";
}

function hasValidPayloadRelation(value: Record<string, unknown>): boolean {
  const blocks = Array.isArray(value.blocks) ? value.blocks : [];
  if (value.kind === "compact" && blocks.some((block) => !isRecord(block) || block.kind !== "semantic")) return false;
  if (value.kind === "prune" && blocks.some((block) => !isRecord(block) || block.kind !== "prune")) return false;
  if (value.kind === "cool" && blocks.some((block) => !isRecord(block) || block.kind !== "cool")) return false;
  if ((value.kind === "control" || value.kind === "decompress") && blocks.length > 0) return false;
  if (value.kind !== "control" && value.control !== undefined) return false;
  if (value.kind === "decompress" && (!Array.isArray(value.deactivateBlockIds) || value.deactivateBlockIds.length === 0)) return false;
  if (value.kind === "control" && value.deactivateBlockIds !== undefined && value.control !== "decompress" && value.control !== "restore-all" && value.control !== "recompress") return false;
  if (value.policy !== undefined && value.kind !== "cool" && value.kind !== "control") return false;
  if (value.reactivateBlockIds !== undefined && value.kind !== "decompress" && !(value.kind === "control" && (value.control === "recompress" || value.control === "decompress"))) return false;
  if (value.manualTrigger !== undefined && !(value.kind === "control" && value.control === "manual-trigger")) return false;
  if (value.lifecycleUpdates !== undefined && value.kind !== "control") return false;
  return true;
}

function isCompactControl(value: unknown): value is CompactControl {
  return value === "on" || value === "off" || value === "restore-all"
    || value === "panel-on" || value === "panel-off"
    || value === "manual-on" || value === "manual-off"
    || value === "manual-trigger" || value === "manual-clear"
    || value === "decompress" || value === "recompress";
}

function isCompactBlock(value: unknown, schema: CompactTransactionSchema): value is CompactBlock {
  if (!isRecord(value)
    || !isBoundedString(value.id, 256)
    || (value.kind !== "semantic" && value.kind !== "prune" && value.kind !== "cool")
    || !isBoundedString(value.epochId, 256)
    || !isStringArray(value.sourceEntryIds, 256) || value.sourceEntryIds.length === 0
    || !isBoundedString(value.sourceDigest, 128)
    || typeof value.summary !== "string" || value.summary.length > 12_000
    || typeof value.active !== "boolean"
    || (value.stub !== undefined && (typeof value.stub !== "string" || value.stub.length > 4_000))
    || (value.kind === "cool" && typeof value.stub !== "string")) return false;

  if (schema === AILI_COMPACT_SCHEMA_V1) return true;
  if (value.mode !== undefined && value.mode !== "range" && value.mode !== "message") return false;
  if (value.topic !== undefined && (typeof value.topic !== "string" || value.topic.length > 200)) return false;
  if (value.batchTopic !== undefined && (typeof value.batchTopic !== "string" || value.batchTopic.length > 200)) return false;
  if (value.anchorEntryId !== undefined && !isBoundedString(value.anchorEntryId, 256)) return false;
  if (value.runId !== undefined && !isBoundedString(value.runId, 256)) return false;
  if (!isOptionalStringArray(value.childBlockIds, 64)) return false;
  if (value.generation !== undefined && value.generation !== "young" && value.generation !== "old") return false;
  if (value.survivedCount !== undefined && !isNonNegativeInteger(value.survivedCount)) return false;
  if (value.age !== undefined && !isNonNegativeInteger(value.age)) return false;
  if (value.deactivationReason !== undefined && !isDeactivationReason(value.deactivationReason)) return false;
  if (value.legacy !== undefined && typeof value.legacy !== "boolean") return false;
  if (value.queryOnly !== undefined && typeof value.queryOnly !== "boolean") return false;
  if (value.kind === "semantic") {
    return (value.mode === "range" || value.mode === "message")
      && typeof value.topic === "string" && value.topic.length > 0
      && typeof value.batchTopic === "string" && value.batchTopic.length > 0
      && typeof value.anchorEntryId === "string" && value.anchorEntryId.length > 0
      && typeof value.runId === "string" && value.runId.length > 0
      && Array.isArray(value.childBlockIds)
      && (value.generation === "young" || value.generation === "old")
      && isNonNegativeInteger(value.survivedCount)
      && isNonNegativeInteger(value.age);
  }
  return true;
}

function isManualTrigger(value: unknown): value is CompactManualTrigger {
  return isRecord(value)
    && isBoundedString(value.id, 256)
    && isBoundedString(value.turnId, 256)
    && (value.focusHash === undefined || isBoundedString(value.focusHash, 128));
}

function isPolicyDecision(value: unknown): value is CompactPolicyDecision {
  return isRecord(value)
    && (value.strategy === "cool" || value.strategy === "dedupe" || value.strategy === "purge-error")
    && isStringArray(value.sourceEntryIds, 256) && value.sourceEntryIds.length > 0;
}

function isLifecycleUpdate(value: unknown): value is CompactLifecycleUpdate {
  if (!isRecord(value) || !isBoundedString(value.blockId, 256)) return false;
  if (value.summary !== undefined && !isBoundedString(value.summary, 10_000)) return false;
  if (value.generation !== undefined && value.generation !== "young" && value.generation !== "old") return false;
  if (value.survivedCount !== undefined && !isNonNegativeInteger(value.survivedCount)) return false;
  if (value.age !== undefined && !isNonNegativeInteger(value.age)) return false;
  if (value.active !== undefined && typeof value.active !== "boolean") return false;
  return value.deactivationReason === undefined || isDeactivationReason(value.deactivationReason);
}

function isDeactivationReason(value: unknown): value is CompactDeactivationReason {
  return value === "decompress" || value === "recompress" || value === "nested"
    || value === "gc" || value === "epoch" || value === "restore-all";
}

function isOptionalStringArray(value: unknown, maxItems: number): boolean {
  return value === undefined || isStringArray(value, maxItems);
}

function isStringArray(value: unknown, maxItems: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => isBoundedString(item, 256))
    && new Set(value).size === value.length;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).join("\n");
  if (!isRecord(value)) return "";
  if (typeof value.text === "string") return value.text;
  if ("content" in value) return extractText(value.content);
  return "";
}

export function sourceDigest(entries: readonly SessionLikeEntry[], ids: readonly string[]): string {
  const wanted = new Set(ids);
  return digest(entries
    .filter((entry) => wanted.has(entry.id))
    .map((entry) => ({ id: entry.id, type: entry.type, message: entry.message })));
}
