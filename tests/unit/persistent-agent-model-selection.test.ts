import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ModelConfigurationService,
  ModelConfigStore,
  confirmTaskModelRequest,
  ModelSelectionError,
  parseModelOverrideConfig,
  revalidateResolvedModelChoice,
  resolveAgentModel,
  resolveModelChoice,
  validateCurrentTurnAuthority,
  validateCurrentTurnModelRequest,
  type CatalogModel,
  type ModelCatalog,
  type ModelOverride,
} from "../../src/runtime/persistent-agents/model-selection.js";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import type { AgentRecord } from "../../src/runtime/persistent-agents/types.js";

let scratch = "";
let globalPath = "";
let projectPath = "";
let journal: CoordinatorJournal;
let event = 0;

const models: Record<string, CatalogModel> = {
  "provider/one": { provider: "provider", model: "one", available: true, authenticated: true, thinkingLevels: ["low", "medium", "high"] },
  "provider/instance": { provider: "provider", model: "instance", available: true, authenticated: true },
  "provider/project": { provider: "provider", model: "project", available: true, authenticated: true },
  "provider/user": { provider: "provider", model: "user", available: true, authenticated: true },
  "provider/profile": { provider: "provider", model: "profile", available: true, authenticated: true },
  "provider/parent": { provider: "provider", model: "parent", available: true, authenticated: true },
  "provider/unavailable": { provider: "provider", model: "unavailable", available: false, authenticated: true },
  "provider/noauth": { provider: "provider", model: "noauth", available: true, authenticated: false },
  "provider/limited": { provider: "provider", model: "limited", available: true, authenticated: true, thinkingLevels: ["low"] },
};

function catalog(overrides: Partial<ModelCatalog> = {}): ModelCatalog {
  return {
    resolve: async (id) => models[id],
    resolveParentFallback: async () => models["provider/parent"],
    resolveBare: async (id) => Object.values(models).filter((model) => model.model === id),
    ...overrides,
  };
}

