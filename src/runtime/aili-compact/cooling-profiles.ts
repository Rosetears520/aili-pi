import { digest } from "./contracts.js";

export const TOOL_COOLING_PROFILE_VERSION = "aili.tool-cooling.v1" as const;
export type ToolCoolingProfileName = "retrieval" | "execution-evidence" | "mutation-evidence" | "protocol-control" | "unknown";

export interface ToolCoolingPolicy {
  profile: ToolCoolingProfileName;
  automatic: boolean;
  minObservedTurns: number;
  keepLatestEqual: boolean;
  maxStubChars: number;
}

export interface ToolCoolingOverride {
  toolName: string;
  profile?: Exclude<ToolCoolingProfileName, "unknown">;
  automatic?: boolean;
  minObservedTurns?: number;
  keepLatestEqual?: boolean;
  maxStubChars?: number;
}

export interface ResultObservationIdentity {
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  callEntryId: string;
  callId: string;
  toolName: string;
  resultEntryId: string;
  resultBodyDigest: string;
  providerInputIdentity: string;
  settledRequestId: string;
}

export interface ToolResultCoolingInput {
  identity: ResultObservationIdentity;
  isError: boolean;
  isComplete: boolean;
  hasBinaryOrSecret: boolean;
  inCurrentTurn: boolean;
  durableRefs?: readonly string[];
  observations: readonly { identity: ResultObservationIdentity; successful: boolean; assistantTurnId: string }[];
  resolution?: { resultIdentityDigest: string; assistantTurnId: string; status: "resolved" };
  latestEqualResultEntryId?: string;
  override?: ToolCoolingOverride;
}

export type ToolResultCoolingDecision = {
  eligible: true;
  profile: ToolCoolingProfileName;
  resultBodyDigest: string;
  stub: string;
  observationCount: number;
} | {
  eligible: false;
  profile: ToolCoolingProfileName;
  code: string;
  observationCount: number;
};

const DEFAULTS: Readonly<Record<ToolCoolingProfileName, ToolCoolingPolicy>> = Object.freeze({
  retrieval: Object.freeze({ profile: "retrieval", automatic: true, minObservedTurns: 2, keepLatestEqual: true, maxStubChars: 160 }),
  "execution-evidence": Object.freeze({ profile: "execution-evidence", automatic: true, minObservedTurns: 3, keepLatestEqual: true, maxStubChars: 160 }),
  "mutation-evidence": Object.freeze({ profile: "mutation-evidence", automatic: false, minObservedTurns: 3, keepLatestEqual: true, maxStubChars: 160 }),
  "protocol-control": Object.freeze({ profile: "protocol-control", automatic: false, minObservedTurns: Number.MAX_SAFE_INTEGER, keepLatestEqual: true, maxStubChars: 0 }),
  unknown: Object.freeze({ profile: "unknown", automatic: false, minObservedTurns: Number.MAX_SAFE_INTEGER, keepLatestEqual: true, maxStubChars: 0 }),
});

const RETRIEVAL = new Set(["read", "grep", "find", "ls", "web", "fetch", "get", "search", "web_search", "diagnostics"]);
const EXECUTION = new Set(["bash", "test", "build"]);
const MUTATION = new Set(["edit", "write", "fix", "apply", "apply_patch"]);

