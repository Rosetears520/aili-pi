import { mkdtemp, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRoleProfiles } from "../../src/runtime/roles.js";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import { SubCoordinator, type TaskExecutorInput, type TaskExecutionOutput } from "../../src/runtime/persistent-agents/sub-coordinator.js";
import { validateSubRequest } from "../../src/runtime/persistent-agents/sub-schema.js";
import { PersistentAgentProduction } from "../../src/runtime/persistent-agents/production.js";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRecord } from "../../src/runtime/persistent-agents/types.js";
import {
  ExecutionBackendRegistry,
  ExecutionBackendUnavailableError,
  type ExecutionBackend,
} from "../../src/runtime/persistent-agents/backends/registry.js";
import {
  MANAGED_BACKEND_CAPABILITIES,
  MANAGED_DRIVER_CAPABILITIES,
  resolveAgentBackend,
  resolveAgentDriver,
  type AgentDriverKind,
  type ExecutionBackendKind,
} from "../../src/runtime/persistent-agents/backends/types.js";
import { ManagedExecutionBackend } from "../../src/runtime/persistent-agents/backends/managed.js";
import {
  BackendConfigStore,
  describeBackendSelection,
  loadBackendConfigFile,
  normalizeBackendCommandAction,
  parseBackendCommand,
  resolveBackendSelection,
} from "../../src/runtime/persistent-agents/backends/settings.js";

let scratch = "";
let sequence = 0;

function fakeBackend(kind: ExecutionBackendKind, driver: AgentDriverKind): ExecutionBackend {
  return {
    kind,
    driver,
    capabilities: MANAGED_BACKEND_CAPABILITIES,
    driverCapabilities: MANAGED_DRIVER_CAPABILITIES,
    execute: async () => ({ output: `executed:${kind}` }),
  };
}

async function fixtureJournal(parentId = "parent-backends") {
  const parentFile = join(scratch, `${parentId}.jsonl`);
  await writeFile(parentFile, "fixture parent\n");
  const layout = await ensureSidecarLayout(parentFile);
  return (await CoordinatorJournal.open(layout, parentId, {
    eventId: () => `event-${++sequence}`,
    clock: () => new Date(Date.UTC(2026, 7, 26, 0, 0, sequence)),
  })).journal;
}

function legacyAgent(id: string, backend?: ExecutionBackendKind): AgentRecord {
  return {
    id,
    name: id,
    selector: "general",
    state: "queued",
    ...(backend === undefined ? {} : { backend }),
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  };
}

async function seedIdleAgent(journal: CoordinatorJournal, id: string, backend?: ExecutionBackendKind): Promise<void> {
  await journal.append({ kind: "agent.created", agentId: id, payload: { record: legacyAgent(id, backend) } });
  await journal.append({ kind: "agent.state", agentId: id, payload: { from: "queued", to: "running" } });
  await journal.append({ kind: "agent.state", agentId: id, payload: { from: "running", to: "idle", currentJobId: null, currentTurnId: null } });
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-backends-"));
  sequence = 0;
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("execution backend registry", () => {
  it("resolves registered backends and fails explicitly for unregistered kinds without fallback", () => {
    const registry = new ExecutionBackendRegistry();
    registry.register(fakeBackend("managed", "pi-sdk"));
    expect(registry.require("managed").kind).toBe("managed");
    expect(() => registry.require("herdr")).toThrow(ExecutionBackendUnavailableError);
    try {
      registry.require("herdr");
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutionBackendUnavailableError);
      expect((error as ExecutionBackendUnavailableError).kind).toBe("herdr");
      expect((error as ExecutionBackendUnavailableError).availableKinds).toEqual(["managed"]);
      expect((error as Error).message).toMatch(/refusing to fall back/);
    }
    expect(() => registry.require("bogus")).toThrow(/'bogus'.*not available/);
  });

  it("rejects duplicate registration and unsupported backend/driver pairings", () => {
    const registry = new ExecutionBackendRegistry();
    registry.register(fakeBackend("managed", "pi-sdk"));
    expect(() => registry.register(fakeBackend("managed", "pi-sdk"))).toThrow(/duplicate/);
    expect(() => registry.register(fakeBackend("herdr", "pi-sdk"))).toThrow(/not a formally supported pairing/);
  });
});