async function createAgent(id: string, selector = "general"): Promise<void> {
  const now = "2026-07-25T05:00:00.000Z";
  const record: AgentRecord = { id, name: id, selector, state: "queued", createdAt: now, updatedAt: now };
  await journal.append({ kind: "agent.created", agentId: id, payload: { record } });
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-model-"));
  globalPath = join(scratch, "user", "model-overrides.json");
  projectPath = join(scratch, "project", ".pi", "aili", "model-overrides.json");
  const parent = join(scratch, "parent.jsonl");
  await writeFile(parent, "fixture parent\n");
  const layout = await ensureSidecarLayout(parent);
  event = 0;
  journal = (await CoordinatorJournal.open(layout, "parent-1", {
    eventId: () => `event-${++event}`,
    clock: () => new Date(Date.UTC(2026, 6, 25, 5, 0, event)),
  })).journal;
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("direct-parent model resolution", () => {
  const base = {
    selector: "general",
    agentId: "Worker",
    oneShot: { model: "provider/one", thinking: "high" as const },
    instance: { model: "provider/instance" },
    projectRole: { model: "provider/project" },
    projectTrusted: true,
    userRole: { model: "provider/user" },
    profile: { model: "provider/profile" },
    parentThinking: "medium" as const,
  };

  it("keeps user-owned precedence above a confirmed one-shot and records source-aware inheritance", async () => {
    // Per-field resolution: the instance layer provides the model while the
    // confirmed one-shot still provides its thinking.
    expect(await resolveModelChoice(base, catalog())).toMatchObject({ canonical: "provider/instance", layer: "instance", source: "instance-override", modelSource: "instance-override", oneShot: false, thinking: "high", thinkingSource: "user-one-shot" });
    expect(await resolveModelChoice({ ...base, instance: undefined }, catalog())).toMatchObject({ canonical: "provider/project", layer: "project-role", source: "project-role-override", modelSource: "project-role-override" });
    expect(await resolveModelChoice({ ...base, instance: undefined, projectRole: undefined }, catalog())).toMatchObject({ canonical: "provider/user", layer: "user-role", source: "user-role-override", modelSource: "user-role-override" });
    expect(await resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined }, catalog())).toMatchObject({ canonical: "provider/one", layer: "one-shot", source: "confirmed-one-shot", modelSource: "user-one-shot", oneShot: true, thinking: "high", thinkingSource: "user-one-shot" });
    expect(await resolveModelChoice({ ...base, oneShot: undefined, instance: undefined, projectRole: undefined, userRole: undefined, parent: { provider: "provider", model: "parent", canonical: "provider/parent", thinking: "high", speedTier: "priority" } }, catalog())).toMatchObject({ canonical: "provider/parent", source: "inherited-parent", modelSource: "inherited-parent", thinking: "high", thinkingSource: "inherited-parent", speedTier: "priority" });
    expect(await resolveModelChoice({ ...base, oneShot: undefined, instance: undefined, projectRole: undefined, userRole: undefined, parent: undefined }, catalog())).toMatchObject({ canonical: "provider/profile", layer: "profile", source: "profile-fallback", modelSource: "profile-fallback" });
    expect(await resolveModelChoice({ ...base, oneShot: undefined, instance: undefined, projectRole: undefined, userRole: undefined, profile: undefined }, catalog())).toMatchObject({ canonical: "provider/parent", layer: "runtime-fallback", source: "runtime-fallback", modelSource: "runtime-fallback" });
  });

  it("applies a direct user-turn instruction above every persistent layer", async () => {
    expect(await resolveModelChoice({ ...base, directUserTurn: { model: "provider/one" } }, catalog())).toMatchObject({
      canonical: "provider/one",
      layer: "direct-user-turn",
      source: "direct-user-turn",
      modelSource: "direct-user-turn",
      oneShot: false,
      persistent: false,
    });
    // A thinking-only current-turn instruction outranks persistent thinking
    // while the persistent layer keeps providing the model.
    expect(await resolveModelChoice({ ...base, instance: { model: "provider/instance", thinking: "low" }, directUserTurn: { thinking: "high" } }, catalog())).toMatchObject({
      canonical: "provider/instance",
      layer: "instance",
      modelSource: "instance-override",
      thinking: "high",
      thinkingSource: "direct-user-turn",
    });
  });

  it("resolves an explicit bare model through Parent provider first and otherwise requires one candidate", async () => {
    const candidates: CatalogModel[] = [
      { provider: "other", model: "shared", available: true, authenticated: true },
      { provider: "provider", model: "shared", available: true, authenticated: true },
    ];
    expect(await resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined, oneShot: { model: "shared" } }, catalog({ resolveBare: async () => candidates }))).toMatchObject({ canonical: "provider/shared", layer: "one-shot" });
    await expect(resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined, oneShot: { model: "shared" } }, catalog({ resolveBare: async () => [
      { provider: "provider", model: "shared", available: false, authenticated: true },
      { provider: "other", model: "shared", available: true, authenticated: true },
    ] }))).rejects.toThrow(/matches Parent provider provider but is unavailable.*other providers were not considered/);
    expect(await resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined, oneShot: { model: "unique" } }, catalog({ resolveBare: async () => [{ provider: "other", model: "unique", available: true, authenticated: true }] }))).toMatchObject({ canonical: "other/unique" });
    await expect(resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined, oneShot: { model: "shared" } }, catalog({
      resolveParentFallback: async () => undefined,
      resolveBare: async () => candidates,
    }))).rejects.toThrow(/ambiguous.*other\/shared.*provider\/shared/);
    await expect(resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined, oneShot: { model: "missing" } }, catalog({ resolveBare: async () => [] }))).rejects.toThrow(/no authenticated available candidate/);
  });

  it("fails closed for every unusable explicit model without consulting lower layers", async () => {
    const fallback = vi.fn(async () => models["provider/parent"]);
    await expect(resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined, oneShot: { model: "provider/unknown" } }, catalog({ resolveParentFallback: fallback }))).rejects.toMatchObject({ layer: "one-shot" });
    await expect(resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined, oneShot: { model: "provider/unavailable" } }, catalog())).rejects.toThrow(/one-shot.*unavailable.*lower layers were not considered/);
    await expect(resolveModelChoice({ ...base, oneShot: undefined, instance: { model: "provider/noauth" } }, catalog())).rejects.toThrow(/instance.*unauthenticated/);
    await expect(resolveModelChoice({ ...base, oneShot: undefined, instance: undefined, projectRole: undefined, userRole: undefined, profile: { model: "provider/limited", thinking: "high" } }, catalog())).rejects.toThrow(/profile.*incompatible/);
    expect(fallback).not.toHaveBeenCalled();
    await expect(resolveModelChoice({ ...base, oneShot: undefined, instance: undefined, projectRole: undefined, userRole: undefined, profile: undefined }, catalog({ resolveParentFallback: async () => undefined }))).rejects.toBeInstanceOf(ModelSelectionError);
  });

  it("revalidates the frozen identity without consulting fallback or switching models", async () => {
    const frozen = await resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined, profile: undefined }, catalog());
    const fallback = vi.fn(async () => models["provider/parent"]);
    await expect(revalidateResolvedModelChoice(frozen, catalog({
      resolve: async () => ({ ...models["provider/one"]!, available: false }),
      resolveParentFallback: fallback,
    }))).rejects.toThrow(/no longer available.*frozen identity was not switched/);
    expect(fallback).not.toHaveBeenCalled();
    await expect(revalidateResolvedModelChoice(frozen, catalog({
      resolve: async () => ({ ...models["provider/one"]!, authenticated: false }),
    }))).rejects.toThrow(/no longer authenticated/);
    await expect(revalidateResolvedModelChoice(frozen, catalog({
      resolve: async () => ({ ...models["provider/one"]!, thinkingLevels: ["low"] }),
    }))).rejects.toThrow(/no longer supports thinking=high/);
    await expect(revalidateResolvedModelChoice(frozen, catalog())).resolves.toBeUndefined();
  });

  it("keeps one-shot choices turn-local and allows distinct batch-item choices without state/config pollution", async () => {
    await createAgent("Worker");
    const store = new ModelConfigStore({ globalPath, projectPath });
    await store.setRole("global", "general", { model: "provider/user" }, false);
    await journal.append({ kind: "model.put", agentId: "Worker", payload: { model: "provider/instance" } });
    const beforeBytes = await readFile(globalPath, "utf8");
    const beforeState = journal.getState().models;
    const configs = await store.load(false);
    expect(await resolveAgentModel({
      input: { selector: "general", agentId: "Worker", oneShot: { model: "provider/one" }, projectTrusted: false },
      journal,
      configs,
      catalog: catalog(),
    })).toMatchObject({ canonical: "provider/instance", layer: "instance", modelSource: "instance-override" });
    expect(await resolveModelChoice({ ...base, instance: undefined, projectRole: undefined, userRole: undefined, oneShot: { model: "provider/project" } }, catalog())).toMatchObject({ canonical: "provider/project", layer: "one-shot", modelSource: "user-one-shot" });
    expect(await readFile(globalPath, "utf8")).toBe(beforeBytes);
    expect(journal.getState().models).toEqual(beforeState);
    expect(await resolveAgentModel({
      input: { selector: "general", agentId: "Worker", projectTrusted: false },
      journal,
      configs,
      catalog: catalog(),
    })).toMatchObject({ canonical: "provider/instance", layer: "instance" });
  });
});