export function resolveToolCoolingPolicy(toolName: string, override?: ToolCoolingOverride): { policy: ToolCoolingPolicy; diagnostics: readonly string[] } {
  const normalized = normalizeToolName(toolName);
  const baseName = classifyTool(normalized);
  const base = DEFAULTS[baseName];
  const diagnostics: string[] = [];
  if (!override) return { policy: { ...base }, diagnostics };
  const overrideName = normalizeToolName(override.toolName);
  if (!overrideName || /[*?\[\]]/.test(override.toolName) || overrideName !== normalized) {
    return { policy: { ...base }, diagnostics: ["cooling-override-invalid-exact-name"] };
  }
  if (baseName === "protocol-control" || normalized.startsWith("aili_")) {
    return { policy: { ...DEFAULTS["protocol-control"] }, diagnostics: ["cooling-override-protocol-control"] };
  }
  const selected = override.profile ? DEFAULTS[override.profile] : base;
  const automatic = selected.profile === "mutation-evidence"
    ? override.automatic === true
    : selected.automatic && override.automatic !== false;
  const minObservedTurns = validPositive(override.minObservedTurns)
    ? Math.max(selected.minObservedTurns, override.minObservedTurns)
    : selected.minObservedTurns;
  const maxStubChars = validPositive(override.maxStubChars)
    ? Math.min(selected.maxStubChars, override.maxStubChars)
    : selected.maxStubChars;
  const keepLatestEqual = selected.keepLatestEqual || override.keepLatestEqual !== false;
  return { policy: { profile: selected.profile, automatic, minObservedTurns, keepLatestEqual, maxStubChars }, diagnostics };
}

export function evaluateToolResultCooling(input: ToolResultCoolingInput): ToolResultCoolingDecision {
  const { policy } = resolveToolCoolingPolicy(input.identity.toolName, input.override);
  const identityDigest = resultObservationIdentityDigest(input.identity);
  const observedTurns = new Set(input.observations
    .filter((observation) => observation.successful && sameObservedResult(input.identity, observation.identity))
    .map((observation) => observation.assistantTurnId));
  const observationCount = observedTurns.size;
  const reject = (code: string): ToolResultCoolingDecision => ({ eligible: false, profile: policy.profile, code, observationCount });
  if (!policy.automatic) return reject(`profile-${policy.profile}-keep-raw`);
  if (!input.isComplete) return reject("result-incomplete");
  if (input.hasBinaryOrSecret) return reject("result-protected-content");
  if (input.inCurrentTurn) return reject("result-current-turn");
  if ((input.durableRefs?.length ?? 0) > 0 || policy.profile === "protocol-control") return reject("result-durable-reference");
  if (policy.keepLatestEqual && input.latestEqualResultEntryId === input.identity.resultEntryId) return reject("result-latest-equal-kept");
  if (observationCount < policy.minObservedTurns) return reject("result-not-observed");
  if (input.isError) {
    if (observationCount < 5) return reject("error-grace-floor");
    if (!input.resolution || input.resolution.resultIdentityDigest !== identityDigest || input.resolution.status !== "resolved") return reject("error-unresolved");
  }
  const stub = `[tool-result cooled profile=${policy.profile} body=${input.identity.resultBodyDigest.slice(0, 16)} observations=${observationCount}]`;
  return { eligible: true, profile: policy.profile, resultBodyDigest: input.identity.resultBodyDigest, stub: stub.slice(0, policy.maxStubChars), observationCount };
}

export function resultObservationIdentityDigest(identity: ResultObservationIdentity): string {
  return digest({ ...identity, toolName: normalizeToolName(identity.toolName) });
}

function sameObservedResult(expected: ResultObservationIdentity, observed: ResultObservationIdentity): boolean {
  return expected.sessionId === observed.sessionId
    && expected.branchLeafId === observed.branchLeafId
    && expected.epochId === observed.epochId
    && expected.callEntryId === observed.callEntryId
    && expected.callId === observed.callId
    && normalizeToolName(expected.toolName) === normalizeToolName(observed.toolName)
    && expected.resultEntryId === observed.resultEntryId
    && expected.resultBodyDigest === observed.resultBodyDigest;
}

function classifyTool(name: string): ToolCoolingProfileName {
  if (!name || name.startsWith("aili_") || name === "task" || name === "hub" || name.includes("session") || name.includes("control")) return name ? "protocol-control" : "unknown";
  if (RETRIEVAL.has(name)) return "retrieval";
  if (EXECUTION.has(name)) return "execution-evidence";
  if (MUTATION.has(name)) return "mutation-evidence";
  return "unknown";
}

function normalizeToolName(value: string): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function validPositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