describe("backend settings resolution", () => {
  it("defaults to managed with no configuration", async () => {
    const selection = await resolveBackendSelection({
      cwd: scratch,
      projectTrusted: true,
      globalPath: join(scratch, "absent-global.json"),
      projectPath: join(scratch, "absent-project.json"),
    });
    expect(selection).toMatchObject({ backend: "managed", source: "default" });
  });

  it("applies global, then trusted project, then session override in precedence order", async () => {
    const globalPath = join(scratch, "global.json");
    const projectPath = join(scratch, "project", ".pi", "aili", "agent-backend.json");
    await mkdir(join(scratch, "project", ".pi", "aili"), { recursive: true });
    await writeFile(globalPath, JSON.stringify({ schemaVersion: 1, backend: "herdr" }));
    expect((await resolveBackendSelection({ cwd: scratch, projectTrusted: false, globalPath, projectPath })).backend).toBe("herdr");
    await writeFile(projectPath, JSON.stringify({ schemaVersion: 1, backend: "managed" }));
    expect((await resolveBackendSelection({ cwd: scratch, projectTrusted: true, globalPath, projectPath })).backend).toBe("managed");
    expect((await resolveBackendSelection({ cwd: scratch, projectTrusted: false, globalPath, projectPath })).backend).toBe("herdr");
    expect((await resolveBackendSelection({ cwd: scratch, projectTrusted: true, sessionOverride: "herdr", globalPath, projectPath })).source).toBe("session-override");
  });

  it("fails explicitly on malformed or invalid backend config files", async () => {
    const badValue = join(scratch, "bad-value.json");
    await writeFile(badValue, JSON.stringify({ schemaVersion: 1, backend: "codex" }));
    await expect(loadBackendConfigFile(badValue)).rejects.toThrow(/backend must be one of/);
    const badSchema = join(scratch, "bad-schema.json");
    await writeFile(badSchema, JSON.stringify({ schemaVersion: 2, backend: "managed" }));
    await expect(loadBackendConfigFile(badSchema)).rejects.toThrow(/schemaVersion/);
    const badJson = join(scratch, "bad-json.json");
    await writeFile(badJson, "{oops");
    await expect(loadBackendConfigFile(badJson)).rejects.toThrow(/not valid JSON/);
    expect(await loadBackendConfigFile(join(scratch, "missing.json"))).toBeUndefined();
  });

  it("normalizes short backend command aliases while preserving durable names", () => {
    expect(normalizeBackendCommandAction("s")).toBe("status");
    expect(normalizeBackendCommandAction("h")).toBe("herdr");
    expect(normalizeBackendCommandAction("m")).toBe("managed");
    expect(normalizeBackendCommandAction("manage")).toBe("managed");
    expect(normalizeBackendCommandAction("managed")).toBe("managed");
    expect(normalizeBackendCommandAction("unknown")).toBeUndefined();
    expect(parseBackendCommand("global herdr")).toEqual({ scope: "global", action: "herdr" });
    expect(parseBackendCommand("global managed")).toEqual({ scope: "global", action: "managed" });
    expect(parseBackendCommand("global clear")).toEqual({ scope: "global", action: "clear" });
    expect(parseBackendCommand("global h")).toBeUndefined();
    expect(parseBackendCommand("clear")).toBeUndefined();
  });

  it("atomically sets and clears only the global backend while preserving Herdr settings", async () => {
    const globalPath = join(scratch, "global.json");
    await writeFile(globalPath, JSON.stringify({ schemaVersion: 1, herdr: { maxLiveSurfaces: 3 } }));
    const store = new BackendConfigStore({ globalPath });

    await expect(store.setGlobalBackend("bogus" as ExecutionBackendKind)).rejects.toThrow(/managed, herdr/);
    expect(await readFile(globalPath, "utf8")).toBe(JSON.stringify({ schemaVersion: 1, herdr: { maxLiveSurfaces: 3 } }));
    await expect(store.setGlobalBackend("herdr")).resolves.toMatchObject({ backend: "herdr", herdr: { maxLiveSurfaces: 3 } });
    expect(JSON.parse(await readFile(globalPath, "utf8"))).toEqual({
      schemaVersion: 1,
      herdr: { maxLiveSurfaces: 3 },
      backend: "herdr",
    });

    await expect(store.setGlobalBackend(undefined)).resolves.toMatchObject({ herdr: { maxLiveSurfaces: 3 } });
    expect(JSON.parse(await readFile(globalPath, "utf8"))).toEqual({
      schemaVersion: 1,
      herdr: { maxLiveSurfaces: 3 },
    });
  });

  it("leaves existing global config bytes unchanged on malformed input, lock contention, or replacement failure", async () => {
    const globalPath = join(scratch, "global.json");
    const store = new BackendConfigStore({ globalPath });
    const malformed = "{not json";
    await writeFile(globalPath, malformed);
    await expect(store.setGlobalBackend("managed")).rejects.toThrow(/not valid JSON/);
    expect(await readFile(globalPath, "utf8")).toBe(malformed);
    const invalidHerdr = JSON.stringify({ schemaVersion: 1, herdr: 3 });
    await writeFile(globalPath, invalidHerdr);
    await expect(store.setGlobalBackend("managed")).rejects.toThrow(/herdr config must be an object/);
    expect(await readFile(globalPath, "utf8")).toBe(invalidHerdr);

    const prior = JSON.stringify({ schemaVersion: 1, backend: "herdr" });
    await writeFile(globalPath, prior);
    const lock = await open(`${globalPath}.lock`, "wx", 0o600);
    await expect(store.setGlobalBackend("managed")).rejects.toThrow(/lock unavailable/);
    expect(await readFile(globalPath, "utf8")).toBe(prior);
    await lock.close();
    await rm(`${globalPath}.lock`);

    const failing = new BackendConfigStore({
      globalPath,
      beforeRename: async () => { throw new Error("replacement failed"); },
    });
    await expect(failing.setGlobalBackend("managed")).rejects.toThrow("replacement failed");
    expect(await readFile(globalPath, "utf8")).toBe(prior);
  });

  it("applies a successful global command to this session only after the durable write succeeds", async () => {
    const globalPath = join(scratch, "global.json");
    const projectPath = join(scratch, ".pi", "aili", "agent-backend.json");
    const parentPath = join(scratch, "parent.jsonl");
    await mkdir(join(scratch, ".pi", "aili"), { recursive: true });
    await writeFile(globalPath, JSON.stringify({ schemaVersion: 1, herdr: { maxLiveSurfaces: 3 } }));
    await writeFile(projectPath, JSON.stringify({ schemaVersion: 1, backend: "managed" }));
    const production = new PersistentAgentProduction({} as ExtensionAPI, { globalBackendConfigPath: globalPath });
    const context = {
      cwd: scratch,
      isProjectTrusted: () => true,
      sessionManager: { getSessionFile: () => parentPath },
    } as unknown as ExtensionContext;
    const directBackend = (production as unknown as {
      directBackend: (args: string, context: ExtensionContext) => Promise<string>;
    }).directBackend.bind(production);
    const overrides = (production as unknown as {
      sessionBackendOverrides: Map<string, ExecutionBackendKind>;
    }).sessionBackendOverrides;

    await expect(directBackend("global herdr", context)).resolves.toContain("Global backend preference set to herdr");
    expect(overrides.get(parentPath)).toBe("herdr");
    expect((await resolveBackendSelection({ cwd: scratch, projectTrusted: true, globalPath, projectPath, sessionOverride: overrides.get(parentPath) })).backend).toBe("herdr");
    expect(await loadBackendConfigFile(globalPath)).toEqual({ schemaVersion: 1, backend: "herdr", herdr: { maxLiveSurfaces: 3 } });

    await expect(directBackend("global clear", context)).resolves.toContain("Global backend preference cleared");
    expect(overrides.has(parentPath)).toBe(false);
    expect((await resolveBackendSelection({ cwd: scratch, projectTrusted: true, globalPath, projectPath })).backend).toBe("managed");
    expect(await loadBackendConfigFile(globalPath)).toEqual({ schemaVersion: 1, herdr: { maxLiveSurfaces: 3 } });

    await expect(directBackend("global managed", context)).resolves.toContain("Global backend preference set to managed");
    expect(overrides.get(parentPath)).toBe("managed");
    expect(await loadBackendConfigFile(globalPath)).toEqual({ schemaVersion: 1, backend: "managed", herdr: { maxLiveSurfaces: 3 } });
    await directBackend("global clear", context);
    expect(overrides.has(parentPath)).toBe(false);

    await writeFile(globalPath, "{bad");
    await expect(directBackend("global herdr", context)).rejects.toThrow(/not valid JSON/);
    expect(overrides.has(parentPath)).toBe(false);
  });

  it("describes selection with availability and the frozen-existing-agents notice", () => {
    const text = describeBackendSelection(
      { backend: "herdr", source: "session-override", projectConfigPresent: false, globalConfigPresent: true, sessionOverridePresent: true },
      ["managed"],
    );
    expect(text).toContain("New Agents backend: herdr (source: session-override)");
    expect(text).toContain("herdr: not available in this build");
    expect(text).toContain("global <herdr|managed|clear>");
    expect(text).toContain("Existing Agents: unchanged");
  });
});