describe("current-turn model authority", () => {
  it("rejects model and thinking overrides under inherit-only authority", () => {
    const authority = { mode: "inherit-only" as const };
    expect(validateCurrentTurnModelRequest(undefined, authority)).toBeUndefined();
    expect(() => validateCurrentTurnModelRequest({ model: "provider/one" }, authority)).toThrow(/inherit-only/);
    expect(() => validateCurrentTurnModelRequest({ thinking: "high" }, authority)).toThrow(/inherit-only/);
  });

  it("accepts only explicitly allowed canonical values and delegated catalog choice", async () => {
    expect(validateCurrentTurnAuthority({ mode: "explicit", allowedModels: ["provider/one"], allowedThinking: ["medium"] })).toMatchObject({ mode: "explicit" });
    expect(validateCurrentTurnModelRequest({ model: "provider/one", thinking: "medium" }, { mode: "explicit", allowedModels: ["provider/one"], allowedThinking: ["medium"] })).toEqual({ model: "provider/one", thinking: "medium" });
    expect(() => validateCurrentTurnModelRequest({ model: "provider/parent" }, { mode: "explicit", allowedModels: ["provider/one"] })).toThrow(/not authorized/);
    expect(validateCurrentTurnModelRequest({ model: "one" }, { mode: "delegated-choice", models: "available" })).toEqual({ model: "one" });
    expect(() => validateCurrentTurnModelRequest({ thinking: "high" }, { mode: "delegated-choice", models: "available" })).toThrow(/delegated model-choice/);
    expect(validateCurrentTurnModelRequest({ thinking: "high" }, { mode: "delegated-choice", models: "available", thinkingMode: "available" })).toEqual({ thinking: "high" });
    await expect(resolveModelChoice({ selector: "general", agentId: "Worker", projectTrusted: true, oneShotThinking: "high", parent: { provider: "provider", model: "parent", canonical: "provider/parent", thinking: "medium", speedTier: "standard" } }, catalog())).resolves.toMatchObject({ canonical: "provider/parent", thinking: "high", thinkingSource: "user-one-shot", source: "confirmed-one-shot" });
  });

  it("rejects malformed authority instead of treating it as permission", () => {
    expect(() => validateCurrentTurnAuthority({ mode: "explicit" })).toThrow(/declare allowed/);
    expect(() => validateCurrentTurnAuthority({ mode: "inherit-only", models: "available" })).toThrow(/requires delegated-choice/);
    expect(() => validateCurrentTurnAuthority({ mode: "explicit", allowedModels: ["Terra"] })).toThrow(/provider\/model/);
  });
});

