import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  AILI_COMPACT_LIVE_HARNESS,
  AILI_COMPACT_LIVE_CAPTURE_PATH,
  readAiliCompactCandidateBinding,
} from "../../scripts/aili-compact-release-evidence.js";
import {
  assertLiveCaptureClaims,
  atomicPublishLiveEvidence,
  executeLiveCaptureLifecycle,
  observePersistentBoundaryTask,
  PERSISTENT_BOUNDARY_TASK_TEXT,
  type LiveCaptureBundle,
} from "../../scripts/live-release-support.js";
import {
  type CompactLiveProviderFamily,
} from "../../scripts/aili-compact-live-observations.js";
import { PERSISTENT_LIVE_IMPLEMENTATION_PATHS } from "../../src/runtime/persistent-agents/live-evidence-contract.js";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import type { AgentRecord } from "../../src/runtime/persistent-agents/types.js";
import { GitIsolationAdapter } from "../../src/runtime/persistent-agents/workspace.js";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const liveRoot = "/tmp/aili-pi-live-verification";
const configuredAgentDir = getAgentDir();
const productionEntry = resolve(root, "extensions/index.ts");
const officialPiExecutable = resolve(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
const liveIt = process.env.AILI_RUN_RELEASE_LIVE === "1" ? it : it.skip;

type Status = "PASS" | "NON_PASS";
type JsonRecord = Record<string, unknown>;

interface SelectedModel {
  provider: string;
  id: string;
  api: string;
  contextWindow: number;
  model: Awaited<ReturnType<ModelRuntime["getAvailable"]>>[number];
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedFailure(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/auth|credential|login|unauthoriz/i.test(text)) return "authentication-unavailable";
  if (/context|token|too long|length/i.test(text)) return "context-path-failure";
  if (/sandbox|bubblewrap|bwrap/i.test(text)) return "sandbox-unavailable";
  if (/rate|quota|limit|429/i.test(text)) return "provider-quota-or-rate-limit";
  if (/timeout|timed out|abort/i.test(text)) return "provider-timeout";
  if (/network|fetch|connect|socket|dns/i.test(text)) return "provider-network-failure";
  return "live-probe-failed";
}

function assistantOutcome(messages: readonly any[]): { ok: boolean; digest?: string; usage?: JsonRecord } {
  const assistant = [...messages].reverse().find((message) => message?.role === "assistant");
  if (!assistant || assistant.stopReason === "error" || assistant.stopReason === "aborted") return { ok: false };
  const text = typeof assistant.content === "string"
    ? assistant.content
    : Array.isArray(assistant.content)
      ? assistant.content.filter((part: any) => part?.type === "text").map((part: any) => String(part.text ?? "")).join("\n")
      : "";
  const usage = assistant.usage && typeof assistant.usage === "object" ? {
    input: Number(assistant.usage.input ?? 0),
    output: Number(assistant.usage.output ?? 0),
    cacheRead: Number(assistant.usage.cacheRead ?? 0),
    cacheWrite: Number(assistant.usage.cacheWrite ?? 0),
    totalTokens: Number(assistant.usage.totalTokens ?? 0),
  } : undefined;
  return text.length > 0 ? { ok: true, digest: sha256(text), ...(usage ? { usage } : {}) } : { ok: false };
}

function providerFamilies(models: Awaited<ReturnType<ModelRuntime["getAvailable"]>>): Record<string, SelectedModel | undefined> {
  const choose = (providers: readonly string[], preference: RegExp): SelectedModel | undefined => {
    const candidates = models.filter((model) => providers.includes(model.provider));
    candidates.sort((left, right) => {
      const leftPreferred = preference.test(left.id) ? 0 : 1;
      const rightPreferred = preference.test(right.id) ? 0 : 1;
      return leftPreferred - rightPreferred || left.contextWindow - right.contextWindow || left.id.localeCompare(right.id);
    });
    const selected = candidates[0];
    return selected ? {
      provider: selected.provider,
      id: selected.id,
      api: selected.api,
      contextWindow: selected.contextWindow,
      model: selected,
    } : undefined;
  };
  return {
    openai: choose(["openai-codex", "openai"], /(?:mini|nano|luna|codex-mini|gpt-5\.6-sol)/i),
    anthropic: choose(["anthropic"], /(?:haiku|sonnet)/i),
    "google-gemini": choose(["google", "google-generative-ai", "google-gemini-cli"], /(?:flash-lite|flash)/i),
  };
}

function orderedObserver(name: string, observations: string[]): ExtensionFactory {
  return (pi) => {
    pi.on("context", () => {
      observations.push(name);
      return undefined;
    });
  };
}

async function providerTransportProbe(
  runtime: ModelRuntime,
  family: string,
  selected: SelectedModel,
): Promise<JsonRecord> {
  const cwd = join(liveRoot, `compact-${family}`);
  const sessionDir = join(cwd, "sessions");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(cwd, ".pi", "aili-compact.jsonc"), JSON.stringify({ enabled: true, autoCooling: false }));
  const observations: string[] = [];
  const settings = SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 },
    retry: { enabled: true, maxRetries: 2 },
  }, { projectTrusted: true });
  const beforeName = `third-party-before-${family}`;
  const afterName = `third-party-after-${family}`;
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: configuredAgentDir,
    settingsManager: settings,
    additionalExtensionPaths: [productionEntry],
    extensionFactories: [
      { name: beforeName, factory: orderedObserver("before", observations), hidden: true },
      { name: afterName, factory: orderedObserver("after", observations), hidden: true },
    ],
    extensionsOverride: (base) => ({
      ...base,
      extensions: [...base.extensions].sort((left, right) => {
        const rank = (path: string) => path === `<inline:${beforeName}>` ? 0 : path === productionEntry ? 1 : path === `<inline:${afterName}>` ? 2 : 3;
        return rank(left.path) - rank(right.path);
      }),
    }),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "Return one short confirmation token and do not use tools.",
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  if (loaded.errors.length > 0) return { status: "NON_PASS", reason: "production-extension-load-failed" };
  const extensionOrder = loaded.extensions.map((extension) => extension.path === productionEntry
    ? "aili"
    : extension.path === `<inline:${beforeName}>`
      ? "before"
      : extension.path === `<inline:${afterName}>`
        ? "after"
        : "other").filter((value) => value !== "other");
  const manager = SessionManager.create(cwd, sessionDir, { id: `compact-${family}` });
  const created = await createAgentSession({
    cwd,
    agentDir: configuredAgentDir,
    model: selected.model,
    modelRuntime: runtime,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: manager,
    noTools: "all",
    thinkingLevel: "off",
  });
  try {
    await created.session.prompt("Return LIVE_OK only.", { expandPromptTemplates: false, source: "extension" });
    const outcome = assistantOutcome(created.session.state.messages);
    const contextOrder = observations.slice(-2);
    const orderingPass = JSON.stringify(extensionOrder) === JSON.stringify(["before", "aili", "after"])
      && JSON.stringify(contextOrder) === JSON.stringify(["before", "after"]);
    return {
      status: outcome.ok ? "PASS" : "NON_PASS",
      provider: selected.provider,
      model: selected.id,
      api: selected.api,
      contextWindow: selected.contextWindow,
      responseDigest: outcome.digest,
      usage: outcome.usage,
      extensionOrdering: {
        before: { status: orderingPass ? "PASS" : "NON_PASS", order: extensionOrder },
        after: { status: orderingPass ? "PASS" : "NON_PASS", observations: contextOrder },
      },
    };
  } catch (error) {
    return {
      status: "NON_PASS",
      provider: selected.provider,
      model: selected.id,
      api: selected.api,
      contextWindow: selected.contextWindow,
      reason: boundedFailure(error),
      extensionOrdering: {
        before: { status: "NON_PASS" },
        after: { status: "NON_PASS" },
      },
    };
  } finally {
    created.session.dispose();
  }
}

