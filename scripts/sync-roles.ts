import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const ROOT = resolve(import.meta.dirname, "..");
const ROLES_DIR = join(ROOT, "roles");
const MANIFEST_PATH = join(ROOT, "manifests", "roles.json");
const SOURCE_COMMIT = "bb1fedacc46d71045daa6257d121f2b71ba29d54";
const SOURCE_REPOSITORY = "https://github.com/Rosetears520/aili-workflows.git";
const PROFILE_VERSION = 2;
const RUNTIME_ADAPTER_VERSION = 2;
const execFile = promisify(execFileCallback);

const SPECIALIZED_ROLE_NAMES = [
  "agent-evaluator", "ai-regression-scout", "browser-qa-runner", "code-reviewer",
  "code-scout", "convergence-reviewer", "doc-researcher", "e2e-artifact-runner",
  "implementer", "opensource-sanitizer", "plan-auditor", "pr-test-analyzer",
  "security-auditor", "silent-failure-reviewer", "spec-miner", "test-coverage-reviewer",
  "test-engineer", "web-performance-auditor", "web-researcher",
] as const;
const SPECIALIZED_SELECTORS = SPECIALIZED_ROLE_NAMES.map((name) => `aili.${name}`);
const BUNDLED_NAMES = [...SPECIALIZED_ROLE_NAMES, "general"] as const;
const BUNDLED_SELECTORS = [...SPECIALIZED_SELECTORS, "general"];

const OPTIONAL: Record<string, string[]> = {
  "browser-qa-runner": ["browser.qa"],
  "e2e-artifact-runner": ["browser.qa", "artifact.store"],
  "web-performance-auditor": ["browser.qa"],
  "web-researcher": ["web.fetch"],
};
const KNOWN_SOURCE_PERMISSION_KEYS = new Set([
  "apply_patch", "bash", "codegraph_codegraph_callees", "codegraph_codegraph_callers", "codegraph_codegraph_explore",
  "codegraph_codegraph_files", "codegraph_codegraph_impact", "codegraph_codegraph_node", "codegraph_codegraph_search",
  "codegraph_codegraph_status", "context7_query-docs", "context7_resolve-library-id", "doom_loop", "edit",
  "external_directory", "glob", "grep", "list", "lsp", "multi_tool_use.parallel", "playwright_browser_click",
  "playwright_browser_close", "playwright_browser_console_messages", "playwright_browser_drag", "playwright_browser_evaluate",
  "playwright_browser_file_upload", "playwright_browser_fill_form", "playwright_browser_handle_dialog", "playwright_browser_hover",
  "playwright_browser_navigate", "playwright_browser_navigate_back", "playwright_browser_network_requests",
  "playwright_browser_press_key", "playwright_browser_resize", "playwright_browser_run_code", "playwright_browser_select_option",
  "playwright_browser_snapshot", "playwright_browser_tabs", "playwright_browser_take_screenshot", "playwright_browser_type",
  "playwright_browser_wait_for", "read", "skill", "task", "webfetch", "websearch",
]);

