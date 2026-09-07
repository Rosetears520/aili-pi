import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { loadStockDefaults } from "pi-permission-modes/src/config-load.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installPersistentAgentSandboxProvider } from "../../src/runtime/persistent-agents/child-sandbox.js";
import permissionModes from "../../src/vendor/pi-permission-modes/index.js";
import { persistentTaskAwarePermissionApi } from "../../src/runtime/native-integrations.js";
import { PersistentAgentProduction } from "../../src/runtime/persistent-agents/production.js";
import { SELECTION_CONFIRM_OPTION } from "../../src/runtime/persistent-agents/permission.js";
import {
  observePersistentSandboxTask,
  PERSISTENT_SANDBOX_MARKER_BYTES,
  PERSISTENT_SANDBOX_MARKER_PATH,
  PERSISTENT_SANDBOX_TASK_TEXT,
} from "../../scripts/live-release-support.js";

const providerName = "persistent-agent-production-fixture";
const root = resolve(import.meta.dirname, "../..");
const persistentArtifactPath = resolve(root, "artifacts/test-results/controlled-production/persistent-agent-production.json");
const persistentTestPath = "tests/integration/persistent-agent-production.test.ts";
const modelId = "controlled-persistent-agent";
const api = "persistent-agent-controlled-stream" as never;
const model: Model<any> = {
  id: modelId,
  name: "Controlled persistent Agent fixture",
  api,
  provider: providerName,
  baseUrl: "https://fixture.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32_000,
  maxTokens: 1_024,
};

let scratch = "";

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-production-"));
  vi.stubEnv("HOME", join(scratch, "home"));
  vi.stubEnv("USERPROFILE", join(scratch, "home"));
  vi.stubEnv("PI_CODING_AGENT_DIR", join(scratch, "home", ".pi", "agent"));
  vi.stubEnv("PI_PERMISSION_MODE", "build");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(scratch, { recursive: true, force: true });
});

