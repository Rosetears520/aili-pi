import {
  anthropicMessagesApi,
  azureOpenAIResponsesApi,
  googleGenerativeAIApi,
  googleVertexApi,
  openAICodexResponsesApi,
  openAICompletionsApi,
  openAIResponsesApi,
} from "@earendil-works/pi-ai/compat";
import type { Context, Model, ProviderStreams } from "@earendil-works/pi-ai";
import { canonicalJson, digest } from "./contracts.js";
import type { ResolvedTokenBoundProfile, TokenSurface } from "./safe-planning.js";

export const PROVIDER_ECONOMICS_SURFACE_VERSION = "aili.provider-economics-surface.v1" as const;

export const V3_PROVIDER_ECONOMICS_SURFACE_KINDS = [
  "source",
  "replacement",
  "discovery-status",
  "compression-suffix",
  "model-output",
  "compression-tool-call",
  "compression-tool-result",
  "quality-evaluation",
] as const;

export type V3ProviderEconomicsSurfaceKind = typeof V3_PROVIDER_ECONOMICS_SURFACE_KINDS[number];

/** An immutable measurement of one exact provider-converter message payload. */
export interface ProviderSerializedSurface extends TokenSurface {
  payloadDigest: string;
}

export interface ProviderEconomicsSurfaceRequest {
  kind: V3ProviderEconomicsSurfaceKind;
  /** Exact logical surface supplied for binding/diagnostics; adapters must not mutate it. */
  logicalValue: unknown;
}

/**
 * Synchronous pricing boundary consumed by economics. Provider conversion may be
 * asynchronous, but it must finish and freeze surfaces before this adapter is used.
 */
export interface ProviderEconomicsSurfaceAdapter {
  version: string;
  profileKey: string;
  surfaceFor(request: ProviderEconomicsSurfaceRequest): ProviderSerializedSurface | undefined;
}

export interface ProviderEconomicsSurfaceAdapterInput {
  version?: string;
  profileKey: string;
  serialize(request: ProviderEconomicsSurfaceRequest): ProviderSerializedSurface | undefined;
}

export function createProviderEconomicsSurfaceAdapter(
  input: ProviderEconomicsSurfaceAdapterInput,
): ProviderEconomicsSurfaceAdapter {
  if (!bounded(input.version ?? PROVIDER_ECONOMICS_SURFACE_VERSION, 256)
    || !bounded(input.profileKey, 1_024)
    || typeof input.serialize !== "function") {
    throw new Error("invalid-provider-economics-adapter");
  }
  return Object.freeze({
    version: input.version ?? PROVIDER_ECONOMICS_SURFACE_VERSION,
    profileKey: input.profileKey,
    surfaceFor: input.serialize,
  });
}

export interface PreSerializedProviderEconomicsSurfaceAdapterInput {
  version?: string;
  profileKey: string;
  surfaces: Readonly<Partial<Record<V3ProviderEconomicsSurfaceKind, {
    logicalValue: unknown;
    surface: ProviderSerializedSurface;
  }>>>;
}

/** Freezes already-converted provider surfaces for the synchronous benefit gate. */
export function createPreSerializedProviderEconomicsSurfaceAdapter(
  input: PreSerializedProviderEconomicsSurfaceAdapterInput,
): ProviderEconomicsSurfaceAdapter {
  const snapshot = new Map<V3ProviderEconomicsSurfaceKind, {
    logicalDigest: string;
    surface: ProviderSerializedSurface;
  }>();
  for (const kind of V3_PROVIDER_ECONOMICS_SURFACE_KINDS) {
    const candidate = input.surfaces[kind];
    if (candidate !== undefined) snapshot.set(kind, {
      logicalDigest: digest(candidate.logicalValue),
      surface: freezeProviderSerializedSurface(candidate.surface),
    });
  }
  return createProviderEconomicsSurfaceAdapter({
    ...(input.version ? { version: input.version } : {}),
    profileKey: input.profileKey,
    serialize: ({ kind, logicalValue }) => {
      const bound = snapshot.get(kind);
      return bound?.logicalDigest === digest(logicalValue) ? bound.surface : undefined;
    },
  });
}