describe("backend-aware coordinator journal", () => {
  it("interprets legacy agents without backend as managed at read time", async () => {
    const journal = await fixtureJournal();
    await journal.append({ kind: "agent.created", agentId: "Legacy", payload: { record: legacyAgent("Legacy") } });
    const reopened = (await CoordinatorJournal.open(journal.layout, "parent-backends")).journal;
    const agent = reopened.getState().agents["Legacy"]!;
    expect(resolveAgentBackend(agent)).toBe("managed");
    expect(resolveAgentDriver(agent)).toBe("pi-sdk");
    expect(Object.keys(reopened.getState().runs)).toEqual([]);
  });

  it("records and replays backend/driver on new agents and validates run lifecycle transitions", async () => {
    const journal = await fixtureJournal();
    await journal.append({ kind: "agent.created", agentId: "Modern", payload: { record: legacyAgent("Modern", "herdr") } });
    expect(resolveAgentBackend(journal.getState().agents["Modern"]!)).toBe("herdr");
    expect(resolveAgentDriver(journal.getState().agents["Modern"]!)).toBe("pi-cli");

    const run = {
      schemaVersion: 1 as const,
      runId: "run-1",
      agentId: "Modern",
      backend: "herdr" as const,
      driver: "pi-cli" as const,
      lifecycle: "allocated" as const,
      controlMode: "aili" as const,
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
    };
    await journal.append({ kind: "run.created", agentId: "Modern", runId: "run-1", payload: { record: run } });
    await journal.append({ kind: "run.state", agentId: "Modern", runId: "run-1", payload: { from: "allocated", to: "starting" } });
    await journal.append({ kind: "run.state", agentId: "Modern", runId: "run-1", payload: { from: "starting", to: "live" } });
    await journal.append({ kind: "run.control", agentId: "Modern", runId: "run-1", payload: { controlMode: "mixed" } });
    await journal.append({ kind: "run.state", agentId: "Modern", runId: "run-1", payload: { from: "live", to: "stopping" } });
    await journal.append({ kind: "run.state", agentId: "Modern", runId: "run-1", payload: { from: "stopping", to: "stopped", stopReason: "completed" } });
    const state = journal.getState();
    expect(state.runs["run-1"]!.lifecycle).toBe("stopped");
    expect(state.runs["run-1"]!.stopReason).toBe("completed");
    expect(state.runs["run-1"]!.controlMode).toBe("mixed");
    const replayed = (await CoordinatorJournal.open(journal.layout, "parent-backends")).journal;
    expect(replayed.getState().runs["run-1"]!.lifecycle).toBe("stopped");
    // Snapshots round-trip the runs map for pre-run snapshots too.
    await replayed.compact();
    const reopened = (await CoordinatorJournal.open(journal.layout, "parent-backends")).journal;
    expect(reopened.getState().runs["run-1"]!.lifecycle).toBe("stopped");

    // A failed append poisons that journal instance's writer chain, so the
    // illegal-transition rejection is verified on its own journal.
    const invalid = await fixtureJournal("parent-invalid");
    await invalid.append({ kind: "agent.created", agentId: "Modern", payload: { record: legacyAgent("Modern") } });
    await invalid.append({ kind: "run.created", agentId: "Modern", runId: "run-1", payload: { record: { ...run, backend: "managed" as const, driver: "pi-sdk" as const } } });
    await expect(invalid.append({ kind: "run.state", agentId: "Modern", runId: "run-1", payload: { from: "allocated", to: "live" } })).rejects.toThrow(/invalid transition/);
  });

  it("rejects run records with unsupported backend/driver pairing or unknown agents", async () => {
    // Each failing append poisons its journal instance; use one per case.
    const ghost = await fixtureJournal("parent-ghost");
    await expect(ghost.append({
      kind: "run.created",
      agentId: "Ghost",
      runId: "run-1",
      payload: {
        record: {
          schemaVersion: 1,
          runId: "run-1",
          agentId: "Ghost",
          backend: "herdr",
          driver: "pi-cli",
          lifecycle: "allocated",
          controlMode: "aili",
          createdAt: "2026-08-26T00:00:00.000Z",
          updatedAt: "2026-08-26T00:00:00.000Z",
        },
      },
    })).rejects.toThrow(/unknown owning Agent/);

    const pairing = await fixtureJournal("parent-pairing");
    await pairing.append({ kind: "agent.created", agentId: "Modern", payload: { record: legacyAgent("Modern") } });
    await expect(pairing.append({
      kind: "run.created",
      agentId: "Modern",
      runId: "run-1",
      payload: {
        record: {
          schemaVersion: 1,
          runId: "run-1",
          agentId: "Modern",
          backend: "herdr",
          driver: "pi-sdk",
          lifecycle: "allocated",
          controlMode: "aili",
          createdAt: "2026-08-26T00:00:00.000Z",
          updatedAt: "2026-08-26T00:00:00.000Z",
        },
      },
    })).rejects.toThrow(/not formally supported/);

    const corrupt = await fixtureJournal("parent-corrupt");
    await expect(corrupt.append({
      kind: "agent.created",
      agentId: "Corrupt",
      payload: { record: { ...legacyAgent("Corrupt"), backend: "codex" as unknown as ExecutionBackendKind } },
    })).rejects.toThrow(/unknown execution backend/);
  });
});