async function persistentProviderBoundaryProbe(runtime: ModelRuntime, selected: SelectedModel | undefined): Promise<JsonRecord[]> {
  if (!selected) {
    return [
      { id: "provider-turn", status: "NON_PASS", changedFiles: 0, reason: "openai-model-unavailable" },
    ];
  }
  const cwd = join(liveRoot, "persistent-provider");
  const sessionDir = join(cwd, "sessions");
  await mkdir(cwd, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  const settings = SettingsManager.inMemory({}, { projectTrusted: true });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: configuredAgentDir,
    settingsManager: settings,
    additionalExtensionPaths: [productionEntry],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "Use the task tool exactly once with the exact requested fields, then report its status briefly.",
  });
  await loader.reload();
  if (loader.getExtensions().errors.length > 0) {
    return [
      { id: "provider-turn", status: "NON_PASS", changedFiles: 0, reason: "production-extension-load-failed" },
      { id: "child-sandbox", status: "NON_PASS", changedFiles: 0, reason: "production-extension-load-failed" },
    ];
  }
  const manager = SessionManager.create(cwd, sessionDir, { id: "persistent-live-parent" });
  const created = await createAgentSession({
    cwd,
    agentDir: configuredAgentDir,
    model: selected.model,
    modelRuntime: runtime,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: manager,
    tools: ["task"],
    thinkingLevel: "off",
  });
  try {
    await created.session.prompt([
      "Call task exactly once.",
      `Set task=${JSON.stringify(PERSISTENT_BOUNDARY_TASK_TEXT)}, agent=general, async=false, tools=[], workspace=shared,`,
      "writeScope.paths=[], writeScope.resources=[].",
    ].join(" "), { expandPromptTemplates: false, source: "extension" });
    const parent = assistantOutcome(created.session.state.messages);
    const taskObservation = observePersistentBoundaryTask(created.session.state.messages);
    const providerPass = parent.ok && taskObservation.taskArgumentsExact
      && taskObservation.zeroParentBashCalls && taskObservation.childLifecycleCompleted;
    return [
      {
        id: "provider-turn",
        status: providerPass ? "PASS" : "NON_PASS",
        changedFiles: 0,
        provider: selected.provider,
        model: selected.id,
        api: selected.api,
        parentResponseDigest: parent.digest,
        synchronousTaskCallObserved: taskObservation.callId !== undefined,
        synchronousTaskCallId: taskObservation.callId,
        taskArgumentsExact: taskObservation.taskArgumentsExact,
        zeroParentBashCalls: taskObservation.zeroParentBashCalls,
        persistentChildSessionObserved: taskObservation.childLifecycleCompleted,
        childTurnStatus: taskObservation.childStatus ?? "unavailable",
        ...(taskObservation.reason ? { reason: taskObservation.reason } : {}),
      },
    ];
  } catch (error) {
    const reason = boundedFailure(error);
    return [
      { id: "provider-turn", status: "NON_PASS", changedFiles: 0, provider: selected.provider, model: selected.id, api: selected.api, reason },
    ];
  } finally {
    created.session.dispose();
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  return (await exec("git", args, { cwd, encoding: "utf8" })).stdout;
}

