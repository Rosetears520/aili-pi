import { digest } from "./contracts.js";
import type { RecommendedSafeRange } from "./safe-planning.js";

export const AILI_COMPACT_PROVIDER_SUFFIX = "aili-compact-provider-suffix" as const;
export const PROVIDER_SUFFIX_VERSION = "aili.provider-suffix.v1" as const;
export const MAX_PROVIDER_SUFFIX_CHARS = 2_048;
export const MAX_PROVIDER_SUFFIX_TOKENS = 512;

export interface ProviderSuffixInput {
  planningEnabled: boolean;
  pressureStage: "NORMAL" | "PRESSURE" | "FORCE_SEMANTIC" | "CHECKPOINT_REQUIRED" | "OVERFLOW_RECOVERY" | "Unverified";
  headroomTokens?: number;
  headroomSource: "observed" | "fallback" | "Unverified";
  catalogId: string;
  catalogScopeDigest: string;
  safeRanges: readonly Pick<RecommendedSafeRange, "endRef" | "rangeId" | "startRef">[];
  eligibleBlockRefs?: readonly string[];
  targetTier?: "T1" | "T2" | "T3";
  allowedActions: readonly ("compress" | "decompress" | "recompress" | "checkpoint")[];
  checkpointState: string;
}

export interface ProviderSuffixResult {
  content: string;
  fingerprint: string;
  estimatedTokens: number;
  statusOnly: boolean;
  message: {
    role: "custom";
    customType: typeof AILI_COMPACT_PROVIDER_SUFFIX;
    content: string;
    display: false;
    timestamp: 0;
  };
}

/** Builds one deterministic provider-only message. It never receives a Session ID or ref. */
export function buildProviderSuffix(input: ProviderSuffixInput): ProviderSuffixResult | undefined {
  if (!input.planningEnabled || input.pressureStage === "NORMAL"
    || (input.safeRanges.length === 0 && (input.eligibleBlockRefs?.length ?? 0) === 0 && input.allowedActions.length === 0)) return undefined;
  const base = [
    `version=${PROVIDER_SUFFIX_VERSION}`,
    `pressure=${safeToken(input.pressureStage)}`,
    `headroom=${validTokenCount(input.headroomTokens) ? input.headroomTokens : "Unverified"}`,
    `headroomSource=${safeToken(input.headroomSource)}`,
    `catalog=${safeDigest(input.catalogId)}`,
    `scope=${safeDigest(input.catalogScopeDigest)}`,
    `targetTier=${input.targetTier ?? "none"}`,
    `actions=${orderedActions(input.allowedActions).join(",") || "none"}`,
    `checkpoint=${safeToken(input.checkpointState)}`,
  ];
  const ranges = [...input.safeRanges]
    .filter((range) => /^r\d{6}$/.test(range.rangeId) && /^m\d{6}$/.test(range.startRef) && /^m\d{6}$/.test(range.endRef))
    .sort((left, right) => left.startRef.localeCompare(right.startRef) || left.endRef.localeCompare(right.endRef));
  const blocks = [...new Set(input.eligibleBlockRefs ?? [])].filter((ref) => /^b\d{6}$/.test(ref)).sort();
  let optional = [
    ...ranges.map((range) => `range=${range.rangeId}:${range.startRef}-${range.endRef}`),
    ...blocks.map((ref) => `block=${ref}`),
  ];
  let content = render(base, optional);
  while (optional.length > 0 && !withinBounds(content)) {
    optional = optional.slice(0, -1);
    content = render(base, optional);
  }
  let statusOnly = optional.length === 0 && (ranges.length > 0 || blocks.length > 0);
  if (!withinBounds(content)) {
    statusOnly = true;
    content = render(base.slice(0, 6), ["status=bounded"]);
  }
  if (!withinBounds(content)) return undefined;
  const fingerprint = digest(content);
  return {
    content,
    fingerprint,
    estimatedTokens: estimateProviderSuffixTokens(content),
    statusOnly,
    message: { role: "custom", customType: AILI_COMPACT_PROVIDER_SUFFIX, content, display: false, timestamp: 0 },
  };
}

export function estimateProviderSuffixTokens(content: string): number {
  if (!content) return 0;
  return Math.ceil(Buffer.byteLength(content, "utf8") / 4) + 8;
}

function render(base: readonly string[], optional: readonly string[]): string {
  return ["AILI Compact provider-only guidance", ...base, ...optional].join("\n");
}

function withinBounds(content: string): boolean {
  return content.length <= MAX_PROVIDER_SUFFIX_CHARS && estimateProviderSuffixTokens(content) <= MAX_PROVIDER_SUFFIX_TOKENS;
}

function validTokenCount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function safeToken(value: string): string {
  return /^[A-Za-z0-9._:-]{1,80}$/.test(value) ? value : "Unverified";
}

function safeDigest(value: string): string {
  return /^[a-f0-9]{64}$/i.test(value) ? value : "Unverified";
}

function orderedActions(values: ProviderSuffixInput["allowedActions"]): ProviderSuffixInput["allowedActions"] {
  const wanted = new Set(values);
  return (["compress", "decompress", "recompress", "checkpoint"] as const).filter((action) => wanted.has(action));
}