describe("managed execution backend adapter", () => {
  async function baseInput(journal: CoordinatorJournal, agentId = "Worker") {
    await seedIdleAgent(journal, agentId);
    return { agentId, jobId: "job-1", turnId: "turn-1" } as unknown as TaskExecutorInput;
  }

  it("wraps the in-process executor unchanged and records one stopped run", async () => {
    const journal = await fixtureJournal();
    const input = await baseInput(journal);
    const appended: unknown[] = [];
    const seenInputs: TaskExecutionOutput[] = [];
    const manager = { appendMessage: (message: unknown) => appended.push(message) };
    const backend = new ManagedExecutionBackend({
      journal,
      childManager: async () => manager as never,
      preflight: async () => undefined,
      execute: async (executed) => {
        seenInputs.push(executed as never);
        return { output: "ok" };
      },
    });
    const output = await backend.execute(input);
    expect(output).toMatchObject({ output: "ok", backend: "managed", driver: "pi-sdk", runId: "run-1" });
    expect(seenInputs.length).toBe(1);
    expect((seenInputs[0] as { sessionManager?: unknown }).sessionManager).toBe(manager);
    expect(appended).toEqual([]);
    const run = journal.getState().runs["run-1"]!;
    expect(run.lifecycle).toBe("stopped");
    expect(run.backend).toBe("managed");
    expect(run.stopReason).toBe("completed");
  });

  it("records preflight failure as child evidence, fails the run, and rethrows", async () => {
    const journal = await fixtureJournal();
    const input = await baseInput(journal);
    const appended: unknown[] = [];
    const manager = { appendMessage: (message: unknown) => appended.push(message) };
    const backend = new ManagedExecutionBackend({
      journal,
      childManager: async () => manager as never,
      preflight: async () => { throw new Error("workspace unavailable"); },
      execute: async () => ({ output: "must not run" }),
    });
    await expect(backend.execute(input)).rejects.toThrow("workspace unavailable");
    expect(appended.length).toBe(1);
    expect(JSON.stringify(appended[0])).toContain("Agent preflight failed before execution: workspace unavailable");
    const run = journal.getState().runs["run-1"]!;
    expect(run.lifecycle).toBe("failed");
    expect(run.failure).toContain("workspace unavailable");
  });

  it("marks the run failed when the inner executor throws", async () => {
    const journal = await fixtureJournal();
    const input = await baseInput(journal);
    const backend = new ManagedExecutionBackend({
      journal,
      childManager: async () => ({ appendMessage: () => undefined }) as never,
      execute: async () => { throw new Error("boom"); },
    });
    await expect(backend.execute(input)).rejects.toThrow("boom");
    expect(journal.getState().runs["run-1"]!.lifecycle).toBe("failed");
  });
});

