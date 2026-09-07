import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionFactory,
  type ExtensionContext,
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
import { ModelConfigStore } from "../../src/runtime/persistent-agents/model-selection.js";
import { PersistentAgentRuntime, type PersistentAgentRuntimeOptions } from "../../src/runtime/persistent-agents/runtime.js";
import * as herdr from "../../src/runtime/persistent-agents/backends/herdr/adapter.js";
import * as externalCli from "../../src/runtime/persistent-agents/external-cli.js";
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
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(scratch, { recursive: true, force: true });
});

describe("production persistent Agent controlled path", () => {
  it("launches an exact structured model request headlessly without claiming user confirmation", async () => {
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
    // No selection UI exists in print mode. Only the structured request, not
    // a runtime interpretation of this prompt, supplies the per-turn fields.
    try {
      await created.session.prompt(`Use ${requestedCanonical} for the subagent in this turn.`, { expandPromptTemplates: false, source: "interactive" });
      const taskResult = created.session.state.messages.find((message) => message.role === "toolResult" && message.toolName === "sub");
      expect(taskResult).toMatchObject({ isError: false, details: { results: [{
        status: "completed", effectiveModel: requestedCanonical, source: "structured-request",
        modelDecision: { overrideDecision: "accepted-structured-request" },
      }] } });
      expect(JSON.stringify(taskResult)).not.toContain("confirmed-model-proposal");
    } finally {
      await created.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      created.session.dispose();
    }
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

  it("dispatches new, continued, changed-scope and concurrent requests without selection UI or config leakage", async () => {
    const fixture = await createStructuredRequestFixture();
    try {
      const configBefore = await readFile(fixture.configPath, "utf8");
      const prompt = async (text: string) => {
        const start = fixture.created.session.state.messages.length;
        await fixture.created.session.prompt(text, { expandPromptTemplates: false, source: "interactive" });
        return fixture.created.session.state.messages.slice(start)
          .filter((candidate) => candidate.role === "toolResult" && candidate.toolName === "sub")
          .flatMap((candidate) => (candidate as any).details?.results ?? []);
      };
      const first = (await prompt("first"))[0];
      expect(first).toMatchObject({
        status: "completed", selector: "general", selectionScope: "scope-a",
        requestedModel: fixture.requestedCanonical, effectiveModel: fixture.requestedCanonical,
        modelLayer: "one-shot", source: "structured-request", thinking: "high",
        model: { modelSource: "structured-request", thinkingSource: "structured-request" },
        modelDecision: { overrideDecision: "accepted-structured-request" },
      });
      expect((await prompt("review"))[0]).toMatchObject({ status: "completed", selector: "aili.code-scout", selectionScope: "scope-a", effectiveModel: fixture.requestedCanonical, thinking: "high" });
      expect((await prompt("changed"))[0]).toMatchObject({ status: "completed", selectionScope: "scope-a", thinking: "low" });
      expect((await prompt("other scope"))[0]).toMatchObject({ status: "completed", selectionScope: "scope-b", thinking: "low" });
      const parallel = await prompt("parallel");
      expect(parallel).toHaveLength(2);
      expect(parallel).toEqual(expect.arrayContaining([
        expect.objectContaining({ status: "completed", selector: "general", selectionScope: "scope-c", effectiveModel: fixture.requestedCanonical, source: "structured-request" }),
        expect.objectContaining({ status: "completed", selector: "aili.code-scout", selectionScope: "scope-c", effectiveModel: fixture.requestedCanonical, source: "structured-request" }),
      ]));

      const state = await parentState(fixture.production);
      const submit = (extra: Record<string, unknown>) => state.runtime.sub.submit({ description: "next", prompt: "controlled follow-up", task_id: first.taskId, ...extra });
      // An explicit instance override applies to this actual continuation ID,
      // but each supplied structured field still outranks it independently.
      await state.runtime.journal.append({ kind: "model.put", agentId: first.taskId, payload: { model: fixture.requestedCanonical, thinking: "low" } });
      const modelsBefore = structuredClone(state.runtime.journal.getState().models);
      expect((await submit({ thinking: "high", selectionScope: "scope-a" })).results[0]).toMatchObject({ status: "completed", taskId: first.taskId, model: { modelSource: "instance-override", thinkingSource: "structured-request" }, thinking: "high" });
      expect((await submit({ model: fixture.requestedCanonical, selectionScope: "changed-label" })).results[0]).toMatchObject({ status: "completed", model: { modelSource: "structured-request", thinkingSource: "instance-override" }, thinking: "low" });
      const omitted = (await submit({})).results[0]!;
      expect(omitted).toMatchObject({ status: "completed", taskId: first.taskId, source: "instance-override", thinking: "low" });
      expect(omitted.selectionScope).toBeUndefined();
      expect(omitted.modelDecision).toBeUndefined();
      const fresh = await state.runtime.sub.submit({ description: "no-scope", prompt: "controlled fresh child", subagent_type: "general", model: fixture.requestedCanonical });
      expect(fresh.results[0]).toMatchObject({ status: "completed", model: { modelSource: "structured-request", thinkingSource: "user-role-override" }, thinking: "off" });
      const defaults = await state.runtime.sub.submit({ description: "defaults", prompt: "controlled defaults", subagent_type: "general" });
      expect(defaults.results[0]).toMatchObject({ status: "completed", effectiveModel: `${providerName}/${model.id}`, source: "user-role-override", thinking: "off" });
      expect(await readFile(fixture.configPath, "utf8")).toBe(configBefore);
      expect(state.runtime.journal.getState().models).toEqual(modelsBefore);
      expect(state.runtime.journal.getState().turns[first.turnId]?.metadata).toMatchObject({ source: "structured-request", modelSource: "structured-request", thinkingSource: "structured-request", overrideDecision: "accepted-structured-request" });
      expect(fixture.questionnaire).not.toHaveBeenCalled();
      expect(state.runtime.activity.list().some((event) => event.data?.interactionKind === "selection")).toBe(false);
    } finally {
      await fixture.created.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }).catch(() => undefined);
      fixture.created.session.dispose();
    }
  }, 30_000);
});