async function externalWorkspaceProbe(): Promise<JsonRecord> {
  const scratch = join(liveRoot, "external-workspace");
  const repo = join(scratch, "repo");
  await mkdir(repo, { recursive: true });
  await git(repo, ["init", "-q"]);
  await git(repo, ["config", "user.name", "AILI Live Fixture"]);
  await git(repo, ["config", "user.email", "live-fixture@example.invalid"]);
  await writeFile(join(repo, "tracked.txt"), "base\n");
  await git(repo, ["add", "tracked.txt"]);
  await git(repo, ["commit", "-qm", "base"]);
  await writeFile(join(repo, "tracked.txt"), "dirty baseline\n");
  await writeFile(join(repo, "untracked.txt"), "untracked baseline\n");
  const headBefore = (await git(repo, ["rev-parse", "HEAD"])).trim();
  const statusBefore = await git(repo, ["status", "--porcelain=v1", "-z"]);
  const parent = join(scratch, "parent.jsonl");
  await writeFile(parent, "bounded fixture parent\n");
  const layout = await ensureSidecarLayout(parent);
  let sequence = 0;
  const journal = (await CoordinatorJournal.open(layout, "external-live-parent", {
    eventId: () => `external-live-${++sequence}`,
    clock: () => new Date(Date.UTC(2026, 7, 2, 12, 0, sequence)),
  })).journal;
  const now = "2026-08-02T12:00:00.000Z";
  const agent: AgentRecord = { id: "External-Live", name: "External-Live", selector: "general", state: "queued", createdAt: now, updatedAt: now };
  await journal.append({ kind: "agent.created", agentId: agent.id, payload: { record: agent } });
  const adapter = new GitIsolationAdapter(layout, journal, () => new Date(1_750_000_000_000));
  const isolated = await adapter.create(agent.id, repo);
  await writeFile(join(isolated.root, "tracked.txt"), "child result\n");
  await writeFile(join(isolated.root, "child-only.txt"), "child only\n");
  const finalized = await adapter.finalize(isolated);
  const patch = await readFile(finalized.patchPath!, "utf8");
  const parentPreserved = (await git(repo, ["rev-parse", "HEAD"])).trim() === headBefore
    && await git(repo, ["status", "--porcelain=v1", "-z"]) === statusBefore
    && await readFile(join(repo, "tracked.txt"), "utf8") === "dirty baseline\n";
  const patchCorrect = patch.includes("+child result") && patch.includes("+child only") && !patch.includes("+dirty baseline");
  const cleaned = await adapter.cleanup(finalized);
  const cleanupObserved = await access(cleaned.root).then(() => false, () => true);
  let noRevive = false;
  try { adapter.assertResumable(agent.id); } catch { noRevive = true; }
  const pass = parentPreserved && patchCorrect && cleanupObserved && noRevive && journal.getState().workspaces[agent.id]?.status === "cleaned";
  return {
    id: "external-workspace-lifecycle",
    status: pass ? "PASS" : "NON_PASS",
    changedFiles: 0,
    parentHeadDigest: sha256(headBefore),
    parentStatusDigest: sha256(statusBefore),
    patchDigest: sha256(patch),
    parentPreserved,
    cleanupObserved,
    noRevive,
  };
}