describe("coordinator backend resolution and freeze", () => {
  it("fails the whole submission before allocation when the resolved backend is unavailable", async () => {
    const journal = await fixtureJournal("parent-unavailable");
    const profiles = await loadRoleProfiles();
    const coordinator = new SubCoordinator({
      journal,
      loadProfiles: async () => profiles,
      resolveBackend: () => {
        throw new ExecutionBackendUnavailableError("herdr", ["managed"]);
      },
      execute: async () => ({ output: "must not run" }),
    });
    await expect(coordinator.submit({ description: "d", prompt: "p", subagent_type: "general" })).rejects.toThrow(/herdr.*not available.*refusing to fall back/s);
    const state = journal.getState();
    expect(Object.keys(state.agents)).toEqual([]);
    expect(Object.keys(state.jobs)).toEqual([]);
    expect(Object.keys(state.turns)).toEqual([]);
    expect(Object.keys(state.runs)).toEqual([]);
  });

  it("records the resolved backend on new agents and echoes it in results", async () => {
    const journal = await fixtureJournal("parent-new");
    const profiles = await loadRoleProfiles();
    const executed: string[] = [];
    const coordinator = new SubCoordinator({
      journal,
      loadProfiles: async () => profiles,
      resolveBackend: () => "managed",
      execute: async (input) => {
        executed.push(input.backend ?? "absent");
        return { output: "done" };
      },
    });
    const response = await coordinator.submit({ description: "d", prompt: "p", subagent_type: "general" });
    expect(executed).toEqual(["managed"]);
    expect(response.results[0]).toMatchObject({ backend: "managed", driver: "pi-sdk" });
    const agent = Object.values(journal.getState().agents)[0]!;
    expect(agent.backend).toBe("managed");
    expect(agent.driver).toBe("pi-sdk");
  });

  it("passes the same preallocated current-turn model decision to managed and Herdr execution", async () => {
    const profiles = await loadRoleProfiles();
    const observations: Array<{ backend?: string; canonical?: string; decision?: string }> = [];
    for (const backend of ["managed", "herdr"] as const) {
      const journal = await fixtureJournal(`parent-authority-${backend}`);
      const coordinator = new SubCoordinator({
        journal,
        loadProfiles: async () => profiles,
        resolveBackend: () => backend,
        preflight: async () => ({
          choice: {
            provider: "provider",
            model: "chosen",
            canonical: "provider/chosen",
            layer: "direct-user-turn",
            source: "direct-user-turn",
            modelSource: "direct-user-turn",
            thinkingSource: "direct-user-turn",
            thinking: "high",
            persistent: false,
            oneShot: false,
          },
          currentTurnModelAuthority: { mode: "explicit", allowedModels: ["provider/chosen"] },
          modelDecision: { requestedModel: "provider/chosen", requestedThinking: null, overrideDecision: "accepted-direct-user" },
        }),
        execute: async (input) => {
          observations.push({ backend: input.backend, canonical: input.modelChoice?.canonical, decision: input.modelDecision?.overrideDecision });
          return { output: "done", backend, driver: backend === "managed" ? "pi-sdk" : "pi-cli" };
        },
      });
      await coordinator.submit({ description: "d", prompt: "p", subagent_type: "general", model: "provider/chosen" });
    }
    expect(observations).toEqual([
      { backend: "managed", canonical: "provider/chosen", decision: "accepted-direct-user" },
      { backend: "herdr", canonical: "provider/chosen", decision: "accepted-direct-user" },
    ]);
  });

  it("freezes the creation-time backend for continuations regardless of current settings", async () => {
    const journal = await fixtureJournal("parent-frozen");
    const profiles = await loadRoleProfiles();
    await seedIdleAgent(journal, "Frozen", "herdr");
    const executed: string[] = [];
    const coordinator = new SubCoordinator({
      journal,
      loadProfiles: async () => profiles,
      resolveBackend: () => "managed",
      execute: async (input) => {
        executed.push(input.backend ?? "absent");
        return { output: "done" };
      },
    });
    const response = await coordinator.submit({ description: "d", prompt: "follow-up", task_id: "Frozen" });
    expect(executed).toEqual(["herdr"]);
    expect(response.results[0]).toMatchObject({ backend: "herdr", driver: "pi-cli" });
  });
});

