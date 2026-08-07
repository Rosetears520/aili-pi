#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPORT_SCHEMA = "aili.compact.openspec-sequence.v1";
const SCRATCH_PREFIX = "aili-compact-openspec-sequence-";
const RELEASE_ORDER = [
  { stage: "accepted-base", changeId: "add-reversible-context-compression" },
  { stage: "base-plus-fix", changeId: "fix-aili-compact-recovery-deadlock" },
  { stage: "base-plus-fix-plus-redesign", changeId: "redesign-aili-compact-lifecycle" },
  { stage: "base-plus-fix-plus-redesign-plus-emergency-checkpoint", changeId: "replace-pi-native-fallback-with-aili-emergency-checkpoint" },
  { stage: "base-plus-fix-plus-redesign-plus-emergency-checkpoint-plus-release-lineage-reconciliation", changeId: "reconcile-aili-compact-release-lineage" },
];
const OPERATION_NAMES = ["ADDED", "MODIFIED", "REMOVED"];

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function validateAiliCompactOpenSpecSequence(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? defaultRepoRoot);
  const scratchParent = resolve(options.scratchParent ?? join(repoRoot, ".tmp"));
  const openspecBin = options.openspecBin
    ?? process.env.OPENSPEC_BIN
    ?? (process.platform === "win32" ? "openspec.cmd" : "openspec");
  await mkdir(scratchParent, { recursive: true });
  const scratch = await mkdtemp(join(scratchParent, SCRATCH_PREFIX));
  let report;
  let cleaned = false;

  try {
    await createScratchProject(repoRoot, scratch);
    const cli = options.forceFallback
      ? { supported: false, version: undefined, reason: "forced-fallback" }
      : probeOpenSpecCli(openspecBin, scratch, repoRoot);
    report = cli.supported
      ? await runOfficialSequence({ repoRoot, scratch, openspecBin, cliVersion: cli.version })
      : await runHeadingFallback({ repoRoot, scratch, cli });
  } catch (error) {
    report = {
      schema: REPORT_SCHEMA,
      mode: "internal-error",
      materialized: false,
      status: "FAIL",
      sequenceResult: "FAIL",
      releaseOrder: RELEASE_ORDER.map(({ changeId }) => changeId),
      stages: [],
      blockers: [{
        code: "validator-internal-error",
        stage: "bootstrap",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  } finally {
    await assertOwnedScratch(scratchParent, scratch);
    await rm(scratch, { recursive: true, force: true });
    cleaned = true;
  }

  return {
    ...report,
    scratch: { parent: ".tmp", prefix: SCRATCH_PREFIX, cleaned },
    sourceWorkspaceMutated: false,
  };
}

async function runOfficialSequence({ repoRoot, scratch, openspecBin, cliVersion }) {
  const stages = [];
  const blockers = [];
  for (const descriptor of RELEASE_ORDER) {
    const stage = await runOfficialStage({ repoRoot, scratch, openspecBin, ...descriptor });
    stages.push(stage);
    blockers.push(...stage.blockers);
    if (stage.status !== "PASS") break;
  }
  const complete = stages.length === RELEASE_ORDER.length;
  const pass = complete && stages.every((stage) => stage.status === "PASS");
  if (!complete) {
    for (const descriptor of RELEASE_ORDER.slice(stages.length)) {
      stages.push({
        stage: descriptor.stage,
        changeId: descriptor.changeId,
        status: "NOT_RUN",
        reason: "prior-stage-failed",
        blockers: [],
      });
    }
  }
  return {
    schema: REPORT_SCHEMA,
    mode: "openspec-archive",
    openspecVersion: cliVersion,
    materialized: true,
    status: pass ? "PASS" : "FAIL",
    sequenceResult: pass ? "PASS" : "FAIL",
    releaseOrder: RELEASE_ORDER.map(({ changeId }) => changeId),
    stages,
    blockers,
  };
}

async function runOfficialStage({ repoRoot, scratch, openspecBin, stage, changeId }) {
  const sourceChange = join(repoRoot, "openspec", "changes", changeId);
  const scratchChange = join(scratch, "openspec", "changes", changeId);
  await cp(sourceChange, scratchChange, { recursive: true, errorOnExist: true });

  const before = await snapshotMainSpecs(scratch);
  const delta = await readChangeDelta(scratchChange);
  const expected = applyDelta(before, delta);
  const archiveRun = runCli(openspecBin, ["--no-color", "archive", changeId, "--yes"], scratch, repoRoot);
  const archiveOutput = combinedOutput(archiveRun);
  const archiveSucceeded = archiveRun.exitCode === 0
    && archiveOutput.includes(`Change '${changeId}' archived as`)
    && !archiveOutput.includes("Aborted. No files were changed.")
    && !(await pathExists(scratchChange));
  const after = await snapshotMainSpecs(scratch);
  const atomicNoChange = archiveSucceeded ? undefined : equalSpecStates(before, after);
  const materialization = archiveSucceeded && expected.applied
    ? compareSpecStates(expected.state, after, delta)
    : {
        status: "FAIL",
        expectedApplied: expected.applied,
        atomicNoChange,
        differences: expected.issues,
        operations: deltaOperationSummary(delta),
      };

  const strictValidation = archiveSucceeded
    ? strictValidateSpecs(openspecBin, scratch, repoRoot)
    : { status: "NOT_RUN", reason: "archive-failed" };
  const status = archiveSucceeded
    && expected.applied
    && materialization.status === "PASS"
    && strictValidation.status === "PASS"
    ? "PASS"
    : "FAIL";
  const blockers = [];
  for (const issue of expected.issues) blockers.push({ code: issue.code, stage, ...issue });
  if (!archiveSucceeded) {
    blockers.push({
      code: "openspec-archive-failed",
      stage,
      exitCode: archiveRun.exitCode,
      message: conciseFailure(archiveRun),
    });
  }
  if (archiveSucceeded && materialization.status !== "PASS") {
    blockers.push({ code: "materialized-requirements-mismatch", stage, message: "Official archive output did not match the deterministic requirement merge." });
  }
  if (archiveSucceeded && strictValidation.status !== "PASS") {
    blockers.push({ code: "strict-spec-validation-failed", stage, message: "Materialized main specs failed `openspec validate --specs --strict`." });
  }

  return {
    stage,
    changeId,
    status,
    deltaPreflight: {
      status: expected.applied ? "PASS" : "FAIL",
      operations: deltaOperationSummary(delta),
      issues: expected.issues,
    },
    archive: {
      status: archiveSucceeded ? "PASS" : "FAIL",
      exitCode: archiveRun.exitCode,
      semanticSuccess: archiveSucceeded,
      output: archiveOutput,
      ...(atomicNoChange === undefined ? {} : { atomicNoChange }),
    },
    materialization,
    strictValidation,
    blockers,
  };
}

async function runHeadingFallback({ repoRoot, scratch, cli }) {
  const stages = [];
  const blockers = [{
    code: "openspec-materialization-unavailable",
    stage: "bootstrap",
    message: cli.reason ?? "The official OpenSpec archive/materialization interface is unavailable.",
  }];
  let state = new Map();
  let deterministicMergeStatus = "PASS";

  for (const descriptor of RELEASE_ORDER) {
    const sourceChange = join(repoRoot, "openspec", "changes", descriptor.changeId);
    const scratchChange = join(scratch, "openspec", "changes", descriptor.changeId);
    await cp(sourceChange, scratchChange, { recursive: true, errorOnExist: true });
    const delta = await readChangeDelta(scratchChange);
    const merged = applyDelta(state, delta);
    const validationIssues = merged.applied ? validateRequirementState(merged.state) : [];
    const mergePass = merged.applied && validationIssues.length === 0;
    if (mergePass) state = merged.state;
    else deterministicMergeStatus = "FAIL";
    const stageBlockers = [
      ...merged.issues.map((issue) => ({ code: issue.code, stage: descriptor.stage, ...issue })),
      ...validationIssues.map((issue) => ({ code: issue.code, stage: descriptor.stage, ...issue })),
    ];
    blockers.push(...stageBlockers);
    stages.push({
      stage: descriptor.stage,
      changeId: descriptor.changeId,
      status: mergePass ? "Unverified" : "FAIL",
      deltaPreflight: {
        status: merged.applied ? "PASS" : "FAIL",
        operations: deltaOperationSummary(delta),
        issues: merged.issues,
      },
      deterministicHeadingMerge: {
        status: mergePass ? "PASS" : "FAIL",
        strictValidation: "Unverified",
        issues: validationIssues,
      },
      blockers: stageBlockers,
    });
    if (!mergePass) break;
  }
  if (stages.length < RELEASE_ORDER.length) {
    for (const descriptor of RELEASE_ORDER.slice(stages.length)) {
      stages.push({ stage: descriptor.stage, changeId: descriptor.changeId, status: "NOT_RUN", reason: "prior-stage-failed", blockers: [] });
    }
  }

  return {
    schema: REPORT_SCHEMA,
    mode: "deterministic-requirement-heading-fallback",
    openspecVersion: cli.version,
    materialized: false,
    status: "Unverified",
    sequenceResult: deterministicMergeStatus === "PASS" ? "Unverified" : "FAIL",
    releaseOrder: RELEASE_ORDER.map(({ changeId }) => changeId),
    stages,
    blockers,
  };
}

function probeOpenSpecCli(openspecBin, scratch, repoRoot) {
  const version = runCli(openspecBin, ["--version"], scratch, repoRoot);
  if (version.exitCode !== 0) {
    return { supported: false, reason: version.errorCode === "ENOENT" ? "openspec-cli-not-found" : "openspec-version-probe-failed" };
  }
  const archiveHelp = runCli(openspecBin, ["archive", "--help"], scratch, repoRoot);
  const output = combinedOutput(archiveHelp);
  const supported = archiveHelp.exitCode === 0
    && output.includes("Archive a completed change and update main specs")
    && output.includes("--yes");
  return {
    supported,
    version: version.rawStdout.trim() || undefined,
    ...(supported ? {} : { reason: "openspec-archive-materialization-unsupported" }),
  };
}

function strictValidateSpecs(openspecBin, scratch, repoRoot) {
  const run = runCli(openspecBin, ["--no-color", "validate", "--specs", "--strict", "--json", "--no-interactive"], scratch, repoRoot);
  const parsed = parseJsonOutput(run.rawStdout);
  const totals = parsed?.summary?.totals;
  const pass = run.exitCode === 0
    && typeof totals?.items === "number"
    && totals.items > 0
    && totals.failed === 0
    && totals.passed === totals.items;
  return {
    status: pass ? "PASS" : "FAIL",
    exitCode: run.exitCode,
    summary: totals ?? null,
    items: Array.isArray(parsed?.items)
      ? parsed.items.map((item) => ({ id: item.id, type: item.type, valid: item.valid, issues: item.issues ?? [] }))
      : [],
    ...(pass ? {} : { output: combinedOutput(run) }),
  };
}

function runCli(bin, args, cwd, repoRoot) {
  const isolatedHome = join(cwd, ".home");
  const result = spawnSync(bin, args, {
    cwd,
    env: {
      ...process.env,
      HOME: isolatedHome,
      USERPROFILE: isolatedHome,
      XDG_CONFIG_HOME: join(isolatedHome, ".config"),
      CI: "1",
      NO_COLOR: "1",
      OPENSPEC_TELEMETRY: "0",
    },
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    exitCode: typeof result.status === "number" ? result.status : 127,
    rawStdout: result.stdout ?? "",
    stdout: sanitizeOutput(result.stdout ?? "", cwd, repoRoot),
    stderr: sanitizeOutput(result.stderr ?? "", cwd, repoRoot),
    errorCode: result.error && "code" in result.error ? result.error.code : undefined,
  };
}

async function createScratchProject(repoRoot, scratch) {
  await mkdir(join(scratch, "openspec", "changes"), { recursive: true });
  await cp(join(repoRoot, "openspec", "config.yaml"), join(scratch, "openspec", "config.yaml"), { errorOnExist: true });
  await mkdir(join(scratch, ".home"), { recursive: true });
}

async function readChangeDelta(changeDir) {
  const specsDir = join(changeDir, "specs");
  const entries = (await readdir(specsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const documents = [];
  for (const entry of entries) {
    const markdown = await readFile(join(specsDir, entry.name, "spec.md"), "utf8");
    documents.push(parseDeltaDocument(entry.name, markdown));
  }
  return documents;
}

function parseDeltaDocument(capability, markdown) {
  const lines = normalizeMarkdown(markdown).split("\n");
  const operations = { ADDED: new Map(), MODIFIED: new Map(), REMOVED: new Map() };
  const issues = [];
  let operation;
  for (let index = 0; index < lines.length;) {
    const section = /^## (ADDED|MODIFIED|REMOVED) Requirements\s*$/.exec(lines[index]);
    if (section) {
      operation = section[1];
      index += 1;
      continue;
    }
    const heading = /^### Requirement: (.+?)\s*$/.exec(lines[index]);
    if (!heading) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < lines.length && !/^### Requirement: /.test(lines[end]) && !/^## /.test(lines[end])) end += 1;
    const content = lines.slice(index, end).join("\n").trim();
    const name = heading[1].trim();
    if (!operation || !OPERATION_NAMES.includes(operation)) {
      issues.push({ code: "requirement-outside-delta-operation", capability, heading: name });
    } else if (operations[operation].has(name)) {
      issues.push({ code: "duplicate-delta-requirement", capability, heading: name, operation });
    } else {
      operations[operation].set(name, content);
    }
    index = end;
  }
  const seen = new Map();
  for (const operationName of OPERATION_NAMES) {
    for (const heading of operations[operationName].keys()) {
      const prior = seen.get(heading);
      if (prior) issues.push({ code: "requirement-in-multiple-operations", capability, heading, operations: [prior, operationName] });
      seen.set(heading, operationName);
    }
  }
  return { capability, operations, issues };
}

async function snapshotMainSpecs(scratch) {
  const specsDir = join(scratch, "openspec", "specs");
  let entries;
  try {
    entries = await readdir(specsDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return new Map();
    throw error;
  }
  const state = new Map();
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const markdown = await readFile(join(specsDir, entry.name, "spec.md"), "utf8");
    state.set(entry.name, parseMainRequirements(entry.name, markdown));
  }
  return state;
}

function parseMainRequirements(capability, markdown) {
  const lines = normalizeMarkdown(markdown).split("\n");
  const requirements = new Map();
  for (let index = 0; index < lines.length;) {
    const heading = /^### Requirement: (.+?)\s*$/.exec(lines[index]);
    if (!heading) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < lines.length && !/^### Requirement: /.test(lines[end]) && !/^## /.test(lines[end])) end += 1;
    const name = heading[1].trim();
    if (requirements.has(name)) throw new Error(`Duplicate main requirement heading in ${capability}: ${name}`);
    requirements.set(name, lines.slice(index, end).join("\n").trim());
    index = end;
  }
  return requirements;
}

function applyDelta(state, delta) {
  const next = cloneSpecState(state);
  const issues = delta.flatMap((document) => document.issues.map((issue) => ({ ...issue })));
  for (const document of delta) {
    const before = next.get(document.capability) ?? new Map();
    for (const heading of document.operations.ADDED.keys()) {
      if (before.has(heading)) issues.push({ code: "added-requirement-already-exists", capability: document.capability, heading, operation: "ADDED" });
    }
    for (const heading of document.operations.MODIFIED.keys()) {
      if (!before.has(heading)) issues.push({ code: "modified-requirement-not-found", capability: document.capability, heading, operation: "MODIFIED" });
    }
    for (const heading of document.operations.REMOVED.keys()) {
      if (!before.has(heading)) issues.push({ code: "removed-requirement-not-found", capability: document.capability, heading, operation: "REMOVED" });
    }
  }
  if (issues.length > 0) return { applied: false, state: cloneSpecState(state), issues };

  for (const document of delta) {
    const before = next.get(document.capability) ?? new Map();
    const after = new Map();
    for (const [heading, content] of before) {
      if (document.operations.REMOVED.has(heading)) continue;
      after.set(heading, document.operations.MODIFIED.get(heading) ?? content);
    }
    for (const [heading, content] of document.operations.ADDED) after.set(heading, content);
    next.set(document.capability, after);
  }
  return { applied: true, state: next, issues: [] };
}

function compareSpecStates(expected, actual, delta) {
  const differences = specStateDifferences(expected, actual);
  return {
    status: differences.length === 0 ? "PASS" : "FAIL",
    expectedApplied: true,
    operations: deltaOperationSummary(delta),
    differences,
  };
}

function specStateDifferences(expected, actual) {
  const differences = [];
  const capabilities = new Set([...expected.keys(), ...actual.keys()]);
  for (const capability of [...capabilities].sort()) {
    const expectedRequirements = expected.get(capability);
    const actualRequirements = actual.get(capability);
    if (!expectedRequirements) {
      differences.push({ code: "unexpected-capability", capability });
      continue;
    }
    if (!actualRequirements) {
      differences.push({ code: "missing-capability", capability });
      continue;
    }
    const headings = new Set([...expectedRequirements.keys(), ...actualRequirements.keys()]);
    for (const heading of headings) {
      if (!expectedRequirements.has(heading)) differences.push({ code: "unexpected-requirement", capability, heading });
      else if (!actualRequirements.has(heading)) differences.push({ code: "missing-requirement", capability, heading });
      else if (normalizeMarkdown(expectedRequirements.get(heading)) !== normalizeMarkdown(actualRequirements.get(heading))) {
        differences.push({ code: "requirement-content-mismatch", capability, heading });
      }
    }
  }
  return differences;
}

function validateRequirementState(state) {
  const issues = [];
  for (const [capability, requirements] of state) {
    if (requirements.size === 0) issues.push({ code: "capability-has-no-requirements", capability });
    for (const [heading, content] of requirements) {
      if (!/\b(?:SHALL|MUST)\b/.test(content)) issues.push({ code: "requirement-missing-normative-keyword", capability, heading });
      if (!/^#### Scenario: /m.test(content)) issues.push({ code: "requirement-missing-scenario", capability, heading });
    }
  }
  return issues;
}

function deltaOperationSummary(delta) {
  return delta.map((document) => ({
    capability: document.capability,
    added: [...document.operations.ADDED.keys()],
    modified: [...document.operations.MODIFIED.keys()],
    removed: [...document.operations.REMOVED.keys()],
  }));
}

function cloneSpecState(state) {
  return new Map([...state].map(([capability, requirements]) => [capability, new Map(requirements)]));
}

function equalSpecStates(left, right) {
  return specStateDifferences(left, right).length === 0 && specStateDifferences(right, left).length === 0;
}

function normalizeMarkdown(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function parseJsonOutput(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function sanitizeOutput(value, scratch, repoRoot) {
  return String(value)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replaceAll(scratch, "<scratch>")
    .replaceAll(repoRoot, "<repo>")
    .trim()
    .slice(0, 12_000);
}

function combinedOutput(run) {
  return [run.stdout, run.stderr].filter(Boolean).join("\n").trim();
}

function conciseFailure(run) {
  const output = combinedOutput(run);
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /failed|not found|aborted|error/i.test(line)) ?? lines.at(-1) ?? `exit ${run.exitCode}`;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function assertOwnedScratch(parent, scratch) {
  const realParent = await realpath(parent);
  const realScratch = await realpath(scratch);
  const rel = relative(realParent, realScratch);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || !basename(realScratch).startsWith(SCRATCH_PREFIX)) {
    throw new Error(`Refusing to clean non-owned scratch path: ${realScratch}`);
  }
}

function parseCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--force-fallback") options.forceFallback = true;
    else if (argv[index] === "--openspec-bin") {
      index += 1;
      if (!argv[index]) throw new Error("--openspec-bin requires a value");
      options.openspecBin = argv[index];
    } else if (argv[index] !== "--json") {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  return options;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const report = await validateAiliCompactOpenSpecSequence(parseCliArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.status === "PASS" ? 0 : report.status === "Unverified" ? 2 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