describe("model-facing task confirmation", () => {
  it("requires fresh UI confirmation and never turns a denied or headless request into an override", async () => {
    const parent = { canonical: "provider/parent", thinking: "medium" as const };
    await expect(confirmTaskModelRequest({ model: "provider/one" }, parent, { hasUI: false, confirm: async () => "confirm" })).resolves.toBeUndefined();
    await expect(confirmTaskModelRequest({ model: "provider/one" }, parent, { hasUI: true, confirm: async () => "deny" })).resolves.toBeUndefined();
    await expect(confirmTaskModelRequest({ model: "provider/one" }, parent, { hasUI: true, confirm: async () => "dismiss" })).resolves.toBeUndefined();
    await expect(confirmTaskModelRequest({ model: "provider/one" }, parent, { hasUI: true, confirm: async () => { throw new Error("expired"); } })).resolves.toBeUndefined();
    await expect(confirmTaskModelRequest({ model: "provider/one" }, undefined, { hasUI: true, confirm: async () => "confirm" })).resolves.toBeUndefined();
    await expect(confirmTaskModelRequest({ model: "provider/parent" }, parent, { hasUI: true, confirm: async () => "confirm" })).resolves.toBeUndefined();
    await expect(confirmTaskModelRequest({ model: "provider/one" }, parent, { hasUI: false, confirm: async () => "confirm" })).resolves.toBeUndefined();
    await expect(confirmTaskModelRequest({ model: "provider/one" }, parent, { hasUI: true, confirm: async () => "confirm" })).resolves.toEqual({ model: "provider/one" });
  });

  it("confirms thinking-only requests with a first-class path", async () => {
    const parent = { canonical: "provider/parent", thinking: "medium" as const };
    const seen: string[] = [];
    await expect(confirmTaskModelRequest({ thinking: "high" }, parent, {
      hasUI: true,
      confirm: async ({ requested }) => { seen.push(requested); return "confirm"; },
    })).resolves.toEqual({ thinking: "high" });
    expect(seen).toEqual(["provider/parent thinking=high"]);
    // Same-level thinking as the parent needs no confirmation.
    await expect(confirmTaskModelRequest({ thinking: "medium" }, parent, { hasUI: true, confirm: async () => "confirm" })).resolves.toBeUndefined();
    // Denied thinking-only stays rejected.
    await expect(confirmTaskModelRequest({ thinking: "high" }, parent, { hasUI: true, confirm: async () => "deny" })).resolves.toBeUndefined();
  });
});

