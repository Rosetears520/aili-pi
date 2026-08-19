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
        const hasTaskResult = context.messages.some((message) => message.role === "toolResult" && message.toolName === "task");
        const hasBashResult = context.messages.some((message) => message.role === "toolResult" && message.toolName === "bash");
        if (!isChild && !hasTaskResult) {
          providerCalls.push("parent-task");
          return assistantStream(selected, [{
            type: "toolCall",
            id: "controlled-task-call",
            name: "task",
            arguments: {
              task: PERSISTENT_SANDBOX_TASK_TEXT,
              agent: "general",
              async: false,
              tools: ["bash"],
              workspace: "shared",
              writeScope: { paths: [PERSISTENT_SANDBOX_MARKER_PATH], resources: [] },
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
      systemPrompt: "Use task exactly once.",
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
      tools: ["task", "bash"],
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
      const taskResult = created.session.state.messages.find((message) => message.role === "toolResult" && message.toolName === "task");
      expect(taskResult).toMatchObject({
        isError: false,
        details: {
          results: [{
            status: "completed",
            selector: "general",
            effectiveMode: "sync",
            workspace: {
              requested: "shared",
              writeScope: { paths: ["child-sandbox-marker.txt"], resources: [] },
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
        piVersion: "0.84.2",
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
  });
});

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