describe("production structured preallocation boundaries", () => {
  it.each(["explicit", "omitted", "external"] as const)("rejects late invalidation during async %s preparation with zero allocation", async (requestKind) => {
    const fixture = await createPreflightFixture();
    const request = requestKind === "external" ? { cli: "codex-cli", model: "vendor-model-high", thinking: "high" }
      : requestKind === "explicit" ? { model: fixture.canonical, thinking: "high" } : {};
    try {
      const alternateCwd = join(scratch, "other-project");
      await mkdir(alternateCwd, { recursive: true });
      const originalLoad = ModelConfigStore.prototype.load;
      const load = requestKind === "external" ? undefined : vi.spyOn(ModelConfigStore.prototype, "load");
      for (const mutation of ["request-abort", "context-abort", "session", "session-path", "project", "missing-project", "canonical-project", "reload", "shutdown"] as const) {
        fixture.state.context = fixture.context;
        const entered = deferred<void>();
        const release = deferred<void>();
        if (requestKind === "external") {
          fixture.probe.mockImplementationOnce(async () => {
            entered.resolve();
            await release.promise;
            return fixture.cliProbe;
          });
        } else {
          load!.mockImplementationOnce(async function(this: ModelConfigStore, trusted) {
            const loaded = await originalLoad.call(this, trusted);
            entered.resolve();
            await release.promise;
            return loaded;
          });
        }
        const alias = join(scratch, `project-alias-${requestKind}-${mutation}`);
        if (mutation === "canonical-project") {
          await symlink(fixture.context.cwd, alias);
          fixture.state.context = { ...fixture.context, cwd: alias };
        }
        const controller = new AbortController();
        const pending = fixture.submit({ ...request, selectionScope: "same-label" }, controller.signal);
        const rejected = expect(pending).rejects.toThrow(/SUB_SELECTION_DENIED.*preflight expired/);
        await entered.promise;
        if (mutation === "request-abort") controller.abort();
        else if (mutation === "context-abort") {
          const aborted = new AbortController(); aborted.abort();
          fixture.state.context = { ...fixture.state.context, signal: aborted.signal };
        } else if (mutation === "session" || mutation === "session-path") {
          fixture.state.context = { ...fixture.state.context, sessionManager: {
            ...fixture.context.sessionManager,
            ...(mutation === "session" ? { getSessionId: () => "other-parent" } : { getSessionFile: () => join(scratch, "other-parent.jsonl") }),
          } };
        } else if (mutation === "canonical-project") {
          await rm(alias);
          await symlink(alternateCwd, alias);
        } else if (mutation === "project" || mutation === "missing-project") {
          fixture.state.context = { ...fixture.context, cwd: mutation === "project" ? alternateCwd : join(scratch, "missing-project") };
        } else {
          await fixture.emit(mutation === "reload" ? "session_start" : "session_shutdown");
        }
        release.resolve();
        await rejected;
        expect(fixture.state.runtime.journal.getState()).toMatchObject({ lastSequence: 0, agents: {}, jobs: {}, turns: {}, runs: {} });
        expect(fixture.managedExecute).not.toHaveBeenCalled();
        expect(fixture.externalExecute).not.toHaveBeenCalled();
        expect(fixture.questionnaire).not.toHaveBeenCalled();
        // This loop never allocates work. Shutdown is the final mutation, so
        // no closed scheduler is reused for a successful submission.
      }
    } finally { await fixture.close(); }
  }, 20_000);

  it.each([false, true])("does not allocate a continuation turn after async boundary loss (external=%s)", async (external) => {
    const fixture = await createPreflightFixture();
    try {
      const fields = external ? { cli: "codex-cli" } : { model: fixture.canonical };
      const first = (await fixture.submit(fields)).results[0]!;
      const before = fixture.state.runtime.journal.getState();
      const entered = deferred<void>();
      const release = deferred<void>();
      if (external) fixture.probe.mockImplementationOnce(async () => { entered.resolve(); await release.promise; return fixture.cliProbe; });
      else {
        const originalLoad = ModelConfigStore.prototype.load;
        vi.spyOn(ModelConfigStore.prototype, "load").mockImplementationOnce(async function(this: ModelConfigStore, trusted) {
          const configs = await originalLoad.call(this, trusted);
          entered.resolve(); await release.promise; return configs;
        });
      }
      const pending = fixture.submit({ ...fields, task_id: first.taskId, selectionScope: "different-label" });
      const rejected = expect(pending).rejects.toThrow(/preflight expired/);
      await entered.promise;
      fixture.state.context = { ...fixture.context, sessionManager: { ...fixture.context.sessionManager, getSessionId: () => "switched" } };
      release.resolve();
      await rejected;
      expect(fixture.state.runtime.journal.getState()).toEqual(before);
      expect(fixture.managedExecute.mock.calls.length + fixture.externalExecute.mock.calls.length).toBe(1);
      expect(fixture.questionnaire).not.toHaveBeenCalled();
    } finally { await fixture.close(); }
  });

  it("accepts stable canonical project aliases and checks equivalent fresh contexts without a selection cache", async () => {
    const fixture = await createPreflightFixture();
    try {
      const alias = join(scratch, "same-project-alias");
      await symlink(fixture.context.cwd, alias);
      fixture.state.context = { ...fixture.context, cwd: alias };
      const originalLoad = ModelConfigStore.prototype.load;
      vi.spyOn(ModelConfigStore.prototype, "load").mockImplementationOnce(async function(this: ModelConfigStore, trusted) {
        const configs = await originalLoad.call(this, trusted);
        fixture.state.context = { ...fixture.state.context };
        return configs;
      });
      expect((await fixture.submit({ model: fixture.canonical })).results[0]).toMatchObject({ status: "completed", source: "structured-request" });
      expect(fixture.questionnaire).not.toHaveBeenCalled();
    } finally { await fixture.close(); }
  });

  it.each(["request", "context"] as const)("rejects an initially aborted %s signal even when the other signal is live", async (kind) => {
    const fixture = await createPreflightFixture();
    const aborted = new AbortController(); aborted.abort();
    const live = new AbortController();
    try {
      if (kind === "context") fixture.state.context = { ...fixture.context, signal: aborted.signal };
      await expect(fixture.submit({ model: fixture.canonical }, kind === "request" ? aborted.signal : live.signal)).rejects.toThrow(/already aborted before preflight/);
      expect(fixture.state.runtime.journal.getState()).toMatchObject({ lastSequence: 0, agents: {}, jobs: {}, turns: {} });
      expect(fixture.probe).not.toHaveBeenCalled();
    } finally { await fixture.close(); }
  });

  it("fails strict catalog, thinking, schema and vendor-help checks before any allocation", async () => {
    const fixture = await createPreflightFixture();
    try {
      for (const [request, error] of [
        [{ model: "missing/model" }, /SUB_MODEL_UNAVAILABLE/],
        [{ model: `${providerName}/unavailable` }, /SUB_MODEL_UNAVAILABLE/],
        [{ model: `${providerName}/no-auth` }, /SUB_MODEL_UNAVAILABLE/],
        [{ model: "ambiguous" }, /SUB_MODEL_AMBIGUOUS/],
        [{ model: `${providerName}/${model.id}`, thinking: "high" }, /SUB_THINKING_UNSUPPORTED/],
        [{ thinking: "turbo" }, /thinking/],
        [{ cli: "unknown" }, /sub.cli/],
        [{ confirmed: true }, /unknown fields/],
        [{ model: " vendor-model " }, /exact model/],
        [{ selectionScope: "bad\nlabel" }, /selectionScope/],
        [{ cli: "codex-cli", thinking: "max" }, /does not enumerate thinking/],
        [{ cli: "codex-cli", model: "--runner-flag" }, /runner flag/],
      ] as const) await expect(fixture.submit(request)).rejects.toThrow(error);
      fixture.probe.mockResolvedValueOnce({ ...fixture.cliProbe, help: "Options:\n  --json\n      Print JSON" });
      await expect(fixture.submit({ cli: "codex-cli", model: "vendor-model" })).rejects.toThrow(/no uniquely identifiable/);
      fixture.probe.mockResolvedValueOnce({ ...fixture.cliProbe, help: "Options:\n  --model <MODEL>\n      Model to use\n  --fallback-model <MODEL>\n      Model to use" });
      await expect(fixture.submit({ cli: "codex-cli", model: "vendor-model" })).rejects.toThrow(/SUB_CLI_AMBIGUOUS/);
      expect(fixture.state.runtime.journal.getState()).toMatchObject({ lastSequence: 0, agents: {}, jobs: {}, turns: {}, runs: {} });
      expect(fixture.managedExecute).not.toHaveBeenCalled();
      expect(fixture.externalExecute).not.toHaveBeenCalled();
      expect(fixture.questionnaire).not.toHaveBeenCalled();
    } finally { await fixture.close(); }
  });

  it("keeps external fields exact, labels descriptive, and continuation drivers frozen without selection UI", async () => {
    const fixture = await createPreflightFixture();
    try {
      const first = (await fixture.submit({ cli: "codex-cli", model: "vendor-model-high", thinking: "high" })).results[0]!;
      expect(first).toMatchObject({ status: "completed", backend: "herdr", driver: "external-cli", modelDecision: { overrideDecision: "accepted-structured-request" } });
      expect(fixture.externalExecute.mock.calls[0]![0].launchPlan).toMatchObject({ argv: ["--model", "vendor-model-high", "--effort", "high"], executableBinding: "Unverified" });
      for (const selectionScope of [undefined, "same", "same", "changed"]) {
        await fixture.submit({ task_id: first.taskId, cli: "codex-cli", selectionScope });
        expect(fixture.externalExecute.mock.calls.at(-1)![0].launchPlan?.argv).toEqual([]);
      }
      const parallel = await Promise.all([fixture.submit({ cli: "codex-cli", selectionScope: "same" }), fixture.submit({ cli: "codex-cli", selectionScope: "same" })]);
      expect(parallel.map((result) => result.results[0]!.status)).toEqual(["completed", "completed"]);
      const before = fixture.state.runtime.journal.getState().lastSequence;
      await expect(fixture.submit({ task_id: first.taskId, selectionScope: "same" })).rejects.toThrow(/SUB_CLI_CONTINUATION/);
      await expect(fixture.submit({ task_id: first.taskId, cli: "claude-code", selectionScope: "changed" })).rejects.toThrow(/SUB_CLI_CONTINUATION/);
      expect(fixture.state.runtime.journal.getState().lastSequence).toBe(before);
      const managed = (await fixture.submit({})).results[0]!;
      await expect(fixture.submit({ task_id: managed.taskId, cli: "codex-cli", selectionScope: "same" })).rejects.toThrow(/SUB_CLI_MANAGED_CONTINUATION/);
      expect(fixture.questionnaire).not.toHaveBeenCalled();
      expect(fixture.select).not.toHaveBeenCalled();
    } finally { await fixture.close(); }
  });

  it("preserves headless tool denial, ordinary questionnaire routing, and no-packet external denial", async () => {
    const fixture = await createPreflightFixture();
    try {
      await fixture.submit({ model: fixture.canonical, thinking: "high", selectionScope: "label" });
      const request = (fixture.state.runtime as unknown as { options: PersistentAgentRuntimeOptions }).options.requestInteraction!;
      const packet = { agentId: "fixture", jobId: "job", turnId: "turn", runId: "run", interactionId: "question", payload: { toolName: "write", summary: "ordinary write" }, signal: new AbortController().signal };
      expect(await request({ ...packet, kind: "permission" })).toBe("deny");
      expect(fixture.select).not.toHaveBeenCalled();
      fixture.state.context = { ...fixture.context, hasUI: true };
      fixture.select.mockResolvedValueOnce("Allow once");
      expect(await request({ ...packet, kind: "permission" })).toBe("allow");
      expect(await request({ ...packet, kind: "question", payload: { question: "Which file?", options: ["fixture.ts"] } })).toBe("fixture.ts");
      expect(fixture.questionnaire).toHaveBeenCalledOnce();
      expect(await request({ ...packet, kind: "external-cui-confirmation" })).toBe("deny");
      expect(fixture.select).toHaveBeenCalledOnce();
      expect(fixture.questionnaire).toHaveBeenCalledOnce();
    } finally { await fixture.close(); }
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

interface TestParentState { context: ExtensionContext; runtime: PersistentAgentRuntime; }
async function parentState(production: PersistentAgentProduction): Promise<TestParentState> {
  return await [...(production as unknown as { parents: Map<string, Promise<TestParentState>> }).parents.values()][0]!;
}

/** Real production/coordinator preallocation with fake catalog/probe/executors;
 * never invokes a provider, vendor task, Herdr surface, or host executable. */
async function createPreflightFixture() {
  const cwd = join(scratch, "preflight-project");
  await mkdir(cwd, { recursive: true });
  const parentPath = join(scratch, "preflight-parent.jsonl");
  await writeFile(parentPath, "fixture parent\n");
  const canonical = `${providerName}/reasoning`;
  const models = [model, { ...model, id: "reasoning", reasoning: true }, { ...model, id: "unavailable" }, { ...model, id: "no-auth" }, { ...model, id: "ambiguous" }, { ...model, provider: "other-fixture", id: "ambiguous" }];
  const select = vi.fn(async (): Promise<string | undefined> => undefined);
  const questionnaire = vi.fn(async (questions: any[]) => ({ questions, answers: [{ id: questions[0].id, selectedOptions: ["fixture.ts"] }], cancelled: false }));
  const context = {
    cwd, hasUI: false, mode: "rpc", model, thinkingLevel: "off", scopedModels: [],
    isProjectTrusted: () => true,
    sessionManager: { getSessionFile: () => parentPath, getSessionId: () => "preflight-parent", getEntries: () => [] },
    modelRegistry: {
      getAll: () => models,
      getAvailable: () => models.filter((entry) => entry.id !== "unavailable"),
      hasConfiguredAuth: (entry: Model<any>) => entry.id !== "no-auth",
      find: (provider: string, id: string) => models.find((entry) => entry.provider === provider && entry.id === id),
    },
    ui: { select, questionnaire, notify: vi.fn() },
  } as unknown as ExtensionContext;
  const handlers = new Map<string, (event: unknown, context: ExtensionContext) => unknown>();
  const production = new PersistentAgentProduction({
    registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => ["sub"],
    getAllTools: () => { throw new Error("unbound fixture discovery"); },
    on: (event: string, handler: (event: unknown, context: ExtensionContext) => unknown) => handlers.set(event, handler),
    sendMessage: vi.fn(),
  } as never);
  await production.register();
  const state = await (production as unknown as { parent(context: ExtensionContext): Promise<TestParentState> }).parent(context);
  const managedExecute = vi.spyOn(state.runtime.backends.require("managed"), "execute").mockImplementation(async (input) => ({ output: "fake managed complete", model: input.modelChoice }));
  const externalExecute = vi.spyOn(state.runtime.herdrBackend, "execute").mockResolvedValue({ output: "fake external complete" });
  vi.spyOn(herdr, "probeHerdrDaemon").mockResolvedValue({ socketReachable: true } as Awaited<ReturnType<typeof herdr.probeHerdrDaemon>>);
  const cliProbe: externalCli.ExternalCliProbe = {
    cli: "codex-cli", executable: "codex", version: "fixture 1.0",
    help: "Options:\n  --model <MODEL>\n      Model to use\n  --effort <LEVEL>\n      Reasoning effort. Possible values: low, medium, high",
    identity: "confirmed", completed: { version: true, help: true }, outputTruncated: false,
    yolo: { disposition: "yolo-unavailable", argv: [] },
  };
  const probe = vi.spyOn(externalCli, "probeExternalCli").mockResolvedValue(cliProbe);
  return {
    production, state, context, canonical, questionnaire, select, probe, cliProbe, managedExecute, externalExecute,
    submit: (extra: Record<string, unknown>, signal?: AbortSignal) => state.runtime.sub.submit({ description: "fixture", prompt: "one bounded fixture turn", subagent_type: "aili.code-scout", ...extra }, undefined, signal),
    emit: async (event: string) => { await handlers.get(event)?.({ type: event, reason: "reload" }, context); },
    close: async () => { await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, context); },
  };
}

async function createStructuredRequestFixture() {
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
  const questionnaire = vi.fn(async () => { throw new Error("selection UI must not be called"); });
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
    configPath: join(agentDir, "aili", "model-overrides.json"),
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