describe("atomic role and durable instance configuration", () => {
  it("preserves unrelated global roles/metadata and ignores untrusted project bytes", async () => {
    await mkdir(resolve(globalPath, ".."), { recursive: true });
    const seeded = {
      schemaVersion: 1,
      roles: {
        general: { model: "provider/user" },
        "aili.code-scout": { model: "provider/profile", thinking: "low" },
      },
      metadata: { userNote: "preserve me" },
    };
    await writeFile(globalPath, `${JSON.stringify(seeded, null, 2)}\n`);
    await mkdir(resolve(projectPath, ".."), { recursive: true });
    await writeFile(projectPath, "{malformed project");
    const store = new ModelConfigStore({ globalPath, projectPath });
    const untrusted = await store.load(false);
    expect(untrusted.project).toBeUndefined();
    expect(untrusted.diagnostics).toContain("project model config ignored because project trust is inactive");
    await store.setRole("global", "aili.implementer", { model: "provider/project", thinking: "high" }, false);
    const written = parseModelOverrideConfig(await readFile(globalPath, "utf8"), "global");
    expect(written.roles).toMatchObject({
      general: { model: "provider/user" },
      "aili.code-scout": { model: "provider/profile", thinking: "low" },
      "aili.implementer": { model: "provider/project", thinking: "high" },
    });
    expect(written.metadata).toEqual({ userNote: "preserve me" });
    await expect(store.load(true)).rejects.toThrow(/project model config is malformed JSON/);
  });

  it("leaves bytes unchanged on untrusted project, lock, malformed, and atomic replacement failure", async () => {
    const store = new ModelConfigStore({ globalPath, projectPath });
    await store.setRole("global", "general", { model: "provider/user" }, false);
    const original = await readFile(globalPath, "utf8");
    await expect(store.setRole("project", "general", { model: "provider/project" }, false)).rejects.toThrow(/requires active project trust/);
    await expect(readFile(projectPath, "utf8")).rejects.toThrow();

    await writeFile(`${globalPath}.lock`, "busy");
    await expect(store.setRole("global", "general", { model: "provider/one" }, false)).rejects.toThrow(/lock unavailable/);
    expect(await readFile(globalPath, "utf8")).toBe(original);
    await rm(`${globalPath}.lock`);

    const failing = new ModelConfigStore({
      globalPath,
      projectPath,
      beforeRename: async () => { throw new Error("injected rename failure"); },
    });
    await expect(failing.setRole("global", "general", { model: "provider/one" }, false)).rejects.toThrow(/injected rename failure/);
    expect(await readFile(globalPath, "utf8")).toBe(original);
    await writeFile(globalPath, "{malformed");
    await expect(store.setRole("global", "general", { model: "provider/one" }, false)).rejects.toThrow(/malformed JSON/);
    expect(await readFile(globalPath, "utf8")).toBe("{malformed");
  });

  it("persists exact instance overrides across replay and never leaks to another same-role Agent", async () => {
    await createAgent("Scout");
    await createAgent("Scout-2");
    const store = new ModelConfigStore({ globalPath, projectPath });
    const service = new ModelConfigurationService(store, journal);
    await service.userSetInstance("Scout", { model: "provider/instance", thinking: "high" });
    expect(journal.getState().models.Scout).toMatchObject({ model: "provider/instance", thinking: "high" });
    expect(journal.getState().models["Scout-2"]).toBeUndefined();
    await journal.flush();
    const reopened = (await CoordinatorJournal.open(journal.layout, "parent-1", {
      eventId: () => `event-${++event}`,
      clock: () => new Date(Date.UTC(2026, 6, 25, 5, 0, event)),
    })).journal;
    expect(reopened.getState().models.Scout).toMatchObject({ model: "provider/instance", thinking: "high" });
    const replayedService = new ModelConfigurationService(store, reopened);
    await replayedService.userSetInstance("Scout", undefined);
    expect(reopened.getState().models.Scout).toBeUndefined();
  });
});

