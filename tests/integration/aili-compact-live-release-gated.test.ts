import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  classifyRealOverflowAttempt,
  compactLiveCaptureBudget,
  COMPACT_HUMAN_REVIEW_CANDIDATE_PATH,
  createProductionCompactScenario,
  createCompactHumanReviewCandidate,
  createPendingRepresentativeSemanticReview,
  executeLiveCaptureLifecycle,
  observePersistentSandboxTask,
  PERSISTENT_SANDBOX_MARKER_BYTES,
  PERSISTENT_SANDBOX_MARKER_PATH,
  PERSISTENT_SANDBOX_TASK_TEXT,
  selectCompactLiveInput,
  type CompactLiveCaptureBudget,
  type CompactHumanReviewCandidateInput,
  type LiveCaptureBundle,
} from "../../scripts/live-release-support.js";
import {
  COMPACT_LIVE_ROW_IDS,
  nonPassCompactLiveRow,
  reduceCompactLiveRow,
  reduceInheritedCompactObservations,
  type CompactLiveExpectedBinding,
  type CompactLiveProviderFamily,
  type CompactLiveRowObservation,
  type CompactScenarioEvent,
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
  await writeFile(join(cwd, ".pi", "aili-compact.jsonc"), JSON.stringify({ autoCooling: false }));
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

async function persistentProviderAndSandboxProbe(runtime: ModelRuntime, selected: SelectedModel | undefined): Promise<JsonRecord[]> {
  if (!selected) {
    return [
      { id: "provider-turn", status: "NON_PASS", changedFiles: 0, reason: "openai-model-unavailable" },
      { id: "child-sandbox", status: "NON_PASS", changedFiles: 0, reason: "openai-model-unavailable" },
    ];
  }
  const cwd = join(liveRoot, "persistent-provider");
  const sessionDir = join(cwd, "sessions");
  const marker = join(cwd, PERSISTENT_SANDBOX_MARKER_PATH);
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
    // Bash must be active in the parent tool snapshot so the persistent child
    // can receive the process-owned sandboxed Bash definition requested by the
    // task call. The parent prompt still directs the model to invoke task only.
    tools: ["task", "bash"],
    thinkingLevel: "off",
  });
  try {
    await created.session.prompt([
      "Call task exactly once.",
      `Set task=${JSON.stringify(PERSISTENT_SANDBOX_TASK_TEXT)}, agent=general, async=false, tools=[bash], workspace=shared,`,
      `writeScope.paths=[${PERSISTENT_SANDBOX_MARKER_PATH}], writeScope.resources=[].`,
    ].join(" "), { expandPromptTemplates: false, source: "extension" });
    const parent = assistantOutcome(created.session.state.messages);
    const markerBody = await readFile(marker, "utf8").catch(() => "");
    const taskObservation = observePersistentSandboxTask(created.session.state.messages, markerBody);
    const providerPass = parent.ok && taskObservation.taskArgumentsExact
      && taskObservation.zeroParentBashCalls && taskObservation.childLifecycleCompleted;
    const sandboxPass = providerPass && taskObservation.markerExact;
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
      {
        id: "child-sandbox",
        status: sandboxPass ? "PASS" : "NON_PASS",
        changedFiles: 0,
        mode: "build",
        workspace: "shared",
        processOwnedSandbox: true,
        taskArgumentsExact: taskObservation.taskArgumentsExact,
        zeroParentBashCalls: taskObservation.zeroParentBashCalls,
        childLifecycleCompleted: taskObservation.childLifecycleCompleted,
        markerExact: taskObservation.markerExact,
        childBashInspection: taskObservation.childBashInspection,
        childBashInspectionReason: taskObservation.childBashInspectionReason,
        markerDigest: markerBody ? sha256(markerBody) : undefined,
        ...(taskObservation.reason ? { reason: taskObservation.reason } : {}),
      },
    ];
  } catch (error) {
    const reason = boundedFailure(error);
    return [
      { id: "provider-turn", status: "NON_PASS", changedFiles: 0, provider: selected.provider, model: selected.id, api: selected.api, reason },
      { id: "child-sandbox", status: "NON_PASS", changedFiles: 0, mode: "build", workspace: "shared", processOwnedSandbox: true, reason },
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

function compactRows(reason: Parameters<typeof nonPassCompactLiveRow>[1] = "required-production-events-missing"): Record<string, CompactLiveRowObservation> {
  return Object.fromEntries(COMPACT_LIVE_ROW_IDS.map((id) => [id, nonPassCompactLiveRow(id, reason)]));
}

async function runCompactProviderScenarios(
  runtime: ModelRuntime,
  family: CompactLiveProviderFamily,
  selected: SelectedModel,
  binding: CompactLiveExpectedBinding,
  captureBudget: CompactLiveCaptureBudget,
): Promise<{
  rows: Record<string, CompactLiveRowObservation>;
  p0: JsonRecord;
  longLifecycle: JsonRecord;
  continuedWork: JsonRecord;
  humanReviewCandidate?: JsonRecord;
}> {
  const events: CompactScenarioEvent[] = [];
  const scenarioRoot = join(liveRoot, `compact-scenarios-${family}`);
  const fixtureName = "bounded-tool-result.txt";
  await mkdir(scenarioRoot, { recursive: true });
  await writeFile(join(scenarioRoot, fixtureName), "BOUNDED_REAL_TOOL_RESULT\n", "utf8");
  const scenario = await createProductionCompactScenario({
    cwd: scenarioRoot,
    sessionDir: join(scenarioRoot, "sessions"),
    agentDir: configuredAgentDir,
    productionEntry,
    modelRuntime: runtime,
    model: selected.model,
    sessionId: `compact-scenarios-${family}`,
    tools: ["read", "aili_search_context", "aili_compact_status", "aili_compact"],
    config: { autoCooling: false, providerSuffix: { enabled: true } },
    systemPrompt: [
      "Follow each live verification instruction exactly and use only the named tool.",
      `When asked for a real tool result, call read exactly once for ${fixtureName}.`,
      "When asked for suffix search, call aili_search_context exactly once with query provider-only guidance.",
      "When asked for archived lifecycle search, call aili_search_context exactly once with query RELEASE-CANDIDATE-42.",
      "Never repeat source bodies in prose.",
    ].join(" "),
  });
  let humanReviewCandidate: JsonRecord | undefined;
  const stageFailures = new Set<"pressure-stage-failed" | "tool-stage-failed" | "suffix-stage-failed" | "lifecycle-stage-failed">();
  let scenarioEventCursor = 0;
  const drainScenarioEvents = () => {
    events.push(...scenario.events.slice(scenarioEventCursor));
    scenarioEventCursor = scenario.events.length;
  };
  const attempt = async (failure: "pressure-stage-failed" | "tool-stage-failed" | "suffix-stage-failed" | "lifecycle-stage-failed", action: () => Promise<void>) => {
    try {
      await action();
    } catch {
      stageFailures.add(failure);
    } finally {
      drainScenarioEvents();
    }
  };
  try {
    for (let index = 0; index < 5; index += 1) {
      await attempt("lifecycle-stage-failed", async () => await scenario.prompt(`Calibration turn ${index + 1}: return CAL_${index + 1} only.`));
    }

    // Pressure is bounded and exists only to make the suffix claim eligible.
    // Failure does not suppress independent tool, suffix, or lifecycle attempts.
    const pressureChars = Math.ceil(selected.contextWindow * 3.6);
    if (selectCompactLiveInput(pressureChars, captureBudget).status === "WITHIN_BUDGET") {
      await attempt("pressure-stage-failed", async () => await scenario.prompt(`Retain this bounded pressure fixture and return PRESSURE_OK only. ${"p".repeat(pressureChars)}`));
    } else {
      stageFailures.add("pressure-stage-failed");
    }
    await attempt("pressure-stage-failed", async () => await scenario.prompt("Call aili_compact_status exactly once and report only its pressure stage."));
    const observedPressureStage = scenario.toolExecutions
      .filter((entry) => entry.toolName === "aili_compact_status" && !entry.isError)
      .map((entry) => nestedPressureStage(entry.result))
      .find((stage) => stage !== undefined);
    if (observedPressureStage) events.push({ code: "pressure-state", stage: observedPressureStage });
    else stageFailures.add("pressure-stage-failed");

    await attempt("tool-stage-failed", async () => await scenario.prompt("Obtain the real tool result now, then return TOOL_OK only."));
    if (!scenario.toolExecutions.some((entry) => entry.toolName === "read" && !entry.isError)) stageFailures.add("tool-stage-failed");
    await attempt("suffix-stage-failed", async () => await scenario.prompt("Perform suffix search now, then report only the match count."));
    const search = [...scenario.toolExecutions].reverse().find((entry) => entry.toolName === "aili_search_context" && !entry.isError);
    const searchObservation = search ? embeddedJsonRecords(search.result).find((record) => Array.isArray(record.matches)) : undefined;
    const providerAuthoredSearchMatches = Array.isArray(searchObservation?.matches) ? searchObservation.matches.length : -1;
    const sessionFile = scenario.manager.getSessionFile();
    const jsonl = sessionFile ? await readFile(sessionFile, "utf8").catch(() => "") : "";
    if (!search) stageFailures.add("suffix-stage-failed");
    events.push({
      code: "suffix-persistence",
      jsonlMatches: (jsonl.match(/aili-compact-provider-suffix/g) ?? []).length,
      providerAuthoredSearchMatches,
    });

    // Sanitized fact-bearing setup is input only. Every summary and transaction
    // must still be authored through real provider tool calls.
    await attempt("lifecycle-stage-failed", async () => await scenario.prompt("Fact-bearing lifecycle source: target code is RELEASE-CANDIDATE-42; unresolved limitation is interactive PTY resize; verification state is NON_PASS. Call aili_compact_status, select one exact safe range, then call aili_compact once with a summary retaining all three facts."));
    for (const tier of ["T2", "T3", "T3-restill"] as const) {
      await attempt("lifecycle-stage-failed", async () => await scenario.prompt(`Call aili_compact_status, select the exact eligible current blocks for ${tier}, then call aili_compact once with a structural summary retaining target RELEASE-CANDIDATE-42, the PTY limitation, and NON_PASS verification.`));
    }
    appendProviderAuthoredTierEvents(events, scenario.manager.getEntries(), scenario.toolExecutions);
    humanReviewCandidate = providerReviewCandidate(scenario.manager.getEntries(), scenario.toolExecutions, binding);
    await attempt("lifecycle-stage-failed", async () => await scenario.prompt("/aili-compact rescue"));
    await attempt("lifecycle-stage-failed", async () => await scenario.prompt("Perform archived lifecycle search after the checkpoint, then report only whether an archived match exists."));
    await attempt("lifecycle-stage-failed", async () => await scenario.prompt("Return CONTINUED_OK only after the checkpoint attempt.", "continued"));
    const oldSearchRecords = scenario.toolExecutions.filter((entry) => entry.toolName === "aili_search_context" && !entry.isError).flatMap((entry) => embeddedJsonRecords(entry.result)).filter((record) => Array.isArray(record.matches));
    const lifecyclePersisted = events.some((event) => event.code === "tier-transaction" && event.tier === "T1" && event.providerAuthored && event.persisted);
    const customCheckpoint = events.some((event) => event.code === "checkpoint" && event.origin === "custom" && event.persisted);
    const oldEpochSearchable = oldSearchRecords.some((record) => JSON.stringify(record.matches).includes("RELEASE-CANDIDATE-42"));
    const oldEpochQueryOnly = scenario.toolExecutions.filter((entry) => entry.toolName === "aili_compact_status" && !entry.isError).some((entry) => JSON.stringify(entry.result).includes('"queryOnly":true') || JSON.stringify(entry.result).includes('"queryOnly": true'));
    if (lifecyclePersisted && customCheckpoint) events.push({ code: "lifecycle-rescue", providerAuthoredEligibleLifecycle: true, invocation: "agent-session-command", oldEpochQueryOnly, oldEpochSearchable });

    const thresholdBefore = events.some((event) => event.code === "before-compact" && event.reason === "threshold");
    const nativeThreshold = events.some((event) => event.code === "checkpoint" && event.reason === "threshold" && event.origin === "native");
    if (thresholdBefore || nativeThreshold) events.push({ code: "native-threshold", actualHostThreshold: thresholdBefore, deterministicIneligible: nativeThreshold, cancelLoopCount: 0 });

    const cacheUsages = events.filter((event): event is Extract<CompactScenarioEvent, { code: "provider-call" }> => event.code === "provider-call" && event.usage !== undefined).map((event) => event.usage!);
    const cacheReadTokens = cacheUsages.reduce((sum, usage) => sum + usage.cacheRead, 0);
    const cacheWriteTokens = cacheUsages.reduce((sum, usage) => sum + usage.cacheWrite, 0);
    const productionStatusBodies = scenario.toolExecutions.filter((entry) => entry.toolName === "aili_compact_status" && !entry.isError).map((entry) => JSON.stringify(entry.result)).join("\n");
    const productionClassificationsObserved = productionStatusBodies.includes("warm-candidate")
      && productionStatusBodies.includes("suffix-changed") && productionStatusBodies.includes("projection-changed");
    if (cacheReadTokens > 0 && cacheWriteTokens > 0 && productionClassificationsObserved) {
      events.push({ code: "cache", providerReported: true, cacheReadTokens, cacheWriteTokens, stablePrefix: "warm-candidate", suffixChange: "suffix-changed", projectionChange: "projection-changed" });
    }
    const calibration = scenario.toolExecutions
      .filter((entry) => entry.toolName === "aili_compact_status" && !entry.isError)
      .flatMap((entry) => embeddedJsonRecords(entry.result))
      .map((record) => (record.tokenCalibration ?? record) as JsonRecord)
      .find((record) => Number.isSafeInteger(record.sampleCount) && record.exclusionCounts && typeof record.exclusionCounts === "object");
    const exclusionCounts = calibration?.exclusionCounts as JsonRecord | undefined;
    const exclusionCodes = Object.entries(exclusionCounts ?? {}).filter(([, count]) => Number(count) > 0).map(([code]) => code);
    if (calibration && Number(calibration.sampleCount) >= 5 && exclusionCodes.length > 0
      && Number(calibration.lowerMultiplier) <= 1 && Number(calibration.upperMultiplier) >= 1) {
      events.push({ code: "calibration", eligible: Number(calibration.sampleCount), excluded: exclusionCodes.reduce((sum, code) => sum + Number(exclusionCounts?.[code] ?? 0), 0), exclusionCodes, lowerBoundPreserved: true, upperBoundPreserved: true, invalidNarrowing: false });
    }
  } finally {
    drainScenarioEvents();
    scenario.dispose();
  }
  let overflowResult: Awaited<ReturnType<typeof runRealOverflowScenario>>;
  try {
    overflowResult = await runRealOverflowScenario(runtime, family, selected, captureBudget);
  } catch {
    const selection = selectCompactLiveInput(Math.ceil(selected.contextWindow * 4.5), captureBudget);
    overflowResult = selection.status === "NON_PASS"
      ? { events: [], selection, laterWorkFailed: false }
      : { events: [], selection, laterWorkFailed: false, classification: { status: "NON_PASS", reason: "overflow-preflight-or-stage-failed", source: "none" } };
  }
  events.push(...overflowResult.events);
  const rows = Object.fromEntries(COMPACT_LIVE_ROW_IDS.map((id) => [id, reduceCompactLiveRow(id, events, binding)]));
  if (overflowResult.selection.status === "NON_PASS") {
    rows["LIVE-V2-7"] = {
      ...nonPassCompactLiveRow("LIVE-V2-7", "capture-input-budget-exceeded"),
      requiredInputCharacters: overflowResult.selection.requiredInputCharacters,
      maxInputCharacters: overflowResult.selection.maxInputCharacters,
    };
  } else if (overflowResult.classification?.status === "NON_PASS") {
    rows["LIVE-V2-7"] = {
      ...nonPassCompactLiveRow("LIVE-V2-7", overflowResult.classification.reason),
      attempt: { stage: "overflow", status: overflowResult.classification.reason, source: overflowResult.classification.source },
    };
  } else if (overflowResult.laterWorkFailed) {
    rows["LIVE-V2-7"] = {
      ...nonPassCompactLiveRow("LIVE-V2-7", "overflow-later-work-failed"),
      attempt: { stage: "overflow", status: "overflow-later-work-failed", source: "message-end" },
    };
  }
  if (stageFailures.has("pressure-stage-failed")) rows["LIVE-V2-1"] = nonPassCompactLiveRow("LIVE-V2-1", "pressure-stage-failed");
  else if (stageFailures.has("tool-stage-failed")) rows["LIVE-V2-1"] = nonPassCompactLiveRow("LIVE-V2-1", "tool-stage-failed");
  else if (stageFailures.has("suffix-stage-failed")) rows["LIVE-V2-1"] = nonPassCompactLiveRow("LIVE-V2-1", "suffix-stage-failed");
  if (stageFailures.has("lifecycle-stage-failed")) {
    rows["LIVE-V2-3"] = nonPassCompactLiveRow("LIVE-V2-3", "lifecycle-stage-failed");
    rows["LIVE-V2-5"] = nonPassCompactLiveRow("LIVE-V2-5", "lifecycle-stage-failed");
  }
  const inherited = reduceInheritedCompactObservations(events, binding, rows["LIVE-V2-3"]!);
  return { rows, ...inherited, ...(humanReviewCandidate ? { humanReviewCandidate } : {}) };
}

async function runRealOverflowScenario(
  runtime: ModelRuntime,
  family: CompactLiveProviderFamily,
  selected: SelectedModel,
  captureBudget: CompactLiveCaptureBudget,
): Promise<{ events: CompactScenarioEvent[]; selection: ReturnType<typeof selectCompactLiveInput>; classification?: ReturnType<typeof classifyRealOverflowAttempt>; laterWorkFailed: boolean }> {
  const overflowChars = Math.ceil(selected.contextWindow * 4.5);
  const selection = selectCompactLiveInput(overflowChars, captureBudget);
  if (selection.status === "NON_PASS") return { events: [], selection, laterWorkFailed: false };
  const cwd = join(liveRoot, `compact-real-overflow-${family}`);
  const scenario = await createProductionCompactScenario({
    cwd,
    sessionDir: join(cwd, "sessions"),
    agentDir: configuredAgentDir,
    productionEntry,
    modelRuntime: runtime,
    model: selected.model,
    sessionId: `compact-real-overflow-${family}`,
    tools: [],
    config: { autoCooling: false },
    settings: { compaction: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 1 } },
    systemPrompt: "Return OVERFLOW_OR_RECOVERED only. Do not use tools.",
  });
  try {
    const eventStart = scenario.events.length;
    let promptFailed = false;
    try {
      await scenario.prompt(`Complete the original bounded overflow request. ${"o".repeat(overflowChars)}`);
    } catch {
      promptFailed = true;
      await scenario.session.waitForIdle().catch(() => undefined);
    }
    const classification = classifyRealOverflowAttempt(scenario.events, eventStart, scenario.session.state.messages, promptFailed);
    if (classification.status === "PROVIDER_CONTEXT_ERROR" && classification.fallbackEvent) scenario.events.push(classification.fallbackEvent);
    const recovered = scenario.events.some((event) => event.code === "provider-call" && event.turn === "retry" && event.succeeded);
    let laterWorkFailed = false;
    if (recovered) {
      try {
        await scenario.prompt("Return LATER_PROVIDER_WORK only.", "continued");
      } catch {
        laterWorkFailed = true;
      }
    }
    return { events: [...scenario.events], selection, classification, laterWorkFailed };
  } finally {
    scenario.dispose();
  }
}

async function runCopiedProductionSessionRehearsal(
  runtime: ModelRuntime,
  family: CompactLiveProviderFamily,
  selected: SelectedModel,
  sourceSession: string,
  candidate: JsonRecord,
): Promise<Extract<CompactScenarioEvent, { code: "migration" }>> {
  const cwd = join(liveRoot, `compact-copied-production-session-${family}`);
  const sessionDir = join(cwd, "sessions");
  const copied = join(sessionDir, "copied-provider-session.jsonl");
  await mkdir(sessionDir, { recursive: true });
  await copyFile(sourceSession, copied);
  const prefix = await readFile(copied);
  const manager = SessionManager.open(copied, sessionDir, cwd);
  const transactions = Array.isArray(candidate.transactions) ? candidate.transactions as JsonRecord[] : [];
  const transactionIds = transactions.map((item) => String(item.transactionId ?? ""));
  const transactionDigests = transactions.map((item) => String(item.transactionSha256 ?? ""));
  const scenario = await createProductionCompactScenario({
    cwd,
    sessionDir,
    agentDir: configuredAgentDir,
    productionEntry,
    modelRuntime: runtime,
    model: selected.model,
    sessionId: `compact-copied-production-session-${family}`,
    sessionManager: manager,
    tools: ["aili_compact_status", "aili_decompress"],
    config: { autoCooling: false },
    systemPrompt: "Use only the requested production AILI Compact command and return bounded confirmations.",
  });
  let reloaded = false; let branched = false; let decompressed = false;
  let checkpoint = false; let indexFallback = false; let continued = false;
  try {
    await scenario.session.reload();
    const reloadedBody = JSON.stringify(manager.getEntries());
    reloaded = transactionIds.length === 4 && transactionIds.every((id) => id.length > 0 && reloadedBody.includes(id));
    const branch = manager.getBranch();
    const target = branch.length >= 4 ? branch[branch.length - 3] : undefined;
    if (target) {
      const navigation = await scenario.session.navigateTree(target.id, { summarize: false });
      branched = navigation.cancelled === false;
      if (branched) await scenario.prompt("Return COPIED_BRANCH_CONTINUED only.");
    }
    await scenario.prompt("Call aili_compact_status, then call aili_decompress exactly once for one active block if available.");
    decompressed = scenario.toolExecutions.some((entry) => entry.toolName === "aili_decompress" && !entry.isError);
    try {
      await scenario.session.compact("Bounded copied production Session checkpoint; source hard facts remain in persisted AILI transactions.");
      checkpoint = manager.getEntries().some((entry) => entry.type === "compaction");
    } catch {
      checkpoint = false;
    }
    await scenario.prompt("Call aili_compact_status exactly once, then return INDEX_STATUS_OK only.");
    const statusRecords = scenario.toolExecutions.filter((entry) => entry.toolName === "aili_compact_status" && !entry.isError).flatMap((entry) => embeddedJsonRecords(entry.result));
    indexFallback = statusRecords.some((item) => nestedPositiveCounter(item, "fallbacks") || nestedPositiveCounter(item, "failOpenReturns"));
    await scenario.prompt("Return COPIED_PRODUCTION_SESSION_CONTINUED only.", "continued");
    continued = scenario.events.some((event) => event.code === "provider-call" && event.turn === "continued" && event.succeeded);
  } catch {
    // Each incomplete production operation is retained as a bounded false field.
  } finally {
    scenario.dispose();
  }
  const after = await readFile(copied).catch(() => Buffer.alloc(0));
  return {
    code: "migration",
    copiedSanitizedSession: true,
    syntheticSetup: false,
    v1v2v3Reload: reloaded,
    branchSwitch: branched,
    decompression: decompressed,
    checkpoint,
    indexFallback,
    bytePrefixPreserved: after.subarray(0, prefix.length).equals(prefix),
    continuedProviderWork: continued,
    source: {
      providerProduced: true,
      sameCapture: true,
      sessionIdDigest: sha256(manager.getSessionId()),
      copiedPrefixSha256: sha256(prefix),
      transactionIds,
      transactionDigests,
    },
    productionApis: {
      reload: "agent-session-reload",
      branchSwitch: "agent-session-navigate-tree",
      decompression: "production-aili-decompress",
      checkpoint: "agent-session-compact",
      indexFallback: "production-branch-index-fallback",
      continuedWork: "agent-session-provider-prompt",
    },
  };
}

function nestedPositiveCounter(value: unknown, key: string, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== "object") return false;
  if (!Array.isArray(value) && Number((value as JsonRecord)[key]) > 0) return true;
  return Object.values(value as JsonRecord).some((item) => nestedPositiveCounter(item, key, depth + 1));
}

