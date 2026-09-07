import type {
  ExtensionContext,
  ExtensionFactory,
  SessionBeforeCompactEvent,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { hasApi, type Api, type Model } from "@earendil-works/pi-ai";
import { createCodexCompactExtension } from "@narumitw/pi-codex-compact/src/codex-compact.js";
import {
  latestCheckpoint,
  parseCheckpointDetails,
  type CodexCheckpointDetails,
} from "@narumitw/pi-codex-compact/src/checkpoint.js";
import {
  createCodexCompactSettingsRuntime,
  type CodexCompactSettings,
  type CodexCompactSettingsRuntime,
} from "@narumitw/pi-codex-compact/src/settings.js";
import {
  resolveCompactionRoute,
  type CompactionRoute,
} from "@narumitw/pi-codex-compact/src/model-api.js";
// AILI owns the retained upstream source adaptation. Do not hand-edit its
// generated dist: this source import is the canonical runtime owner.
import { createAcpExtension } from "../../upstream/billion-context-pi/src/index.js";

export const BILLION_CONTEXT_VERSION = "0.1.34";
export const CODEX_COMPACT_VERSION = "0.52.0";

export type ContextOwner = "codex-remote-v2" | "billion-context";

export interface ContextRouteIdentity {
  provider: string;
  api: string;
  modelId: string;
}

export interface FrozenContextRoute extends ContextRouteIdentity {
  readonly owner: ContextOwner;
  readonly key: string;
}

export function resolveContextOwner(identity: ContextRouteIdentity): ContextOwner {
  const provider = identity.provider.trim();
  const api = identity.api.trim();
  const modelId = identity.modelId.trim();
  if (!provider || !api || !modelId) throw new Error("Context routing requires canonical provider, API, and model identity");
  if (provider === "openai-codex") {
    if (api !== "openai-codex-responses") {
      throw new Error(`Contradictory openai-codex API identity: ${api}`);
    }
    return "codex-remote-v2";
  }
  if (api === "openai-codex-responses") {
    throw new Error(`Codex Responses API cannot be owned by provider ${provider}`);
  }
  return "billion-context";
}

export function freezeContextRoute(identity: ContextRouteIdentity): FrozenContextRoute {
  const provider = identity.provider.trim();
  const api = identity.api.trim();
  const modelId = identity.modelId.trim();
  const owner = resolveContextOwner({ provider, api, modelId });
  return Object.freeze({ provider, api, modelId, owner, key: `${provider}\u0000${api}\u0000${modelId}` });
}

export function modelRouteIdentity(model: Model<Api> | undefined): ContextRouteIdentity {
  if (!model || typeof model.provider !== "string" || typeof model.id !== "string" || typeof model.api !== "string") {
    throw new Error("Context routing requires an active canonical Pi model");
  }
  return { provider: model.provider, api: model.api, modelId: model.id };
}

/** Session-scoped turn routing. The first hook freezes ownership until agent_end. */
export class ContextTurnRouter {
  private active?: FrozenContextRoute;

  route(ctx: Pick<ExtensionContext, "model">): FrozenContextRoute {
    const observed = freezeContextRoute(modelRouteIdentity(ctx.model));
    if (!this.active) this.active = observed;
    if (this.active.key !== observed.key) {
      throw new Error("Canonical provider/API/model identity changed during the active turn");
    }
    return this.active;
  }

  endTurn(): void {
    this.active = undefined;
  }
}

export function isSupportedCodexModel(model: Model<Api> | undefined): boolean {
  return model?.provider === "openai-codex" && hasApi(model, "openai-codex-responses");
}

export function forcePiOwnedCodexRetry(
  runtime: ReturnType<typeof createCodexCompactSettingsRuntime>,
): CodexCompactSettingsRuntime {
  const withZeroRetry = <T extends { settings: { maxRetries: number } }>(state: T): T => ({
    ...state,
    settings: { ...state.settings, maxRetries: 0 },
  });
  return {
    get: () => withZeroRetry(runtime.get()),
    reload: async (signal) => withZeroRetry(await runtime.reload(signal)),
    update: async (patch, signal) => withZeroRetry(await runtime.update({ ...patch, maxRetries: 0 }, signal)),
    flush: () => runtime.flush(),
  };
}

interface ContextOwnershipSnapshot {
  readonly generation: number;
  readonly sessionId: string;
  readonly branchKey: string;
  readonly route: FrozenContextRoute;
  readonly protocol: Extract<CompactionRoute, { kind: "remote" }>["protocol"];
  readonly signal: AbortSignal;
}

type RemoteCompactionRoute = Extract<CompactionRoute, { kind: "remote" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// This is an in-memory ownership snapshot only; it is never persisted as a
// checkpoint binding or migration record.
function branchKey(ctx: ExtensionContext): string {
  return ctx.sessionManager.getBranch().map((entry) => entry.id).join("\u0000");
}

/**
 * Reuse Codex's parsed checkpoint and protocol route; this helper only compares
 * the AILI-frozen ownership identity and does not encode or project checkpoint
 * data itself.
 */
export function isCheckpointCompatibleWithFrozenRoute(
  details: CodexCheckpointDetails,
  route: FrozenContextRoute,
  compactionRoute: RemoteCompactionRoute,
): boolean {
  return details.provider === route.provider
    && details.api === route.api
    && details.api === compactionRoute.api
    && details.modelId === route.modelId
    && details.protocol === compactionRoute.protocol;
}

function checkpointCanBeReplayed(
  ctx: ExtensionContext,
  route: FrozenContextRoute,
  settings: CodexCompactSettings,
  entries?: readonly SessionEntry[],
): boolean {
  const checkpoint = latestCheckpoint(entries ?? ctx.sessionManager.getBranch());
  if (!checkpoint) return true;
  if (!settings.enabled) return false;
  const compactionRoute = resolveCompactionRoute(ctx.model, settings);
  return compactionRoute.kind === "remote"
    && isCheckpointCompatibleWithFrozenRoute(checkpoint.details, route, compactionRoute);
}

function returnedCheckpointMatchesRoute(
  result: unknown,
  ctx: ExtensionContext,
  route: FrozenContextRoute,
  settings: CodexCompactSettings,
): boolean {
  if (!isRecord(result) || !Object.hasOwn(result, "compaction")) return true;
  const compaction = result.compaction;
  if (!isRecord(compaction)) return false;
  const details = parseCheckpointDetails(compaction.details);
  const compactionRoute = resolveCompactionRoute(ctx.model, settings);
  return details !== undefined
    && compactionRoute.kind === "remote"
    && isCheckpointCompatibleWithFrozenRoute(details, route, compactionRoute);
}

export interface ProviderRoutedContextOptions {
  settingsRuntime?: ReturnType<typeof createCodexCompactSettingsRuntime>;
  fetch?: typeof globalThis.fetch;
}

export function createProviderRoutedContextExtension(options: ProviderRoutedContextOptions = {}): ExtensionFactory {
  return (pi) => {
    const router = new ContextTurnRouter();
    const ownership = {
      controller: new AbortController(),
      generation: 0,
    };
    const invalidateOwnership = (): void => {
      ownership.generation += 1;
      ownership.controller.abort();
      ownership.controller = new AbortController();
      router.endTurn();
    };

    // These are the current public Pi boundaries that invalidate work tied to
    // the old session or branch. agent_end is intentionally not included:
    // ordinary compatible checkpoints remain valid across turns.
    pi.on("session_before_switch", invalidateOwnership);
    pi.on("session_before_fork", invalidateOwnership);
    pi.on("session_before_tree", invalidateOwnership);
    pi.on("session_shutdown", invalidateOwnership);

    // Keep Codex transport retries disabled: Pi 0.84.4 owns attempts, budget and backoff.
    const settingsRuntime = forcePiOwnedCodexRetry(options.settingsRuntime ?? createCodexCompactSettingsRuntime());
    const ownsRoute = (ctx: ExtensionContext, expected: ContextOwner): FrozenContextRoute | undefined => {
      // Non-turn lifecycle/prompt harnesses may not expose a model yet. Neither
      // context owner may mutate until Pi supplies the canonical identity.
      if (!ctx.model) return undefined;
      const route = router.route(ctx);
      return route.owner === expected ? route : undefined;
    };
    const owns = (ctx: ExtensionContext, expected: ContextOwner): boolean => Boolean(ownsRoute(ctx, expected));

    const acp = createAcpExtension({ autoUpdate: false, delegate: false }, {
      ownsContext: (ctx) => owns(ctx, "billion-context"),
    });

    acp(pi);
    // Upstream 0.52 also supports generic OpenAI/Azure Responses. AILI does
    // not adopt those routes: gate every Codex context mutation on the
    // canonical, turn-frozen openai-codex identity while retaining upstream
    // lifecycle/settings handling.
    const codexOwnedEvents = new Set(["session_before_compact", "context", "before_provider_request"]);
    const codexPi = new Proxy(pi, {
      get(target, property, receiver) {
        if (property !== "on") return Reflect.get(target, property, receiver);
        return (event: string, handler: (...args: any[]) => unknown) => {
          if (event === "model_select") {
            return (target.on as any).call(target, event, (payload: { model?: Model<Api> }, ctx: ExtensionContext) =>
              isSupportedCodexModel(payload.model) ? handler(payload, ctx) : undefined);
          }
          if (event === "session_before_compact") {
            return (target.on as any).call(target, event, async (payload: unknown, ctx: ExtensionContext) => {
              const compactEvent = payload as SessionBeforeCompactEvent;
              const route = ownsRoute(ctx, "codex-remote-v2");
              if (!route) return undefined;
              const settings = settingsRuntime.get().settings;
              const compactionRoute = resolveCompactionRoute(ctx.model, settings);
              if (compactionRoute.kind !== "remote") return undefined;
              const ownerGeneration = ownership.generation;
              const ownerSignal = ownership.controller.signal;
              if (compactEvent.signal.aborted || ownerSignal.aborted) return { cancel: true };
              if (!checkpointCanBeReplayed(ctx, route, settings, compactEvent.branchEntries)) return undefined;

              const snapshot: ContextOwnershipSnapshot = {
                generation: ownerGeneration,
                sessionId: ctx.sessionManager.getSessionId(),
                branchKey: branchKey(ctx),
                route,
                protocol: compactionRoute.protocol,
                signal: ownerSignal,
              };
              const signal = AbortSignal.any([compactEvent.signal, ownerSignal]);
              const result = await handler({ ...compactEvent, signal }, ctx);

              let currentRoute: FrozenContextRoute | undefined;
              try {
                currentRoute = ownsRoute(ctx, "codex-remote-v2");
              } catch {
                currentRoute = undefined;
              }
              const currentSettings = settingsRuntime.get().settings;
              const currentCompactionRoute = resolveCompactionRoute(ctx.model, currentSettings);
              const currentOwner = !signal.aborted
                && !snapshot.signal.aborted
                && ownership.generation === snapshot.generation
                && ctx.sessionManager.getSessionId() === snapshot.sessionId
                && branchKey(ctx) === snapshot.branchKey
                && currentRoute?.key === snapshot.route.key
                && currentCompactionRoute.kind === "remote"
                && currentCompactionRoute.protocol === snapshot.protocol
                && returnedCheckpointMatchesRoute(result, ctx, snapshot.route, currentSettings);
              return currentOwner ? result : { cancel: true };
            });
          }
          if (!codexOwnedEvents.has(event)) return (target.on as any).call(target, event, handler);
          return (target.on as any).call(target, event, (payload: unknown, ctx: ExtensionContext) => {
            const route = ownsRoute(ctx, "codex-remote-v2");
            if (!route) return undefined;
            return checkpointCanBeReplayed(ctx, route, settingsRuntime.get().settings)
              ? handler(payload, ctx)
              : undefined;
          });
        };
      },
    });
    const codex = createCodexCompactExtension({ fetch: options.fetch, settingsRuntime });
    codex(codexPi);
    pi.on("agent_end", () => router.endTurn());
  };
}