describe("persistent model change authority", () => {
  it("allows direct user operations but freshly confirms every model-facing request", async () => {
    await createAgent("Worker");
    const store = new ModelConfigStore({ globalPath, projectPath });
    const service = new ModelConfigurationService(store, journal, async (override) => {
      const candidate = await catalog().resolve(override.model);
      if (!candidate?.available || !candidate.authenticated) throw new Error("unusable model");
    });
    await service.userSetRole("global", "general", { model: "provider/user" }, false);
    const confirms = vi.fn(async (_packet: unknown) => "confirm" as const);
    const ui = { hasUI: true, confirm: confirms };
    expect(await service.requestRoleChange("global", "general", { model: "provider/one" }, false, ui)).toEqual({ status: "changed" });
    expect(await service.requestRoleChange("global", "general", { model: "provider/one" }, false, ui)).toEqual({ status: "changed" });
    expect(confirms).toHaveBeenCalledTimes(2);
    expect(confirms.mock.calls[0]?.[0]).toMatchObject({ scope: "global", target: "general", oldValue: { model: "provider/user" }, newValue: { model: "provider/one" } });
    await expect(service.requestRoleChange("global", "general", { model: "provider/token=secret" }, false, ui)).rejects.toThrow(/credential\/auth\/private-key/);
    expect(confirms).toHaveBeenCalledTimes(2);

    expect(await service.requestInstanceChange("Worker", { model: "provider/instance" }, ui)).toEqual({ status: "changed" });
    expect(journal.getState().models.Worker).toMatchObject({ model: "provider/instance" });
  });

  it("keeps bytes and registry state unchanged for no UI, denial, and write failure", async () => {
    await createAgent("Worker");
    const store = new ModelConfigStore({ globalPath, projectPath });
    await store.setRole("global", "general", { model: "provider/user" }, false);
    const original = await readFile(globalPath, "utf8");
    const service = new ModelConfigurationService(store, journal);
    expect(await service.requestRoleChange("global", "general", { model: "provider/one" }, false, { hasUI: false, confirm: async () => "confirm" })).toEqual({ status: "denied" });
    expect(await service.requestRoleChange("global", "general", { model: "provider/one" }, false, { hasUI: true, confirm: async () => "deny" })).toEqual({ status: "denied" });
    expect(await readFile(globalPath, "utf8")).toBe(original);
    expect(await service.requestInstanceChange("Worker", { model: "provider/instance" }, { hasUI: false, confirm: async () => "confirm" })).toEqual({ status: "denied" });
    expect(journal.getState().models.Worker).toBeUndefined();

    const failingStore = new ModelConfigStore({ globalPath, projectPath, beforeRename: async () => { throw new Error("write failed"); } });
    const failing = new ModelConfigurationService(failingStore, journal);
    await expect(failing.requestRoleChange("global", "general", { model: "provider/one" }, false, { hasUI: true, confirm: async () => "confirm" })).rejects.toThrow(/write failed/);
    expect(await readFile(globalPath, "utf8")).toBe(original);
    await expect(service.requestRoleChange("project", "general", { model: "provider/project" }, false, { hasUI: true, confirm: async () => "confirm" })).rejects.toThrow(/requires active project trust/);
  });
});