function nestedPressureStage(value: unknown, depth = 0): "PRESSURE" | "FORCE_SEMANTIC" | "CHECKPOINT_REQUIRED" | "OVERFLOW_RECOVERY" | undefined {
  if (depth > 8) return undefined;
  if (typeof value === "string") {
    try {
      return nestedPressureStage(JSON.parse(value), depth + 1);
    } catch {
      return undefined;
    }
  }
  if (value === null || typeof value !== "object") return undefined;
  if (!Array.isArray(value)) {
    const stage = (value as JsonRecord).stage;
    if (stage === "PRESSURE" || stage === "FORCE_SEMANTIC" || stage === "CHECKPOINT_REQUIRED" || stage === "OVERFLOW_RECOVERY") return stage;
  }
  for (const item of Object.values(value as JsonRecord)) {
    if (typeof item === "string") {
      try {
        const nested = nestedPressureStage(JSON.parse(item), depth + 1);
        if (nested) return nested;
      } catch {
        continue;
      }
    } else {
      const nested = nestedPressureStage(item, depth + 1);
      if (nested) return nested;
    }
  }
  return undefined;
}

async function runCopiedLongSessionScaffold(
  runtime: ModelRuntime,
  family: CompactLiveProviderFamily,
  selected: SelectedModel,
): Promise<Extract<CompactScenarioEvent, { code: "migration" }>> {
  const cwd = join(liveRoot, `compact-copied-session-${family}`);
  const sessionDir = join(cwd, "sessions");
  const copied = join(sessionDir, "copied-long-session.jsonl");
  await mkdir(sessionDir, { recursive: true });
  await copyFile(join(root, "tests/fixtures/aili-compact/legacy-v1-session.jsonl"), copied);
  const prefix = await readFile(copied);
  const manager = SessionManager.open(copied, sessionDir, cwd);
  const scenario = await createProductionCompactScenario({
    cwd,
    sessionDir,
    agentDir: configuredAgentDir,
    productionEntry,
    modelRuntime: runtime,
    model: selected.model,
    sessionId: `compact-copied-session-${family}`,
    sessionManager: manager,
    tools: ["aili_compact_status", "aili_decompress"],
    config: { autoCooling: false },
    systemPrompt: "Use production AILI Compact status and decompression commands exactly as requested; return bounded confirmations only.",
  });
  let branched = false;
  let decompressed = false;
  let checkpoint = false;
  let continued = false;
  try {
    await scenario.session.reload();
    const branch = manager.getBranch();
    if (branch.length > 1) {
      const navigation = await scenario.session.navigateTree(branch[0]!.id, { summarize: false });
      branched = navigation.cancelled === false;
      await scenario.prompt("Return BRANCH_CONTINUED only.");
    }
    await scenario.prompt("Call aili_compact_status, then if an active block exists execute /aili-compact decompress one for its exact block reference; otherwise report no active block.");
    decompressed = scenario.toolExecutions.some((entry) => entry.toolName === "aili_decompress" && !entry.isError);
    try {
      await scenario.session.compact("Summarize this copied sanitized fixture without adding facts.");
      checkpoint = manager.getEntries().some((entry) => entry.type === "compaction");
    } catch {
      checkpoint = false;
    }
    await scenario.prompt("Return COPIED_SESSION_CONTINUED only.", "continued");
    continued = scenario.events.some((event) => event.code === "provider-call" && event.turn === "continued" && event.succeeded);
  } catch {
    // The synthetic fixture remains NON_PASS even when some production API
    // operations complete; retain only bounded booleans.
  } finally {
    scenario.dispose();
  }
  const after = await readFile(copied).catch(() => Buffer.alloc(0));
  return {
    code: "migration",
    copiedSanitizedSession: true,
    syntheticSetup: true,
    v1v2v3Reload: false,
    branchSwitch: branched,
    decompression: decompressed,
    checkpoint,
    indexFallback: false,
    bytePrefixPreserved: after.subarray(0, prefix.length).equals(prefix),
    continuedProviderWork: continued,
  };
}