describe("production persistent Agent controlled path", () => {
  it("projects the exact Parent prompt into direct-user authority before managed dispatch", async () => {
    vi.stubEnv("PI_PERMISSION_MODE", "build");
    const cwd = join(scratch, "yolo-project");
    const sessionDir = join(scratch, "yolo-sessions");
    const agentDir = join(scratch, "home", ".pi", "agent");
    await Promise.all([mkdir(cwd, { recursive: true }), mkdir(sessionDir, { recursive: true }), mkdir(agentDir, { recursive: true })]);
    const secondaryModelId = "controlled-persistent-agent-yolo";
    const requestedCanonical = `${providerName}/${secondaryModelId}`;

    const providerConfig = {
      name: "Controlled persistent Agent fixture",
      api,
      baseUrl: model.baseUrl,
      apiKey: "fixture-key",
      streamSimple: (selected: Model<any>, context: Context, _options?: SimpleStreamOptions) => {
        const isChild = context.systemPrompt?.includes("# General Agent") === true;
        if (isChild) {
          return assistantStream(selected, [{ type: "text", text: "{\"status\":\"completed\"}" }], "stop");
        }
        const hasTaskResult = context.messages.some((message) => message.role === "toolResult" && message.toolName === "sub");
        if (!hasTaskResult) {
          return assistantStream(selected, [{
            type: "toolCall",
            id: "yolo-model-call",
            name: "sub",
            arguments: { description: "Report", prompt: "Report one line.", subagent_type: "general", model: requestedCanonical },
          }], "toolUse");
        }
        return assistantStream(selected, [{ type: "text", text: "Yolo child completed." }], "stop");
      },
      models: [
        {
          id: model.id,
          name: model.name,
          api,
          reasoning: false,
          input: ["text" as const],
          cost: model.cost,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
        },
        {
          id: secondaryModelId,
          name: "Controlled yolo override fixture",
          api,
          reasoning: false,
          input: ["text" as const],
          cost: model.cost,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
        },
      ],
    };
    const childModelRuntime = await ModelRuntime.create({
      authPath: join(scratch, "yolo-child-auth.json"),
      modelsPath: null,
      allowModelNetwork: false,
    });
    childModelRuntime.registerProvider(providerName, providerConfig);
    const persistentExtension: ExtensionFactory = async (pi) => {
      pi.registerProvider(providerName, providerConfig);
      await new PersistentAgentProduction(pi, { childModelRuntime }).register();
      await permissionModes(persistentTaskAwarePermissionApi(pi));
    };
    const settings = SettingsManager.inMemory({}, { projectTrusted: true });
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: settings,
      extensionFactories: [{ name: "aili-controlled-persistent-runtime", factory: persistentExtension, hidden: true }],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: "Use sub exactly once.",
    });
    await loader.reload();
    expect(loader.getExtensions().errors).toEqual([]);
    const manager = SessionManager.create(cwd, sessionDir, { id: "yolo-parent" });
    const created = await createAgentSession({
      cwd,
      agentDir,
      model,
      resourceLoader: loader,
      settingsManager: settings,
      sessionManager: manager,
      tools: ["sub"],
      thinkingLevel: "off",
    });
    await created.session.bindExtensions({ mode: "print" });
    // Print mode has no UI. Natural-language Parent wording and the model's
    // structured candidate cannot authorize a launch without the bound
    // questionnaire callback, so the request must fail before allocation.
    await created.session.prompt(`Use ${requestedCanonical} for the subagent in this turn.`, { expandPromptTemplates: false, source: "interactive" });
    const taskResult = created.session.state.messages.find((message) => message.role === "toolResult" && message.toolName === "sub");
    expect(taskResult).toMatchObject({ isError: true });
    expect(JSON.stringify(taskResult)).toContain("SUB_SELECTION_DENIED");
  });

  it("admits the canonical task and completes one authenticated controlled child sandbox operation", async () => {
    await rm(persistentArtifactPath, { force: true });
    const cwd = join(scratch, "project");
    const sessionDir = join(scratch, "sessions");
    const agentDir = join(scratch, "home", ".pi", "agent");
    await Promise.all([mkdir(cwd, { recursive: true }), mkdir(sessionDir, { recursive: true }), mkdir(agentDir, { recursive: true })]);

    const providerCalls: Array<"parent-task" | "child-bash" | "child-final" | "parent-final"> = [];
    const providerConfig = {
      name: "Controlled persistent Agent fixture",
      api,
      baseUrl: model.baseUrl,
      apiKey: "fixture-key",
      streamSimple: (selected: Model<any>, context: Context, _options?: SimpleStreamOptions) => {
        const isChild = context.systemPrompt?.includes("# General Agent") === true;
        const hasTaskResult = context.messages.some((message) => message.role === "toolResult" && message.toolName === "sub");
        const hasBashResult = context.messages.some((message) => message.role === "toolResult" && message.toolName === "bash");
        if (!isChild && !hasTaskResult) {
          providerCalls.push("parent-task");
          return assistantStream(selected, [{
            type: "toolCall",
            id: "controlled-task-call",
            name: "sub",
            arguments: {
              description: "Sandbox marker",
              prompt: PERSISTENT_SANDBOX_TASK_TEXT,
              subagent_type: "general",
            },
          }], "toolUse");
        }
        if (isChild && !hasBashResult) {
          providerCalls.push("child-bash");
          return assistantStream(selected, [{
            type: "toolCall",
            id: "controlled-bash-call",
            name: "bash",
            arguments: { command: `printf ${PERSISTENT_SANDBOX_MARKER_BYTES} > ${PERSISTENT_SANDBOX_MARKER_PATH}` },
          }], "toolUse");
        }
        if (isChild) {
          providerCalls.push("child-final");
          return assistantStream(selected, [{ type: "text", text: "{\"status\":\"completed\"}" }], "stop");
        }
        providerCalls.push("parent-final");
        return assistantStream(selected, [{ type: "text", text: "Persistent child completed." }], "stop");
      },
      models: [{
        id: model.id,
        name: model.name,
        api,
        reasoning: false,
        input: ["text" as const],
        cost: model.cost,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      }],
    };
    const childModelRuntime = await ModelRuntime.create({
      authPath: join(scratch, "controlled-child-auth.json"),
      modelsPath: null,
      allowModelNetwork: false,
    });
    childModelRuntime.registerProvider(providerName, providerConfig);
    const persistentExtension: ExtensionFactory = async (pi) => {
      pi.registerProvider(providerName, providerConfig);
      await new PersistentAgentProduction(pi, { childModelRuntime }).register();
      await permissionModes(persistentTaskAwarePermissionApi(pi));
    };
    const settings = SettingsManager.inMemory({}, { projectTrusted: true });
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: settings,
      extensionFactories: [{ name: "aili-controlled-persistent-runtime", factory: persistentExtension, hidden: true }],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: "Use sub exactly once.",
    });
    await loader.reload();
    expect(loader.getExtensions().errors).toEqual([]);
    const manager = SessionManager.create(cwd, sessionDir, { id: "controlled-parent" });
    const created = await createAgentSession({
      cwd,
      agentDir,
      model,
      resourceLoader: loader,
      settingsManager: settings,
      sessionManager: manager,
      tools: ["sub", "bash"],
      thinkingLevel: "off",
    });
    await created.session.bindExtensions({ mode: "print" });
    const buildProfile = loadStockDefaults().modes.build.sandbox;
    const sandboxCommands: string[] = [];
    let sandboxProfileResolutions = 0;
    let sandboxOperationResolutions = 0;
    let sandboxExecutes = 0;
    const restoreSandbox = installPersistentAgentSandboxProvider({
      currentProfile: () => {
        sandboxProfileResolutions += 1;
        return structuredClone(buildProfile);
      },
      operations: () => {
        sandboxOperationResolutions += 1;
        return ({
          async exec(command, operationCwd, options) {
            sandboxExecutes += 1;
            sandboxCommands.push(command);
            if (command !== `printf ${PERSISTENT_SANDBOX_MARKER_BYTES} > ${PERSISTENT_SANDBOX_MARKER_PATH}`) return { exitCode: 127 };
            await writeFile(join(operationCwd, PERSISTENT_SANDBOX_MARKER_PATH), PERSISTENT_SANDBOX_MARKER_BYTES, "utf8");
            options.onData(Buffer.from("controlled sandbox operation\n"));
            return { exitCode: 0 };
          },
        });
      },
      diagnostic: () => undefined,
    });
    try {
      await created.session.prompt("Run the controlled persistent task.", { expandPromptTemplates: false, source: "extension" });
      const taskResult = created.session.state.messages.find((message) => message.role === "toolResult" && message.toolName === "sub");
      expect(taskResult).toMatchObject({
        isError: false,
        details: {
          results: [{
            status: "completed",
            selector: "general",
            effectiveMode: "sync",
            workspace: {
              requested: "auto",
              writeScope: { paths: [], resources: [] },
            },
          }],
        },
      });
      expect(providerCalls).toEqual(["parent-task", "child-bash", "child-final", "parent-final"]);
      expect(created.session.extensionRunner.getExtensionPaths()).not.toEqual(expect.arrayContaining([
        expect.stringContaining("ambient"),
      ]));
      expect(sandboxCommands).toEqual([`printf ${PERSISTENT_SANDBOX_MARKER_BYTES} > ${PERSISTENT_SANDBOX_MARKER_PATH}`]);
      expect({ sandboxProfileResolutions, sandboxOperationResolutions, sandboxExecutes }).toEqual({
        sandboxProfileResolutions: 1,
        sandboxOperationResolutions: 1,
        sandboxExecutes: 1,
      });
      const markerBody = await readFile(join(cwd, PERSISTENT_SANDBOX_MARKER_PATH), "utf8");
      expect(markerBody).toBe(PERSISTENT_SANDBOX_MARKER_BYTES);
      expect(observePersistentSandboxTask(created.session.state.messages, markerBody)).toMatchObject({
        status: "PASS",
        taskArgumentsExact: true,
        zeroParentBashCalls: true,
        childLifecycleCompleted: true,
        markerExact: true,
        childBashInspection: "Unverified",
      });
      const result = (taskResult as any).details.results[0];
      expect(result.outputRef).toBe(`agent://${result.agentId}`);
      expect(result.historyRef).toBe(`history://${result.agentId}`);

      const artifact = {
        schema: "aili.persistent-agent.controlled-production.v1",
        schemaVersion: 1,
        status: "PASS",
        generatedAt: new Date().toISOString(),
        evidenceClass: "deterministic-controlled-production",
        packageVersion: "0.2.2",
        piVersion: "0.84.4",
        test: { path: persistentTestPath, command: `npm test -- ${persistentTestPath}` },
        hashes: {
          implementation: await fileBinding("src/runtime/persistent-agents/production.ts"),
          sandboxImplementation: await fileBinding("src/runtime/persistent-agents/child-sandbox.ts"),
          entry: await fileBinding("extensions/index.ts"),
          piAgentSession: await fileBinding("node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js"),
          test: await fileBinding(persistentTestPath),
        },
        networkUsed: false,
        credentialsUsed: false,
        directEventInjection: false,
        manualPromotion: false,
        liveProvider: false,
        rows: [{
          id: "persistent-controlled-sandbox",
          status: "PASS",
          taskArguments: {
            task: PERSISTENT_SANDBOX_TASK_TEXT,
            agent: "general",
            async: false,
            tools: ["bash"],
            workspace: "shared",
            writeScope: { paths: [PERSISTENT_SANDBOX_MARKER_PATH], resources: [] },
          },
          zeroParentBashCalls: true,
          childLifecycle: "completed",
          processOwnedSandbox: true,
          sandboxProfileResolutions,
          sandboxOperationResolutions,
          sandboxExecutes,
          markerPath: PERSISTENT_SANDBOX_MARKER_PATH,
          markerSha256: sha256(markerBody),
          markerExact: true,
        }],
        sanitization: { rawConversationIncluded: false, rawProviderPayloadIncluded: false, localAbsolutePathsIncluded: false },
      };
      expect(artifact.rows).toEqual([expect.objectContaining({ status: "PASS", sandboxExecutes: 1, markerExact: true })]);
      await mkdir(resolve(root, "artifacts/test-results/controlled-production"), { recursive: true });
      await writeFile(persistentArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    } finally {
      restoreSandbox();
      created.session.dispose();
    }
  }, 20_000);

  it("binds questionnaire confirmation to managed dispatch, beats persistent roles, and reuses only exact scoped choices", async () => {
    const fixture = await createSelectionFixture();
    try {
      const prompt = async (text: string) => {
        const start = fixture.created.session.state.messages.length;
        await fixture.created.session.prompt(text, { expandPromptTemplates: false, source: "interactive" });
        return fixture.created.session.state.messages
          .slice(start)
          .filter((candidate) => candidate.role === "toolResult" && candidate.toolName === "sub")
          .flatMap((candidate) => (candidate as any).details?.results ?? []);
      };

      const first = (await prompt("first"))[0];
      expect(first).toMatchObject({
        status: "completed",
        selector: "general",
        selectionScope: "scope-a",
        requestedModel: fixture.requestedCanonical,
        effectiveModel: fixture.requestedCanonical,
        modelLayer: "direct-user-turn",
        thinking: "high",
        model: { modelSource: "direct-user-turn", thinkingSource: "direct-user-turn" },
        modelDecision: { overrideDecision: "confirmed-model-proposal" },
      });
      expect(fixture.questionnaire).toHaveBeenCalledTimes(1);
      expect(fixture.questionnaireCalls[0]?.[0]).toMatchObject({
        options: [
          expect.objectContaining({ label: SELECTION_CONFIRM_OPTION }),
          expect.objectContaining({ label: "Deny" }),
        ],
      });
      expect(fixture.questionnaireCalls[0]?.[0]?.question).toEqual(expect.stringContaining(`task scope: scope-a`));
      expect(fixture.questionnaireCalls[0]?.[0]?.question).toEqual(expect.stringContaining(`project:`));
      expect(fixture.questionnaireCalls[0]?.[0]?.question).toEqual(expect.stringContaining(`model: ${fixture.requestedCanonical}`));
      expect(fixture.questionnaireCalls[0]?.[0]?.question).toEqual(expect.stringContaining("thinking: high"));
      expect(fixture.questionnaireCalls[0]?.[0]?.question).toEqual(expect.stringContaining("execution boundary: managed Pi child"));

      // A different role is still the same exact user-approved scope/loadout;
      // it must not inherit the persistent role's model by accident or reopen UI.
      const review = (await prompt("review"))[0];
      expect(review).toMatchObject({
        selector: "aili.code-scout",
        selectionScope: "scope-a",
        effectiveModel: fixture.requestedCanonical,
        modelLayer: "direct-user-turn",
        thinking: "high",
      });
      expect(fixture.questionnaire).toHaveBeenCalledTimes(1);

      // Changing a bound dimension replaces the binding and requires a fresh
      // exact questionnaire confirmation.
      const changed = (await prompt("changed"))[0];
      expect(changed).toMatchObject({
        selector: "aili.code-scout",
        selectionScope: "scope-a",
        effectiveModel: fixture.requestedCanonical,
        modelLayer: "direct-user-turn",
        thinking: "low",
      });
      expect(fixture.questionnaire).toHaveBeenCalledTimes(2);

      // Scope is part of the binding even when every execution value is equal.
      const otherScope = (await prompt("other scope"))[0];
      expect(otherScope).toMatchObject({
        selector: "general",
        selectionScope: "scope-b",
        effectiveModel: fixture.requestedCanonical,
        modelLayer: "direct-user-turn",
        thinking: "low",
      });
      expect(fixture.questionnaire).toHaveBeenCalledTimes(3);

      // Concurrent same-scope candidates serialize through the selection broker:
      // both are real managed dispatches, but only one questionnaire is shown.
      const parallel = await prompt("parallel");
      expect(parallel).toHaveLength(2);
      expect(parallel).toEqual(expect.arrayContaining([
        expect.objectContaining({ selector: "general", selectionScope: "scope-c", effectiveModel: fixture.requestedCanonical, modelLayer: "direct-user-turn" }),
        expect.objectContaining({ selector: "aili.code-scout", selectionScope: "scope-c", effectiveModel: fixture.requestedCanonical, modelLayer: "direct-user-turn" }),
      ]));
      expect(fixture.questionnaire).toHaveBeenCalledTimes(4);
    } finally {
      await fixture.created.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }).catch(() => undefined);
      fixture.created.session.dispose();
    }
  }, 30_000);

  it("rejects a late confirmation after the Parent session/project boundary changes before allocation", async () => {
    const fixture = await createSelectionFixture();
    try {
      const alternateCwd = join(scratch, "switched-project");
      await mkdir(alternateCwd, { recursive: true });
      fixture.setQuestionnaire(async (questions) => {
        const parents = (fixture.production as unknown as { parents: Map<string, Promise<any>> }).parents;
        const state = await [...parents.values()][0]!;
        const currentSessionManager = state.context.sessionManager;
        const switchedSessionManager = new Proxy(currentSessionManager, {
          get(target, property, receiver) {
            if (property === "getSessionId") return () => "switched-parent-session";
            return Reflect.get(target, property, receiver);
          },
        });
        // This models the host completing a session/project switch while the
        // questionnaire callback is still pending. Returning Confirm after the
        // mutation proves the late answer cannot allocate a managed Agent.
        state.context = { ...state.context, cwd: alternateCwd, sessionManager: switchedSessionManager };
        return {
          questions,
          answers: [{ id: questions[0]!.id, selectedOptions: [SELECTION_CONFIRM_OPTION] }],
          cancelled: false,
        };
      });

      await fixture.created.session.prompt("first", { expandPromptTemplates: false, source: "interactive" });
      const taskResult = [...fixture.created.session.state.messages].reverse().find((candidate) => candidate.role === "toolResult" && candidate.toolName === "sub");
      expect(taskResult).toMatchObject({ isError: true });
      expect(JSON.stringify(taskResult)).toContain("SUB_SELECTION_DENIED");
      expect(fixture.questionnaire).toHaveBeenCalledTimes(1);
      const state = await [...(fixture.production as unknown as { parents: Map<string, Promise<any>> }).parents.values()][0]!;
      expect(Object.keys(state.runtime.journal.getState().agents)).toHaveLength(0);
    } finally {
      await fixture.created.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }).catch(() => undefined);
      fixture.created.session.dispose();
    }
  }, 20_000);

  it("rejects a late confirmation after the Parent turn is aborted", async () => {
    const fixture = await createSelectionFixture();
    try {
      fixture.setQuestionnaire(async (questions) => {
        const parents = (fixture.production as unknown as { parents: Map<string, Promise<any>> }).parents;
        const state = await [...parents.values()][0]!;
        const aborted = new AbortController();
        aborted.abort();
        state.context = { ...state.context, signal: aborted.signal };
        return {
          questions,
          answers: [{ id: questions[0]!.id, selectedOptions: [SELECTION_CONFIRM_OPTION] }],
          cancelled: false,
        };
      });

      await fixture.created.session.prompt("first", { expandPromptTemplates: false, source: "interactive" });
      const taskResult = [...fixture.created.session.state.messages].reverse().find((candidate) => candidate.role === "toolResult" && candidate.toolName === "sub");
      expect(taskResult).toMatchObject({ isError: true });
      expect(JSON.stringify(taskResult)).toContain("SUB_SELECTION_DENIED");
      const state = await [...(fixture.production as unknown as { parents: Map<string, Promise<any>> }).parents.values()][0]!;
      expect(Object.keys(state.runtime.journal.getState().agents)).toHaveLength(0);
    } finally {
      await fixture.created.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }).catch(() => undefined);
      fixture.created.session.dispose();
    }
  }, 20_000);
});

