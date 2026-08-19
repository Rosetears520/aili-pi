import type {
  ExtensionContext,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { hasApi, type Api, type Model } from "@earendil-works/pi-ai";
import { createCodexCompactExtension } from "@narumitw/pi-codex-compact/src/codex-compact.js";
import { createCodexCompactSettingsRuntime, type CodexCompactSettingsRuntime } from "@narumitw/pi-codex-compact/src/settings.js";
import { createAcpExtension } from "../../upstream/billion-context-pi/dist/index.js";

export const BILLION_CONTEXT_VERSION = "0.1.34";
export const CODEX_COMPACT_VERSION = "0.50.0";

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

export interface ProviderRoutedContextOptions {
  settingsRuntime?: ReturnType<typeof createCodexCompactSettingsRuntime>;
  fetch?: typeof globalThis.fetch;
}

export function createProviderRoutedContextExtension(options: ProviderRoutedContextOptions = {}): ExtensionFactory {
  return (pi) => {
    const router = new ContextTurnRouter();
    const owns = (ctx: ExtensionContext, expected: ContextOwner) => {
      // Non-turn lifecycle/prompt harnesses may not expose a model yet. Neither
      // context owner may mutate until Pi supplies the canonical identity.
      if (!ctx.model) return false;
      return router.route(ctx).owner === expected;
    };

    // Keep Codex transport retries disabled: Pi 0.84.2 owns attempts, budget and backoff.
    const settingsRuntime = forcePiOwnedCodexRetry(options.settingsRuntime ?? createCodexCompactSettingsRuntime());
    const codex = createCodexCompactExtension({ fetch: options.fetch, settingsRuntime });
    const acp = createAcpExtension({ autoUpdate: false }, {
      ownsContext: (ctx) => owns(ctx, "billion-context"),
    });

    acp(pi);
    codex(pi);
    pi.on("agent_end", () => router.endTurn());
    pi.on("session_before_switch", () => router.endTurn());
    pi.on("session_shutdown", () => router.endTurn());
  };
}