function compactTransactionCount(entries: readonly unknown[]): number {
  return entries.filter((entry) => {
    const item = entry as JsonRecord;
    return item.type === "custom" && item.customType === "aili-compact";
  }).length;
}

function embeddedJsonRecords(value: unknown, depth = 0): JsonRecord[] {
  if (depth > 6) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? [parsed as JsonRecord, ...embeddedJsonRecords(parsed, depth + 1)] : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.flatMap((item) => embeddedJsonRecords(item, depth + 1));
  if (!value || typeof value !== "object") return [];
  return Object.values(value as JsonRecord).flatMap((item) => embeddedJsonRecords(item, depth + 1));
}

function appendProviderAuthoredTierEvents(
  events: CompactScenarioEvent[],
  entries: readonly unknown[],
  executions: readonly { toolCallId: string; toolName: string; isError: boolean }[],
): void {
  const successfulCalls = executions.filter((entry) => entry.toolName === "aili_compact" && !entry.isError).length;
  if (successfulCalls === 0) return;
  let t3Count = 0;
  for (const entry of entries) {
    const item = entry as JsonRecord;
    const data = item.data as JsonRecord | undefined;
    const payload = data?.payload as JsonRecord | undefined;
    const tier = payload?.tier;
    if (item.type === "custom" && data?.tag === "semantic-create" && (tier === "T1" || tier === "T2" || tier === "T3")) {
      if (tier === "T3") t3Count += 1;
      events.push({ code: "tier-transaction", tier: tier === "T3" && t3Count > 1 ? "T3-restill" : tier as "T1" | "T2" | "T3", providerAuthored: true, persisted: true });
    }
  }
}

