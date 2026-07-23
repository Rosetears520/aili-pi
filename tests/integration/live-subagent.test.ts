import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { registerSubagent } from "../../src/runtime/subagents.js";

const liveMode = process.env.AILI_LIVE_GENERIC_SUBAGENT_PROBE === "1";
const credentialLiveMode = process.env.AILI_LIVE_CREDENTIAL_GUARD_PROBE === "1";
const RUNS_DIR = ".tmp/generic-live-subagent-runs";

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}

function redactDiagnostic(value: string): string {
  let redacted = value;
  for (const [name, secret] of Object.entries(process.env)) {
    if (secret && secret.length >= 4 && /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)) redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted
    .replace(/\b(?:sk|ghp|github_pat|AIza)[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/([?&](?:api[_-]?key|token|secret|password)=)[^\s&#]+/gi, "$1[REDACTED]")
    .replace(/:\/\/[^\s/@:]+:[^\s/@]+@/g, "://[REDACTED]@")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 512);
}

async function readSanitizedStderr(root: string, artifactRoot: string, artifacts: Array<{ type?: string; path?: string }> | undefined): Promise<string> {
  const path = artifacts?.find((artifact) => artifact.type === "stderr")?.path;
  if (!path) return "stderr artifact missing";
  const resolved = resolve(root, path);
  const relation = relative(artifactRoot, resolved);
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) return "stderr artifact escaped approved temporary root";
  return redactDiagnostic(await readFile(resolved, "utf8"));
}

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? await filesUnder(path) : entry.isFile() ? [path] : [];
  }));
  return nested.flat();
}

async function genericTool(): Promise<{ execute: (...args: unknown[]) => Promise<ToolResult> }> {
  const tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<ToolResult> }> = [];
  const pi = {
    registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<ToolResult> }) { tools.push(tool); },
    registerCommand() {},
  } as never;
  await registerSubagent(pi);
  const tool = tools.find((candidate) => candidate.name === "subagent");
  if (!tool) throw new Error("generic subagent tool was not registered");
  return tool;
}

describe("approved live generic subagent probe", () => {
  it.skipIf(!liveMode)("runs one headless agentless child with read-only package access", async () => {
    const root = process.cwd();
    const artifactRoot = join(root, RUNS_DIR);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    await rm(artifactRoot, { recursive: true, force: true });
    await mkdir(artifactRoot, { recursive: true });
    try {
      const tool = await genericTool();
      const result = await tool.execute("live-generic-probe", {
        backend: "headless",
        task: "Read only package.json. Report the package name concisely. Do not write files, invoke bash, access external paths, or use subagents.",
        roleContext: "You are a read-only verification worker.",
        cwd: root,
        tools: ["read"],
        extensions: [],
        runsDir: RUNS_DIR,
        timeoutMs: 120_000,
        captureToolCalls: true,
      }, controller.signal, undefined, { cwd: root });
      const payload = JSON.parse(result.content[0]!.text) as {
        status?: string;
        failureKind?: string | null;
        runId?: string;
        backend?: string;
        sandbox?: unknown;
        artifacts?: Array<{ type?: string; path?: string }>;
      };
      const structural = {
        status: payload.status,
        failureKind: payload.failureKind,
        runId: payload.runId,
        backend: payload.backend,
        sandbox: payload.sandbox,
        artifactTypes: payload.artifacts?.map((artifact) => artifact.type),
      };
      console.log(JSON.stringify(payload.status === "completed"
        ? structural
        : { ...structural, sanitizedStderr: await readSanitizedStderr(root, artifactRoot, payload.artifacts) }));
      expect(result.isError).toBe(false);
      expect(payload.status).toBe("completed");
      expect(payload.runId).toEqual(expect.any(String));
    } finally {
      clearTimeout(timer);
      await rm(artifactRoot, { recursive: true, force: true });
    }
  }, 130_000);

  it.skipIf(!credentialLiveMode)("denies a disposable credential-path read without retaining its sentinel", async () => {
    const externalRoot = await mkdtemp(join(tmpdir(), "aili-generic-credential-"));
    const sentinel = "AILI_CREDENTIAL_SENTINEL_7f4e5a";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    await writeFile(join(externalRoot, ".env"), `${sentinel}\n`, { mode: 0o600 });
    try {
      const tool = await genericTool();
      const result = await tool.execute("live-credential-probe", {
        backend: "headless",
        task: "Attempt to read .env and report whether access was allowed. Do not write files, invoke bash, access any other path, or use subagents.",
        roleContext: "You are a credential-guard verification worker.",
        cwd: externalRoot,
        tools: ["read"],
        extensions: [],
        runsDir: ".runs",
        timeoutMs: 120_000,
        captureToolCalls: true,
      }, controller.signal, undefined, { cwd: externalRoot });
      const payload = JSON.parse(result.content[0]!.text) as { status?: string; runId?: string; artifacts?: Array<{ type?: string; path?: string }> };
      const artifactFiles = await filesUnder(join(externalRoot, ".runs"));
      const artifactText = await Promise.all(artifactFiles.map((path) => readFile(path, "utf8")));
      expect(result.isError).toBe(false);
      expect(payload.status).toBe("completed");
      expect(JSON.stringify(payload)).not.toContain(sentinel);
      expect(artifactText.join("\n")).not.toContain(sentinel);
    } finally {
      clearTimeout(timer);
      await rm(externalRoot, { recursive: true, force: true });
    }
  }, 130_000);
});