async function implementationBindings(): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(PERSISTENT_LIVE_IMPLEMENTATION_PATHS.map(
    async (path) => [path, sha256(await readFile(join(root, path)))],
  )));
}

liveIt("runs one authorized representative provider path and fails closed for every unobserved required claim", async () => {
  const disposableHome = join(liveRoot, "home");
  await rm(liveRoot, { recursive: true, force: true });
  await mkdir(disposableHome, { recursive: true });
  await Promise.all([".ssh", ".aws", ".gnupg"].map((name) => mkdir(join(disposableHome, name), { recursive: true })));
  const persistentArtifactPath = "artifacts/test-results/persistent-agent-framework/live-smoke-2026-08-02-pi-0.82.1.json";
  const result = await executeLiveCaptureLifecycle({
    environment: {
      HOME: disposableHome,
      USERPROFILE: disposableHome,
      PI_CODING_AGENT_DIR: configuredAgentDir,
      PI_PERMISSION_MODE: "build",
    },
    capture: async (): Promise<LiveCaptureBundle> => {
    const runtime = await ModelRuntime.create({
      authPath: join(configuredAgentDir, "auth.json"),
      modelsPath: join(configuredAgentDir, "models.json"),
    });
    const selected = providerFamilies(await runtime.getAvailable());
    const requestedFamily = process.env.AILI_COMPACT_LIVE_PROVIDER_FAMILY;
    if (requestedFamily !== undefined && !["openai", "anthropic", "google-gemini"].includes(requestedFamily)) {
      throw new Error("AILI_COMPACT_LIVE_PROVIDER_FAMILY must name one supported provider family");
    }
    const providerOrder = requestedFamily
      ? [requestedFamily as CompactLiveProviderFamily]
      : (["openai", "anthropic", "google-gemini"] as const);
    const representativeSelection = providerOrder
      .map((family) => ({ family, model: selected[family] }))
      .find((item): item is { family: CompactLiveProviderFamily; model: SelectedModel } => item.model !== undefined);
    const binding = await readAiliCompactCandidateBinding(root);
    const liveHarnessSha256 = sha256(await readFile(join(root, AILI_COMPACT_LIVE_HARNESS)));
    const piExecutableSha256 = sha256(await readFile(officialPiExecutable));
    const productionEntrySha256 = sha256(await readFile(productionEntry));
    const representativeFamily = representativeSelection?.family;
    const representativeModel = representativeSelection?.model;
    let transport: JsonRecord = { status: "NON_PASS", reason: "supported-model-unavailable" };
    if (representativeFamily && representativeModel) {
      try {
        transport = await providerTransportProbe(runtime, representativeFamily, representativeModel);
      } catch (error) {
        transport = { status: "NON_PASS", provider: representativeModel.provider, model: representativeModel.id, api: representativeModel.api, contextWindow: representativeModel.contextWindow, reason: boundedFailure(error) };
      }
    }

    const persistentProbes = await persistentProviderBoundaryProbe(runtime, representativeModel).catch(() => [
      { id: "provider-turn", status: "NON_PASS", changedFiles: 0, reason: "persistent-provider-probe-failed" },
    ]);
    const persistentPass = persistentProbes.every((probe) => probe.status === "PASS");
    const persistentArtifact = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      platform: process.platform,
      piVersion: "0.82.1",
      package: { name: "@rosetears/aili-pi", version: "0.2.0", source: "current workspace package" },
      status: persistentPass ? "PASS" : "NON_PASS",
      probes: persistentProbes,
      sanitization: {
        rawProviderTranscriptIncluded: false,
        rawCredentialMaterialIncluded: false,
        credentialMarkerFindings: 0,
        localAbsolutePathsIncluded: false,
      },
    };
    const ordering = transport.extensionOrdering && typeof transport.extensionOrdering === "object"
        ? transport.extensionOrdering as JsonRecord
        : { before: { status: "NON_PASS" }, after: { status: "NON_PASS" } };
    const before = ordering.before as JsonRecord | undefined;
    const after = ordering.after as JsonRecord | undefined;
    const providerTurn = persistentProbes.find((probe) => probe.id === "provider-turn") as JsonRecord | undefined;
    const parentPersistentChild = {
      status: providerTurn?.status === "PASS" ? "PASS" : "NON_PASS",
      synchronousTaskCallObserved: providerTurn?.synchronousTaskCallObserved === true,
      taskArgumentsExact: providerTurn?.taskArgumentsExact === true,
      zeroParentBashCalls: providerTurn?.zeroParentBashCalls === true,
      persistentChildSessionObserved: providerTurn?.persistentChildSessionObserved === true,
      childTurnStatus: providerTurn?.childTurnStatus ?? "unavailable",
    };
    const representativePass = transport.status === "PASS"
        && before?.status === "PASS" && after?.status === "PASS"
        && parentPersistentChild.status === "PASS";
    const transportEvidence = {
      status: transport.status,
      provider: transport.provider ?? representativeModel?.provider ?? "unavailable",
      model: transport.model ?? representativeModel?.id ?? "unavailable",
      api: transport.api ?? representativeModel?.api ?? "unavailable",
      contextWindow: transport.contextWindow ?? representativeModel?.contextWindow ?? 0,
      responseDigest: transport.responseDigest,
      usage: transport.usage,
    };
    const representative = {
        status: representativePass ? "PASS" : "NON_PASS",
        providerFamily: representativeFamily ?? "unavailable",
        provider: transportEvidence.provider,
        model: transportEvidence.model,
        api: transportEvidence.api,
        contextWindow: transportEvidence.contextWindow,
        transport: transportEvidence,
        extensionOrdering: ordering,
        parentPersistentChild,
      };
    const compactArtifact = {
      schema: "aili.compact.live-evidence.v3",
      status: representativePass ? "PASS" : "NON_PASS",
      ...binding,
      capturedAt: new Date().toISOString(),
      sanitized: true,
      liveHarness: {
        path: AILI_COMPACT_LIVE_HARNESS,
        sha256: liveHarnessSha256,
      },
      runtimeBinding: {
        piExecutable: { path: "node_modules/@earendil-works/pi-coding-agent/dist/cli.js", sha256: piExecutableSha256 },
        productionEntry: { path: "extensions/index.ts", sha256: productionEntrySha256 },
      },
      representative,
    };
      return { persistentArtifact, compactArtifact };
    },
    failure: (reason) => ({
      persistentArtifact: {
        schemaVersion: 1, capturedAt: new Date().toISOString(), platform: "linux", piVersion: "0.82.1",
        package: { name: "@rosetears/aili-pi", version: "0.2.0", source: "current workspace package" },
        status: "NON_PASS", probes: ["provider-turn"].map((id) => ({ id, status: "NON_PASS", changedFiles: 0, reason })),
        sanitization: { rawProviderTranscriptIncluded: false, rawCredentialMaterialIncluded: false, credentialMarkerFindings: 0, localAbsolutePathsIncluded: false },
      },
      compactArtifact: { schema: "aili.compact.live-evidence.v3", status: "NON_PASS", reason, sanitized: true },
    }),
    cleanup: async () => await rm(liveRoot, { recursive: true, force: true }),
    verifyCleanup: async () => await access(liveRoot).then(() => false, () => true),
    downgradeForCleanupFailure: (bundle) => ({
      persistentArtifact: { ...bundle.persistentArtifact, status: "NON_PASS", captureCleanup: { status: "NON_PASS", reason: "cleanup-failed" } },
      compactArtifact: { ...bundle.compactArtifact, status: "NON_PASS", captureCleanup: { status: "NON_PASS", reason: "cleanup-failed" } },
    }),
    publish: async (bundle) => {
      const persistentBody = `${JSON.stringify(bundle.persistentArtifact, null, 2)}\n`;
      const persistentProbes = Array.isArray(bundle.persistentArtifact.probes) ? bundle.persistentArtifact.probes as JsonRecord[] : [];
      const capturedAt = String(bundle.persistentArtifact.capturedAt ?? new Date().toISOString());
      const captureCleanup = bundle.persistentArtifact.captureCleanup && typeof bundle.persistentArtifact.captureCleanup === "object"
        ? bundle.persistentArtifact.captureCleanup as JsonRecord
        : { status: "PASS" };
      const manifest = {
        schemaVersion: 4,
        capturedAt,
        platform: "linux",
        piVersion: "0.82.1",
        runtime: "aili-persistent-agents-v1",
        package: { name: "@rosetears/aili-pi", version: "0.2.0", source: "current workspace package" },
        status: bundle.persistentArtifact.status,
        artifact: { path: persistentArtifactPath, sha256: sha256(persistentBody) },
        harness: { path: AILI_COMPACT_LIVE_HARNESS, sha256: sha256(await readFile(join(root, AILI_COMPACT_LIVE_HARNESS))) },
        cleanup: captureCleanup,
        probes: persistentProbes.map((probe) => ({ id: probe.id, status: probe.status, changedFiles: probe.changedFiles, evidence: persistentArtifactPath })),
        implementation: await implementationBindings(),
        credentialHandling: "Existing Pi authentication was referenced through the configured agent directory; no credential value, raw provider transcript, raw prompt, or provider payload is durable evidence.",
      };
      await atomicPublishLiveEvidence(root, [
        { path: persistentArtifactPath, body: persistentBody },
        { path: AILI_COMPACT_LIVE_CAPTURE_PATH, body: `${JSON.stringify(bundle.compactArtifact, null, 2)}\n` },
        { path: "manifests/live-verification.json", body: `${JSON.stringify(manifest, null, 2)}\n`, manifest: true },
      ]);
    },
    assertPublished: assertLiveCaptureClaims,
  });
  await expect(access(liveRoot)).rejects.toThrow();
  expect(result.compactArtifact.representative).toBeTruthy();
}, 900_000);