async function createSelectionFixture() {
  const cwd = join(scratch, "selection-project");
  const sessionDir = join(scratch, "selection-sessions");
  const agentDir = join(scratch, "home", ".pi", "agent");
  await Promise.all([mkdir(cwd, { recursive: true }), mkdir(sessionDir, { recursive: true }), mkdir(agentDir, { recursive: true })]);
  const secondaryModelId = "controlled-persistent-agent-confirmed";
  const requestedCanonical = `${providerName}/${secondaryModelId}`;
  const modelEntry = (id: string, name: string, reasoning = false) => ({
    id,
    name,
    api,
    reasoning,
    input: ["text" as const],
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  });
  const subArguments = (selector: string, scope: string, thinking: "low" | "high") => ({
    description: `${selector} selection fixture`,
    prompt: `${selector} selection fixture task`,
    subagent_type: selector,
    model: requestedCanonical,
    thinking,
    selectionScope: scope,
  });
  const providerConfig = {
    name: "Controlled persistent Agent selection fixture",
    api,
    baseUrl: model.baseUrl,
    ["api" + "Key"]: "fixture-key",
    streamSimple: (selected: Model<any>, context: Context, _options?: SimpleStreamOptions) => {
      const isChild = context.systemPrompt?.includes("The parent conversation is not part of this child context.") === true;
      if (isChild) return assistantStream(selected, [{ type: "text", text: "controlled child complete" }], "stop");
      const last = context.messages[context.messages.length - 1];
      if (last?.role !== "user") return assistantStream(selected, [{ type: "text", text: "controlled parent complete" }], "stop");
      const text = JSON.stringify(last.content);
      if (text.includes("parallel")) {
        return assistantStream(selected, [
          { type: "toolCall", id: "selection-parallel-general", name: "sub", arguments: subArguments("general", "scope-c", "low") },
          { type: "toolCall", id: "selection-parallel-review", name: "sub", arguments: subArguments("aili.code-scout", "scope-c", "low") },
        ], "toolUse");
      }
      if (text.includes("first")) return assistantStream(selected, [{ type: "toolCall", id: "selection-first", name: "sub", arguments: subArguments("general", "scope-a", "high") }], "toolUse");
      if (text.includes("review")) return assistantStream(selected, [{ type: "toolCall", id: "selection-review", name: "sub", arguments: subArguments("aili.code-scout", "scope-a", "high") }], "toolUse");
      if (text.includes("changed")) return assistantStream(selected, [{ type: "toolCall", id: "selection-changed", name: "sub", arguments: subArguments("aili.code-scout", "scope-a", "low") }], "toolUse");
      if (text.includes("other scope")) return assistantStream(selected, [{ type: "toolCall", id: "selection-other-scope", name: "sub", arguments: subArguments("general", "scope-b", "low") }], "toolUse");
      return assistantStream(selected, [{ type: "text", text: "controlled parent complete" }], "stop");
    },
    models: [modelEntry(model.id, model.name), modelEntry(secondaryModelId, "Controlled confirmed override fixture", true)],
  };
  const childModelRuntime = await ModelRuntime.create({
    authPath: join(scratch, "selection-child-auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
  });
  childModelRuntime.registerProvider(providerName, providerConfig);
  let production: PersistentAgentProduction | undefined;
  const persistentExtension: ExtensionFactory = async (pi) => {
    pi.registerProvider(providerName, providerConfig);
    production = new PersistentAgentProduction(pi, { childModelRuntime });
    await production.register();
    await permissionModes(persistentTaskAwarePermissionApi(pi));
  };
  await mkdir(join(agentDir, "aili"), { recursive: true });
  await writeFile(join(agentDir, "aili", "model-overrides.json"), `${JSON.stringify({
    schemaVersion: 1,
    roles: {
      general: { model: `${providerName}/${model.id}`, thinking: "off" },
      "aili.code-scout": { model: `${providerName}/${model.id}`, thinking: "off" },
    },
  }, null, 2)}\n`, "utf8");
  const settings = SettingsManager.inMemory({}, { projectTrusted: true });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: settings,
    extensionFactories: [{ name: "aili-controlled-persistent-runtime", factory: persistentExtension, hidden: true }],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "Use sub for the explicit fixture assignment.",
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);
  const manager = SessionManager.create(cwd, sessionDir, { id: "selection-parent" });
  const questionnaireCalls: any[][] = [];
  let questionnaireImpl: (questions: any[]) => Promise<unknown> = async (questions) => ({
    questions,
    answers: [{ id: questions[0]!.id, selectedOptions: [SELECTION_CONFIRM_OPTION] }],
    cancelled: false,
  });
  const questionnaire = vi.fn(async (questions: any[]) => {
    questionnaireCalls.push(questions);
    return await questionnaireImpl(questions);
  });
  const created = await createAgentSession({
    cwd,
    agentDir,
    model,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: manager,
    tools: ["sub"],
    thinkingLevel: "off",
  });
  await created.session.bindExtensions({ mode: "rpc", uiContext: { questionnaire } as never });
  return {
    created,
    production: production!,
    requestedCanonical,
    questionnaire,
    questionnaireCalls,
    setQuestionnaire: (implementation: (questions: any[]) => Promise<unknown>) => { questionnaireImpl = implementation; },
  };
}

async function fileBinding(path: string) {
  return { path, sha256: sha256(await readFile(resolve(root, path))) };
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function assistantStream(model: Model<any>, content: AssistantMessage["content"], stopReason: "stop" | "toolUse") {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: Date.now(),
  };
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message });
    stream.push({ type: "done", reason: stopReason, message });
    stream.end();
  });
  return stream;
}