interface RoleRecord {
  name: string;
  selector: string;
  description: string;
  profilePath: string;
  profileHash: string;
  profileVersion: 2;
  runtimeAdapterVersion: 2;
  sourceKind: "canonical-adapter" | "aili-owned";
  sourcePath: string | null;
  sourceHash: string;
  tools: string[];
  toolPolicy: "static" | "inherit-parent";
  capabilities: string[];
  spawns: string[];
  blocking: boolean;
  model?: string;
  status: "adapted" | "optional" | "blocked";
  compatibilityReason: string;
  sourceFrontmatterDisposition: Record<string, string>;
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function splitMarkdown(content: string): { description: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("source role lacks YAML frontmatter");
  const description = match[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!description) throw new Error("source role lacks description");
  return { description, body: match[2].trim() };
}

function permissionDefault(frontmatter: string, tool: string): "allow" | "ask" | "deny" | "missing" {
  const direct = frontmatter.match(new RegExp(`^  ${tool}:\\s*(allow|ask|deny)\\s*$`, "m"));
  if (direct) return direct[1] as "allow" | "ask" | "deny";
  const block = frontmatter.match(new RegExp(`^  ${tool}:\\s*\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_*.-]+:|^---$)`, "m"));
  const wildcard = block?.[1].match(/^    ["']?\*["']?:\s*(allow|ask|deny)\s*$/m);
  return wildcard ? wildcard[1] as "allow" | "ask" | "deny" : "missing";
}

function translatedPolicy(source: string): { tools: string[]; blocked: boolean; reason: string } {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!frontmatter) throw new Error("source role lacks frontmatter");
  const permissionKeys = [...frontmatter.matchAll(/^  ([A-Za-z0-9_*.-]+):/gm)].map((match) => match[1]);
  const unknown = permissionKeys.filter((key) => !KNOWN_SOURCE_PERMISSION_KEYS.has(key));
  if (unknown.length > 0) throw new Error(`unknown source permission semantics: ${[...new Set(unknown)].join(",")}`);
  const mappings = [["read", "read"], ["grep", "grep"], ["glob", "find"], ["list", "ls"]] as const;
  const tools: string[] = mappings.filter(([sourceTool]) => permissionDefault(frontmatter, sourceTool) === "allow").map(([, piTool]) => piTool);
  const edit = permissionDefault(frontmatter, "edit");
  const bash = permissionDefault(frontmatter, "bash");
  const editBlock = frontmatter.match(/^  edit:\s*\n([\s\S]*?)(?=^  [a-zA-Z0-9_*.-]+:|$)/m)?.[1] ?? "";
  const bashBlock = frontmatter.match(/^  bash:\s*\n([\s\S]*?)(?=^  [a-zA-Z0-9_*.-]+:|$)/m)?.[1] ?? "";
  const hasEditSemantics = edit === "allow" || edit === "ask" || /^(?:    .+:\s*(?:allow|ask))$/m.test(editBlock);
  const hasBashSemantics = bash === "allow" || bash === "ask" || /^(?:    .+:\s*(?:allow|ask))$/m.test(bashBlock);
  if (hasEditSemantics) tools.push("write", "edit");
  return {
    tools: [...new Set(tools)],
    blocked: false,
    reason: hasEditSemantics
      ? `Source edit semantics are mapped to Pi write/edit under parent, role, mode, canonical-root, explicit task-boundary, credential, and headless fail-closed guards; source bash semantics are ${hasBashSemantics ? "intentionally omitted" : "not granted"}.`
      : "Source role is safely narrowed to Pi read-only tools with application-level credential/path guards.",
  };
}

function profileFrontmatter(args: {
  name: string;
  description: string;
  tools: string[];
  spawns: string[];
  sourceRevision: string;
  sourceKind: RoleRecord["sourceKind"];
}): string[] {
  return [
    "---",
    `name: ${args.name}`,
    `description: ${args.description}`,
    `tools: ${args.tools.join(",") || "[]"}`,
    `spawns: ${args.spawns.join(",") || "[]"}`,
    "blocking: false",
    `aili-profile-version: ${PROFILE_VERSION}`,
    `aili-runtime-adapter-version: ${RUNTIME_ADAPTER_VERSION}`,
    `aili-source-kind: ${args.sourceKind}`,
    `aili-source-revision: ${args.sourceRevision}`,
    "---",
  ];
}

function specializedProfileContent(name: string, description: string, tools: string[], body: string): string {
  const adaptedBody = body
    .replaceAll("OpenCode subagent", "Pi child role")
    .replaceAll("OpenCode", "Pi")
    .replaceAll("Task tool", "AILI task capability")
    .replace(
      "You are a bounded, single-use Pi child role. Complete the supplied assignment once, return one terminal result or failure, and never resume this context.",
      "You are a bounded persistent Pi Agent role. Work only on the supplied assignment or follow-up turn within the same stable Agent identity.",
    )
    .replace(/## Output\n[\s\S]*?(?=\n## Stop)/, "## Output\n\nReturn exactly one JSON object with keys `status`, `summary`, `evidence`, `changedFiles`, `verification`, `blockers`, `risks`, and `confidence`.");
  return [
    ...profileFrontmatter({
      name,
      description,
      tools,
      spawns: [],
      sourceRevision: SOURCE_COMMIT,
      sourceKind: "canonical-adapter",
    }),
    "",
    adaptedBody,
    "",
    "## Pi adapter contract",
    "",
    "You run in a parent-scoped persistent official Pi Agent session. Each turn has one supplied assignment or follow-up; an idle session may park and later revive with its retained transcript.",
    "Child Agent spawning is disabled for this specialized profile. Use only the effective tools exposed by the parent/role/capability/policy intersection; a task packet may narrow and never broaden them.",
    "Return exactly one JSON object with keys `status`, `summary`, `evidence`, `changedFiles`, `verification`, `blockers`, `risks`, and `confidence`.",
    "Do not include credentials, raw environment variables, authentication-store content, or unbounded command output.",
    "",
  ].join("\n");
}

function generalProfileContent(): string {
  const description = "General persistent Agent for focused delegated work using the parent's current active tool ceiling and explicit spawn policy.";
  return [
    ...profileFrontmatter({
      name: "general",
      description,
      tools: [],
      spawns: SPECIALIZED_SELECTORS,
      sourceRevision: "aili-owned-general-v1",
      sourceKind: "aili-owned",
    }),
    "",
    "# General Agent",
    "",
    "## Role",
    "",
    "You are AILI's general persistent worker Agent. Complete the current delegated assignment and retain relevant context for later follow-up turns under the same stable Agent identity.",
    "",
    "## Goal",
    "",
    "Deliver the requested bounded outcome using only the effective tools inherited from the parent and only the specialized child roles allowed by the runtime spawn policy.",
    "",
    "## Success criteria",
    "",
    "- Stay focused on the supplied task and explicit context.",
    "- Use tools only when they materially advance the task.",
    "- Delegate only to an allowed non-self specialized role when it has clear benefit.",
    "- Return concise, evidence-grounded results and preserve unresolved blockers.",
    "",
    "## Constraints",
    "",
    "- Parent permissions, active tools, project trust, credential guards, recursion depth, and workspace policy always apply and can only narrow authority.",
    "- Do not infer access to the parent's conversation history beyond explicit task/context and trusted resources.",
    "- Do not write persistent configuration, delete history, or perform external/destructive operations without the required user confirmation.",
    "- Never claim a child task, tool call, verification, or delivery succeeded without evidence.",
    "",
    "## Output",
    "",
    "Return exactly one JSON object with keys `status`, `summary`, `evidence`, `changedFiles`, `verification`, `blockers`, `risks`, and `confidence`.",
    "",
    "## Stop",
    "",
    "Stop when the assignment is complete, a material decision or permission is missing, required evidence is unavailable, or continuing would exceed the accepted task boundary.",
    "",
    "## Pi adapter contract",
    "",
    "You run in a parent-scoped persistent official Pi Agent session. Each turn has one supplied assignment or follow-up; an idle session may park and later revive with its retained transcript.",
    "Use only the effective parent-active/capability/policy tool intersection. The runtime may expose `task` only for allowed non-self specialized selectors and within the accepted depth ceiling.",
    "Do not include credentials, raw environment variables, authentication-store content, or unbounded command output.",
    "",
  ].join("\n");
}

async function generate(sourceRoot: string): Promise<void> {
  const git = async (...args: string[]) => (await execFile("git", args, { cwd: sourceRoot, encoding: "utf8" })).stdout.trim();
  const [commit, origin, status] = await Promise.all([
    git("rev-parse", "HEAD"),
    git("remote", "get-url", "origin"),
    git("status", "--porcelain"),
  ]);
  if (commit !== SOURCE_COMMIT) throw new Error(`source revision mismatch: ${commit}`);
  if (origin !== SOURCE_REPOSITORY) throw new Error(`source origin mismatch: ${origin}`);
  if (status !== "") throw new Error("source worktree must be clean");

  const records: RoleRecord[] = [];
  for (const name of SPECIALIZED_ROLE_NAMES) {
    const sourcePath = join(sourceRoot, "agents", `${name}.md`);
    if ((await lstat(sourcePath)).isSymbolicLink()) throw new Error(`${name}: source role must not be a symlink`);
    const source = await readFile(sourcePath, "utf8");
    const { description, body } = splitMarkdown(source);
    const policy = translatedPolicy(source);
    const tools = [...policy.tools];
    if (name === "web-researcher") tools.length = 0;
    const capabilities = ["repo.read", ...(tools.some((tool) => tool === "write" || tool === "edit") ? ["repo.write"] : []), ...(OPTIONAL[name] ?? [])];
    if (name === "web-researcher") capabilities.splice(0, 1);
    const profile = specializedProfileContent(name, description, tools, body);
    await writeFile(join(ROLES_DIR, `${name}.md`), profile, "utf8");
    records.push({
      name,
      selector: `aili.${name}`,
      description,
      profilePath: `roles/${name}.md`,
      profileHash: hash(profile),
      profileVersion: PROFILE_VERSION,
      runtimeAdapterVersion: RUNTIME_ADAPTER_VERSION,
      sourceKind: "canonical-adapter",
      sourcePath: `agents/${name}.md`,
      sourceHash: hash(source),
      tools,
      toolPolicy: "static",
      capabilities,
      spawns: [],
      blocking: false,
      status: OPTIONAL[name] ? "optional" : policy.blocked ? "blocked" : "adapted",
      compatibilityReason: OPTIONAL[name] ? `Optional capabilities are required: ${OPTIONAL[name].join(", ")}.` : policy.reason,
      sourceFrontmatterDisposition: {
        mode: "translated into a parent-scoped persistent official Pi Agent session",
        hidden: "not interpreted by Pi",
        permission: "translated into the explicit Pi tool/capability ceiling; source YAML is never executed",
      },
    });
  }

  const general = generalProfileContent();
  await writeFile(join(ROLES_DIR, "general.md"), general, "utf8");
  records.push({
    name: "general",
    selector: "general",
    description: "General persistent Agent for focused delegated work using the parent's current active tool ceiling and explicit spawn policy.",
    profilePath: "roles/general.md",
    profileHash: hash(general),
    profileVersion: PROFILE_VERSION,
    runtimeAdapterVersion: RUNTIME_ADAPTER_VERSION,
    sourceKind: "aili-owned",
    sourcePath: null,
    sourceHash: hash(general),
    tools: [],
    toolPolicy: "inherit-parent",
    capabilities: ["parent.active"],
    spawns: SPECIALIZED_SELECTORS,
    blocking: false,
    status: "adapted",
    compatibilityReason: "AILI-owned OMP-inspired general worker; effective tools inherit and can only narrow the parent active ceiling.",
    sourceFrontmatterDisposition: {
      mode: "AILI-owned persistent Agent profile",
      hidden: "not applicable",
      permission: "runtime parent-active/capability/policy intersection",
    },
  });

  await writeFile(MANIFEST_PATH, `${JSON.stringify({
    schemaVersion: 2,
    runtimeAdapterVersion: RUNTIME_ADAPTER_VERSION,
    source: { repository: SOURCE_REPOSITORY, commit: SOURCE_COMMIT },
    bundledSelectors: BUNDLED_SELECTORS,
    outputContract: ["status", "summary", "evidence", "changedFiles", "verification", "blockers", "risks", "confidence"],
    turnAuditFields: ["selector", "profileHash", "sourceHash", "profileVersion", "runtimeAdapterVersion", "effectiveTools", "provider", "model", "thinking"],
    records,
  }, null, 2)}\n`, "utf8");
}

async function verify(): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as {
    schemaVersion: number;
    runtimeAdapterVersion: number;
    source: { repository: string; commit: string };
    bundledSelectors: string[];
    turnAuditFields: string[];
    records: RoleRecord[];
  };
  const errors: string[] = [];
  if (manifest.schemaVersion !== 2) errors.push("roles manifest schemaVersion must be 2");
  if (manifest.runtimeAdapterVersion !== RUNTIME_ADAPTER_VERSION) errors.push("roles runtimeAdapterVersion mismatch");
  if (manifest.source?.repository !== SOURCE_REPOSITORY || manifest.source?.commit !== SOURCE_COMMIT) errors.push("roles source provenance mismatch");
  if (JSON.stringify(manifest.bundledSelectors) !== JSON.stringify(BUNDLED_SELECTORS)) errors.push("bundled selector inventory mismatch");
  if (JSON.stringify(manifest.turnAuditFields) !== JSON.stringify(["selector", "profileHash", "sourceHash", "profileVersion", "runtimeAdapterVersion", "effectiveTools", "provider", "model", "thinking"])) errors.push("turn audit field inventory mismatch");
  const expected = new Set(BUNDLED_NAMES);
  const seen = new Set<string>();
  const selectors = new Set<string>();
  for (const role of manifest.records ?? []) {
    if (!expected.has(role.name as typeof BUNDLED_NAMES[number])) errors.push(`${role.name}: unexpected role`);
    if (seen.has(role.name)) errors.push(`${role.name}: duplicate role`);
    if (selectors.has(role.selector)) errors.push(`${role.selector}: duplicate selector`);
    seen.add(role.name);
    selectors.add(role.selector);
    if (role.profilePath !== `roles/${role.name}.md`) errors.push(`${role.name}: invalid profile path`);
    const content = await readFile(join(ROOT, role.profilePath), "utf8").catch(() => "");
    if (!content) errors.push(`${role.name}: missing profile`);
    else {
      if (hash(content) !== role.profileHash) errors.push(`${role.name}: profile hash drift`);
      if (content.includes("OpenCode subagent") || content.includes("single-use") || content.includes("--no-session") || content.includes("Recursive AILI task dispatch is unavailable")) errors.push(`${role.name}: obsolete runtime adapter wording remains`);
      if (!content.includes("parent-scoped persistent official Pi Agent session")) errors.push(`${role.name}: persistent adapter contract missing`);
      if (!content.includes("Return exactly one JSON object")) errors.push(`${role.name}: output contract missing`);
    }
    if (role.profileVersion !== PROFILE_VERSION || role.runtimeAdapterVersion !== RUNTIME_ADAPTER_VERSION) errors.push(`${role.name}: profile/runtime version mismatch`);
    if (!Array.isArray(role.tools) || !Array.isArray(role.capabilities) || !Array.isArray(role.spawns)) errors.push(`${role.name}: invalid policy arrays`);
    if (role.blocking !== false) errors.push(`${role.name}: unexpected blocking policy`);
    if (!role.compatibilityReason) errors.push(`${role.name}: compatibility reason missing`);
    if (role.status !== "adapted" && role.status !== "optional" && role.status !== "blocked") errors.push(`${role.name}: invalid compatibility status`);
    if (role.name === "general") {
      if (role.selector !== "general" || role.toolPolicy !== "inherit-parent") errors.push("general: selector/tool policy mismatch");
      if (JSON.stringify(role.spawns) !== JSON.stringify(SPECIALIZED_SELECTORS)) errors.push("general: spawn inventory mismatch");
      if (role.sourceKind !== "aili-owned" || role.sourcePath !== null) errors.push("general: source ownership mismatch");
      if (content && role.sourceHash !== hash(content)) errors.push("general: source hash mismatch");
    } else {
      if (role.selector !== `aili.${role.name}` || role.toolPolicy !== "static") errors.push(`${role.name}: selector/tool policy mismatch`);
      if (role.spawns.length !== 0) errors.push(`${role.name}: specialized spawns must be empty`);
      if (role.sourceKind !== "canonical-adapter" || role.sourcePath !== `agents/${role.name}.md`) errors.push(`${role.name}: source ownership mismatch`);
    }
  }
  for (const name of expected) if (!seen.has(name)) errors.push(`${name}: missing role`);
  const files = (await readdir(ROLES_DIR)).filter((name) => name.endsWith(".md")).sort();
  const expectedFiles = BUNDLED_NAMES.map((name) => `${name}.md`).sort();
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) errors.push(`role file inventory mismatch: ${files.length}/20`);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(`Role profiles verified: ${manifest.records.length}`);
}

const args = process.argv.slice(2);
if (args.includes("--verify")) {
  await verify();
} else {
  const sourceFlag = args.indexOf("--source");
  if (sourceFlag < 0 || !args[sourceFlag + 1]) throw new Error("Usage: sync-roles.ts --source <aili-workflows-root>");
  const sourceRoot = resolve(args[sourceFlag + 1]);
  if (basename(sourceRoot) === "") throw new Error("invalid source root");
  await generate(sourceRoot);
  await verify();
}