describe("Herdr batch consistency", () => {
  it("preflights every item before allocation and keeps runtime failures independent", async () => {
    const profiles = await loadRoleProfiles();
    const rejectedJournal = await fixtureJournal("parent-batch-rejected");
    const rejected = new SubCoordinator({
      journal: rejectedJournal,
      loadProfiles: async () => profiles,
      resolveBackend: () => "herdr",
      checkBackendSupport: (_backend, item) => { if (item.task === "unsupported") throw new Error("unsupported capability"); },
      execute: async () => ({ output: "must not run" }),
    });
    await expect(rejected.submitTrusted({ tasks: [
      { task: "ok", agent: "aili.code-scout", async: false },
      { task: "unsupported", agent: "aili.code-reviewer", async: false },
    ] })).rejects.toThrow(/unsupported capability/);
    expect(Object.keys(rejectedJournal.getState().agents)).toEqual([]);

    const journal = await fixtureJournal("parent-batch-runtime");
    const coordinator = new SubCoordinator({
      journal,
      loadProfiles: async () => profiles,
      resolveBackend: () => "herdr",
      checkBackendSupport: () => undefined,
      execute: async (input) => { if (input.item.task === "fails") throw new Error("runtime failure"); return { output: `done:${input.item.task}`, backend: "herdr", driver: "pi-cli" }; },
    });
    const response = await coordinator.submitTrusted({ tasks: [
      { task: "fails", agent: "aili.code-scout", async: false },
      { task: "continues", agent: "aili.code-reviewer", async: false },
    ] });
    expect(response.results.map((item) => item.status).sort()).toEqual(["completed", "failed"]);
    expect(response.results.find((item) => item.status === "completed")).toMatchObject({ output: "done:continues", backend: "herdr" });
  });
});

describe("model-facing surface stays backend-free", () => {
  it("rejects a model-provided backend field explicitly", async () => {
    const profiles = await loadRoleProfiles();
    expect(() => validateSubRequest({ description: "d", prompt: "p", subagent_type: "general", backend: "herdr" }, profiles))
      .toThrow(/sub\.backend is not a model-facing field.*user-only/s);
  });

  it("accepts only a cosmetic split hint (right|down) and nothing looser", async () => {
    const profiles = await loadRoleProfiles();
    expect(validateSubRequest({ description: "d", prompt: "p", subagent_type: "general", split: "down" }, profiles).item.splitHint).toBe("down");
    expect(() => validateSubRequest({ description: "d", prompt: "p", subagent_type: "general", split: "diagonal" }, profiles)).toThrow(/sub\.split must be exactly right or down/);
  });
});