export type PiProviderSerializerTarget =
  | {
    api: "openai-completions";
    model: Model<"openai-completions">;
  }
  | {
    api: "openai-responses" | "azure-openai-responses" | "openai-codex-responses";
    model: Model<"openai-responses" | "azure-openai-responses" | "openai-codex-responses">;
  }
  | {
    api: "google-generative-ai" | "google-vertex";
    model: Model<"google-generative-ai" | "google-vertex">;
  }
  | {
    api: "anthropic-messages";
    model: Model<"anthropic-messages">;
  };

export interface PiProviderEconomicsContextSurface {
  /** Exact economics input value to which this converted payload is bound. */
  logicalValue: unknown;
  context: Context;
  /**
   * Selects one exact component after a complete protocol-valid context has
   * passed through the converter (for example, one tool call or its result).
   * The result must be an ordered identity-subsequence of converter output.
   */
  select?: (providerMessages: readonly unknown[]) => readonly unknown[] | undefined;
}

export interface PiProviderEconomicsSurfaceAdapterInput {
  profile: ResolvedTokenBoundProfile;
  target: PiProviderSerializerTarget;
  contexts: Readonly<Partial<Record<V3ProviderEconomicsSurfaceKind, PiProviderEconomicsContextSurface>>>;
  version?: string;
}

/**
 * Runs official Pi 0.82.1 provider converters locally and freezes their output.
 * Anthropic payload capture injects a no-network client and stops immediately
 * after `onPayload`; this function never sends a provider request.
 */
export async function createPiProviderEconomicsSurfaceAdapter(
  input: PiProviderEconomicsSurfaceAdapterInput,
): Promise<ProviderEconomicsSurfaceAdapter> {
  if (input.target.model.provider !== input.profile.providerId
    || input.target.model.id !== input.profile.modelId
    || input.target.model.api !== input.target.api) {
    throw new Error("provider-economics-profile-mismatch");
  }
  const entries = await Promise.all(V3_PROVIDER_ECONOMICS_SURFACE_KINDS.map(async (kind) => {
    const request = input.contexts[kind];
    if (!request) return undefined;
    const converted = await serializePiProviderMessages(input.target, request.context);
    const selected = request.select ? request.select(converted) : converted;
    if (!selected || selected.length === 0 || !isOrderedIdentitySubsequence(converted, selected)) {
      throw new Error(`provider-economics-invalid-selection:${kind}`);
    }
    return [kind, {
      logicalValue: request.logicalValue,
      surface: providerSerializedSurface(selected),
    }] as const;
  }));
  const surfaces: Partial<Record<V3ProviderEconomicsSurfaceKind, {
    logicalValue: unknown;
    surface: ProviderSerializedSurface;
  }>> = {};
  for (const entry of entries) {
    if (entry) surfaces[entry[0]] = entry[1];
  }
  return createPreSerializedProviderEconomicsSurfaceAdapter({
    ...(input.version ? { version: input.version } : {}),
    profileKey: input.profile.profileKey,
    surfaces,
  });
}

/**
 * Produces the exact message array emitted by the selected official provider.
 * The provider's `onPayload` hook runs immediately before its transport call;
 * throwing a sentinel there captures the fully built payload and proves that
 * this pricing path cannot reach the network.
 */
export async function serializePiProviderMessages(
  target: PiProviderSerializerTarget,
  context: Context,
): Promise<readonly unknown[]> {
  const payload = await captureProviderPayload(target, context);
  const messages = providerPayloadMessages(target.api, payload);
  if (!messages) throw new Error("provider-economics-converter-did-not-return-messages");
  return messages;
}

/** Canonicalizes a real provider payload now so later mutation cannot narrow it. */
export function providerSerializedSurface(payload: readonly unknown[]): ProviderSerializedSurface {
  if (!Array.isArray(payload) || payload.length === 0) throw new Error("provider-economics-empty-payload");
  const serialized = canonicalJson(payload);
  return Object.freeze({
    utf8Bytes: Buffer.byteLength(serialized, "utf8"),
    messageCount: payload.length,
    structuredToolPartCount: countProviderToolParts(payload),
    payloadDigest: digest(payload),
  });
}