function providerReviewCandidate(
  entries: readonly unknown[],
  executions: readonly { toolCallId: string; toolName: string; isError: boolean }[],
  binding: CompactLiveExpectedBinding,
): JsonRecord | undefined {
  const calls = executions.filter((entry) => entry.toolName === "aili_compact" && !entry.isError);
  const transactions: CompactHumanReviewCandidateInput["transactions"] = [];
  let t3Count = 0;
  for (const entry of entries) {
    const item = entry as JsonRecord;
    const transaction = item.data as JsonRecord | undefined;
    const header = transaction?.header as JsonRecord | undefined;
    const payload = transaction?.payload as JsonRecord | undefined;
    const tier = payload?.tier;
    if (item.type !== "custom" || transaction?.tag !== "semantic-create" || (tier !== "T1" && tier !== "T2" && tier !== "T3")) continue;
    if (tier === "T3") t3Count += 1;
    const summary = typeof payload?.summary === "string" ? payload.summary : "";
    const call = calls[transactions.length];
    const transactionId = typeof header?.txId === "string" ? header.txId : "";
    if (!call || !transactionId || !summary) return undefined;
    transactions.push({
      tier: tier === "T3" && t3Count > 1 ? "T3-restill" : tier,
      providerToolCallId: call.toolCallId,
      transactionId,
      transactionSha256: sha256(JSON.stringify(transaction)),
      summarySha256: sha256(summary),
      hardFacts: {
        releaseCandidate: summary.includes("RELEASE-CANDIDATE-42"),
        ptyLimitation: /interactive PTY resize/i.test(summary),
        verificationNonPass: summary.includes("NON_PASS"),
      },
    });
  }
  return createCompactHumanReviewCandidate({
    capturedAt: new Date().toISOString(),
    binding: {
      providerFamily: binding.providerFamily,
      provider: binding.provider,
      model: binding.model,
      api: binding.api,
      packageVersion: binding.packageVersion,
      piVersion: binding.piVersion,
      implementationSha256: binding.implementationSha256,
      liveHarnessSha256: binding.liveHarnessSha256,
    },
    transactions,
  });
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
    const captureBudget = compactLiveCaptureBudget(process.env.AILI_COMPACT_LIVE_MAX_INPUT_CHARS);
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
    let compactScenario: Awaited<ReturnType<typeof runCompactProviderScenarios>> | undefined;
    let compactScenarioFailure = false;
    if (representativeFamily && representativeModel) {
      try {
        transport = await providerTransportProbe(runtime, representativeFamily, representativeModel);
      } catch (error) {
        transport = { status: "NON_PASS", provider: representativeModel.provider, model: representativeModel.id, api: representativeModel.api, contextWindow: representativeModel.contextWindow, reason: boundedFailure(error) };
      }
      try {
          compactScenario = await runCompactProviderScenarios(runtime, representativeFamily, representativeModel, {
            providerFamily: representativeFamily,
            provider: representativeModel.provider,
            model: representativeModel.id,
            api: representativeModel.api,
            packageVersion: binding.packageVersion,
            piVersion: binding.piVersion,
            implementationSha256: binding.implementationSha256,
            liveHarnessSha256,
            piExecutableSha256,
            productionEntrySha256,
          }, captureBudget);
      } catch {
        compactScenario = undefined;
        compactScenarioFailure = true;
      }
    }

    const persistentProviderProbes = await persistentProviderAndSandboxProbe(runtime, representativeModel).catch(() => [
      { id: "provider-turn", status: "NON_PASS", changedFiles: 0, reason: "persistent-provider-probe-failed" },
      { id: "child-sandbox", status: "NON_PASS", changedFiles: 0, reason: "persistent-provider-probe-failed" },
    ]);
    const workspaceProbe = await externalWorkspaceProbe().catch(() => ({
      id: "external-workspace-lifecycle", status: "NON_PASS", changedFiles: 0, reason: "external-workspace-probe-failed",
    }));
    const persistentProbes = [...persistentProviderProbes, workspaceProbe];
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
    const rows = compactScenario?.rows ?? compactRows(compactScenarioFailure ? "scenario-stage-failed" : transport.status === "PASS" ? "required-production-events-missing" : "transport-unavailable");
    const longLifecycle = compactScenario?.longLifecycle ?? { status: "NON_PASS", observationClass: "unobserved", reason: "representative-human-review-not-observed" };
    const pendingSemanticReview = compactScenario?.humanReviewCandidate && representativeFamily && representativeModel
      ? createPendingRepresentativeSemanticReview(compactScenario.humanReviewCandidate, {
        providerFamily: representativeFamily,
        provider: representativeModel.provider,
        model: representativeModel.id,
        api: representativeModel.api,
        packageVersion: binding.packageVersion,
        piVersion: binding.piVersion,
        implementationSha256: binding.implementationSha256,
        liveHarnessSha256,
        piExecutableSha256,
        productionEntrySha256,
      })
      : undefined;
    const semanticReview = pendingSemanticReview ?? (longLifecycle.status === "PASS" ? {
      status: "PASS",
      observationClass: "representative-long-lifecycle-human-review",
      observedAt: longLifecycle.observedAt,
      source: longLifecycle.source,
      syntheticEvidenceAccepted: longLifecycle.syntheticEvidenceAccepted,
      binding: longLifecycle.binding,
      capture: longLifecycle.capture,
      eventDigest: longLifecycle.eventDigest,
      eventCount: longLifecycle.eventCount,
      humanReview: longLifecycle.humanReview,
    } : longLifecycle);
    const before = ordering.before as JsonRecord | undefined;
    const after = ordering.after as JsonRecord | undefined;
    const representativePass = transport.status === "PASS"
        && rows["LIVE-V2-1"]?.status === "PASS" && rows["LIVE-V2-7"]?.status === "PASS"
        && semanticReview.status === "PASS"
        && before?.status === "PASS" && after?.status === "PASS";
    const usage = transport.usage && typeof transport.usage === "object" ? transport.usage as JsonRecord : undefined;
    const cacheRead = Number(usage?.cacheRead ?? 0);
    const cacheWrite = Number(usage?.cacheWrite ?? 0);
    const cacheTelemetry = cacheRead > 0 ? {
      status: "PASS", cacheHitClaim: true, source: "provider-reported", cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite,
    } : {
      status: "Unverified", cacheHitClaim: false, reason: usage ? "zero" : "missing",
    };
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
        suffix: rows["LIVE-V2-1"],
        overflow: rows["LIVE-V2-7"],
        semanticReview,
        extensionOrdering: ordering,
        cacheTelemetry,
    };
    const reviewCandidates = representativeFamily && compactScenario?.humanReviewCandidate
      ? { [representativeFamily]: compactScenario.humanReviewCandidate }
      : {};
    let reviewCandidateArtifact = Object.keys(reviewCandidates).length > 0 ? {
      schema: "aili.compact.human-review-candidates.v1",
      status: "PENDING",
      reviewState: "human-verdict-required",
      capturedAt: new Date().toISOString(),
      ...binding,
      liveHarness: { path: AILI_COMPACT_LIVE_HARNESS, sha256: liveHarnessSha256 },
      liveCapture: { path: AILI_COMPACT_LIVE_CAPTURE_PATH, sha256: "pending" },
      candidates: reviewCandidates,
      sanitizer: {
        credentialsIncluded: false, rawConversationIncluded: false, providerRequestsIncluded: false,
        protectedTextIncluded: false, fullLogsIncluded: false, privatePathsIncluded: false,
      },
    } : undefined;
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
    if (reviewCandidateArtifact) {
      reviewCandidateArtifact = {
        ...reviewCandidateArtifact,
        liveCapture: {
          path: AILI_COMPACT_LIVE_CAPTURE_PATH,
          sha256: sha256(`${JSON.stringify(compactArtifact, null, 2)}\n`),
        },
      };
    }
      return { persistentArtifact, compactArtifact, ...(reviewCandidateArtifact ? { reviewCandidateArtifact } : {}) };
    },
    failure: (reason) => ({
      persistentArtifact: {
        schemaVersion: 1, capturedAt: new Date().toISOString(), platform: "linux", piVersion: "0.82.1",
        package: { name: "@rosetears/aili-pi", version: "0.2.0", source: "current workspace package" },
        status: "NON_PASS", probes: ["provider-turn", "child-sandbox", "external-workspace-lifecycle"].map((id) => ({ id, status: "NON_PASS", changedFiles: 0, reason })),
        sanitization: { rawProviderTranscriptIncluded: false, rawCredentialMaterialIncluded: false, credentialMarkerFindings: 0, localAbsolutePathsIncluded: false },
      },
      compactArtifact: { schema: "aili.compact.live-evidence.v3", status: "NON_PASS", reason, sanitized: true },
    }),
    cleanup: async () => await rm(liveRoot, { recursive: true, force: true }),
    verifyCleanup: async () => await access(liveRoot).then(() => false, () => true),
    downgradeForCleanupFailure: (bundle) => ({
      persistentArtifact: { ...bundle.persistentArtifact, status: "NON_PASS", captureCleanup: { status: "NON_PASS", reason: "cleanup-failed" } },
      compactArtifact: { ...bundle.compactArtifact, status: "NON_PASS", captureCleanup: { status: "NON_PASS", reason: "cleanup-failed" } },
      ...(bundle.reviewCandidateArtifact ? { reviewCandidateArtifact: { ...bundle.reviewCandidateArtifact, status: "NON_PASS", reason: "cleanup-failed" } } : {}),
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
        ...(bundle.reviewCandidateArtifact ? [{ path: COMPACT_HUMAN_REVIEW_CANDIDATE_PATH, body: `${JSON.stringify(bundle.reviewCandidateArtifact, null, 2)}\n` }] : []),
        { path: AILI_COMPACT_LIVE_CAPTURE_PATH, body: `${JSON.stringify(bundle.compactArtifact, null, 2)}\n` },
        { path: "manifests/live-verification.json", body: `${JSON.stringify(manifest, null, 2)}\n`, manifest: true },
      ]);
    },
    assertPublished: assertLiveCaptureClaims,
  });
  await expect(access(liveRoot)).rejects.toThrow();
  expect(result.compactArtifact.representative).toBeTruthy();
}, 900_000);
