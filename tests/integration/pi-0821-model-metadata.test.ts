import { readdir, readFile } from "node:fs/promises";
import { InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import {
  ModelRegistry,
  ModelRuntime,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerAiliRuntime } from "../../src/runtime/index.js";

// Runtime registration is tested without loading third-party integrations whose
// module initializers can alter process-global settings. Their source remains in
// the negative package-source assertion below.
vi.mock("../../src/runtime/native-integrations.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/runtime/native-integrations.js")>();
  return { ...actual, registerNativeIntegrations: vi.fn() };
});

const EXPECTED_GPT_56 = {
  "gpt-5.6-sol": {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    api: "openai-codex-responses",
    provider: "openai-codex",
    baseUrl: "https://chatgpt.com/backend-api",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 5,
      output: 30,
      cacheRead: 0.5,
      cacheWrite: 6.25,
      tiers: [{ inputTokensAbove: 272000, input: 10, output: 45, cacheRead: 1, cacheWrite: 12.5 }],
    },
    contextWindow: 272000,
    maxTokens: 128000,
    thinkingLevelMap: { xhigh: "xhigh", max: "max", minimal: "low" },
    compat: { supportsToolSearch: true, supportsOpenAIGrammarTools: true },
  },
  "gpt-5.6-terra": {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    api: "openai-codex-responses",
    provider: "openai-codex",
    baseUrl: "https://chatgpt.com/backend-api",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 2.5,
      output: 15,
      cacheRead: 0.25,
      cacheWrite: 3.125,
      tiers: [{ inputTokensAbove: 272000, input: 5, output: 22.5, cacheRead: 0.5, cacheWrite: 6.25 }],
    },
    contextWindow: 272000,
    maxTokens: 128000,
    thinkingLevelMap: { xhigh: "xhigh", max: "max", minimal: "low" },
    compat: { supportsToolSearch: true, supportsOpenAIGrammarTools: true },
  },
  "gpt-5.6-luna": {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    api: "openai-codex-responses",
    provider: "openai-codex",
    baseUrl: "https://chatgpt.com/backend-api",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 1,
      output: 6,
      cacheRead: 0.1,
      cacheWrite: 1.25,
      tiers: [{ inputTokensAbove: 272000, input: 2, output: 9, cacheRead: 0.2, cacheWrite: 2.5 }],
    },
    contextWindow: 272000,
    maxTokens: 128000,
    thinkingLevelMap: { xhigh: "xhigh", max: "max", minimal: "low" },
    compat: { supportsToolSearch: true, supportsOpenAIGrammarTools: true },
  },
} as const;

async function createOfflineRegistry(): Promise<ModelRegistry> {
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsStore: new InMemoryModelsStore(),
    modelsPath: null,
    allowModelNetwork: false,
  });
  return new ModelRegistry(runtime);
}

async function productionSources(directory: URL): Promise<Array<{ path: string; source: string }>> {
  const files: Array<{ path: string; source: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...await productionSources(url));
    else if (/\.(?:ts|js|json)$/u.test(entry.name)) {
      files.push({ path: url.pathname, source: await readFile(url, "utf8") });
    }
  }
  return files;
}

function registrationSpy(): { pi: ExtensionAPI; providerCalls: unknown[][] } {
  const providerCalls: unknown[][] = [];
  const tools: Array<Record<string, unknown>> = [];
  const commands: Array<Record<string, unknown>> = [];
  const sourceInfo = {
    path: "<inline:aili-runtime-fixture>",
    source: "inline",
    scope: "temporary",
    origin: "top-level",
  };
  const pi = new Proxy({}, {
    get: (_target, property) => {
      if (property === "registerProvider") {
        return (...args: unknown[]) => { providerCalls.push(args); };
      }
      if (property === "registerTool") return (definition: Record<string, unknown>) => { tools.push({ ...definition, sourceInfo }); };
      if (property === "registerCommand") return (name: string, options: Record<string, unknown>) => { commands.push({ name, ...options, sourceInfo }); };
      if (property === "getCommands") return () => commands;
      if (property === "getActiveTools") return () => tools.map((tool) => String(tool.name));
      if (property === "getAllTools") return () => tools;
      return () => undefined;
    },
  }) as ExtensionAPI;
  return { pi, providerCalls };
}

describe("Pi 0.82.1-owned GPT-5.6 Codex metadata", () => {
  it("keeps the installed Pi version and exact Sol, Terra, and Luna catalog values", async () => {
    const piPackage = JSON.parse(await readFile(
      new URL("../../node_modules/@earendil-works/pi-coding-agent/package.json", import.meta.url),
      "utf8",
    )) as { version?: string };
    expect(piPackage.version).toBe("0.82.1");

    const registry = await createOfflineRegistry();
    for (const [id, expected] of Object.entries(EXPECTED_GPT_56)) {
      expect(registry.find("openai-codex", id)).toEqual(expected);
    }
  });

  it("resolves parent and persistent-child selections from the same unmodified registry", async () => {
    const parentRegistry = await createOfflineRegistry();

    for (const id of Object.keys(EXPECTED_GPT_56)) {
      const parentResolution = parentRegistry.find("openai-codex", id);
      // PersistentAgentProduction's ContextModelCatalog and child-session handoff both
      // resolve through context.modelRegistry.find(provider, id), without a provider call.
      const persistentChildResolution = parentRegistry.find("openai-codex", id);
      expect(parentResolution).toBeDefined();
      expect(persistentChildResolution).toBe(parentResolution);
      expect(persistentChildResolution?.contextWindow).toBe(272000);
    }
  });

  it("does not register an AILI openai-codex provider or carry a 372K mapping", async () => {
    const { pi, providerCalls } = registrationSpy();
    await registerAiliRuntime(pi);
    expect(providerCalls.filter(([provider]) => provider === "openai-codex")).toEqual([]);

    const sources = [
      ...await productionSources(new URL("../../src/", import.meta.url)),
      ...await productionSources(new URL("../../extensions/", import.meta.url)),
    ];
    const combined = sources.map(({ path, source }) => `// ${path}\n${source}`).join("\n");
    expect(combined).not.toMatch(/registerProvider\s*\(\s*["']openai-codex["']/u);
    expect(combined).not.toMatch(/\b372_?000\b/u);

    const registry = await createOfflineRegistry();
    expect(registry.getRegisteredProviderIds()).not.toContain("openai-codex");
    expect(registry.find("openai-codex", "gpt-5.6-sol")?.contextWindow).toBe(272000);
  });
});