export function isProviderSerializedSurface(value: unknown): value is ProviderSerializedSurface {
  if (!value || typeof value !== "object") return false;
  const surface = value as Partial<ProviderSerializedSurface>;
  return nonNegativeSafeInteger(surface.utf8Bytes)
    && nonNegativeSafeInteger(surface.messageCount)
    && nonNegativeSafeInteger(surface.structuredToolPartCount)
    && (surface.saturated === undefined || typeof surface.saturated === "boolean")
    && typeof surface.payloadDigest === "string"
    && /^[0-9a-f]{64}$/i.test(surface.payloadDigest);
}

function freezeProviderSerializedSurface(surface: ProviderSerializedSurface): ProviderSerializedSurface {
  if (!isProviderSerializedSurface(surface)) throw new Error("invalid-provider-serialized-surface");
  return Object.freeze({
    utf8Bytes: surface.utf8Bytes,
    messageCount: surface.messageCount,
    structuredToolPartCount: surface.structuredToolPartCount,
    ...(surface.saturated === true ? { saturated: true } : {}),
    payloadDigest: surface.payloadDigest,
  });
}

async function captureProviderPayload(
  target: PiProviderSerializerTarget,
  context: Context,
): Promise<unknown> {
  const stopMarker = "aili-provider-economics-stop-before-network";
  let payload: unknown;
  const stream = providerStreams(target.api).stream(target.model, context, {
    apiKey: captureApiKey(target.api),
    maxRetries: 0,
    onPayload(providerPayload) {
      payload = providerPayload;
      throw new Error(stopMarker);
    },
  });
  const final = await stream.result();
  if (final.stopReason !== "error" || final.errorMessage !== stopMarker) {
    throw new Error("provider-economics-network-guard-failed");
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("provider-economics-payload-unavailable");
  }
  return payload;
}

function providerStreams(api: PiProviderSerializerTarget["api"]): ProviderStreams {
  switch (api) {
    case "openai-completions": return openAICompletionsApi();
    case "openai-responses": return openAIResponsesApi();
    case "azure-openai-responses": return azureOpenAIResponsesApi();
    case "openai-codex-responses": return openAICodexResponsesApi();
    case "google-generative-ai": return googleGenerativeAIApi();
    case "google-vertex": return googleVertexApi();
    case "anthropic-messages": return anthropicMessagesApi();
  }
}

function providerPayloadMessages(
  api: PiProviderSerializerTarget["api"],
  payload: unknown,
): readonly unknown[] | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const candidate = api === "google-generative-ai" || api === "google-vertex"
    ? record.contents
    : api === "openai-responses" || api === "azure-openai-responses" || api === "openai-codex-responses"
      ? record.input
      : record.messages;
  return Array.isArray(candidate) && candidate.length > 0 ? candidate : undefined;
}

function captureApiKey(api: PiProviderSerializerTarget["api"]): string {
  if (api !== "openai-codex-responses") return "aili-provider-economics-no-network";
  const header = Buffer.from(canonicalJson({ alg: "none", typ: "JWT" }), "utf8").toString("base64url");
  const payload = Buffer.from(canonicalJson({
    "https://api.openai.com/auth": { chatgpt_account_id: "aili-provider-economics" },
  }), "utf8").toString("base64url");
  return `${header}.${payload}.capture`;
}

function countProviderToolParts(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countProviderToolParts(item), 0);
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  const own = isProviderToolPart(record) ? 1 : 0;
  return own + Object.entries(record).reduce((sum, [key, item]) => {
    if (own === 1 && (key === "functionCall" || key === "functionResponse")) return sum;
    return sum + countProviderToolParts(item);
  }, 0);
}

function isProviderToolPart(record: Record<string, unknown>): boolean {
  if (record.role === "tool" || record.role === "toolResult") return true;
  if (record.functionCall && typeof record.functionCall === "object") return true;
  if (record.functionResponse && typeof record.functionResponse === "object") return true;
  if (record.type === "function" && record.function && typeof record.function === "object") return true;
  return record.type === "toolCall"
    || record.type === "tool_call"
    || record.type === "function_call"
    || record.type === "function_call_output"
    || record.type === "tool_use"
    || record.type === "tool_result";
}

function isOrderedIdentitySubsequence(
  complete: readonly unknown[],
  selected: readonly unknown[],
): boolean {
  let completeIndex = 0;
  for (const item of selected) {
    while (completeIndex < complete.length && complete[completeIndex] !== item) completeIndex += 1;
    if (completeIndex === complete.length) return false;
    completeIndex += 1;
  }
  return true;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
