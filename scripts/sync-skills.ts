import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = resolve(ROOT, "skills");
const RUNTIME_BUNDLE = resolve(ROOT, "upstream/aili-workflows-runtime");
const LOCK = resolve(ROOT, "upstream/aili-workflows.lock.json");
const COMPATIBILITY = resolve(ROOT, "manifests/skill-compatibility.json");
const REPOSITORY = "https://github.com/Rosetears520/aili-workflows.git";
const AGENT_SELECTION_PATH = ".agents/skills/parallel-subagent-dispatch/references/agent-selection-matrix.md";
const FORMAL_TASK_BOARD_PATH = ".agents/skills/aili-delivery-flow/references/formal-task-board.md";
const AGENT_SELECTION_PROTOCOL = "aili-agent-selection/v1";
const FORMAL_TASK_BOARD_PROTOCOL = "aili-task-board/v1";

type FileRecord = { path: string; sha256: string; bytes: number };
type ProtocolRecord = { protocol: string; path: string; sha256: string; bytes: number };
interface ReleaseRecord {
  package: "rose-aili";
  version: string;
  npmGitHead: string;
  tarballSha256: string;
  protocols: {
    agentSelection: ProtocolRecord;
    formalTaskBoard: ProtocolRecord;
  };
  canonicalSpecialists: string[];
}
type AnchorRecord = {
  id: string;
  disposition: string;
  occurrences: Array<{ path: string; lines: number[] }>;
};

interface LockFile {
  schemaVersion: 1;
  repository: string;
  commit: string;
  release: ReleaseRecord;
  repositoryTree: string;
  skillTree: string;
  skillRoot: ".agents/skills";
  skillCount: number;
  fileCount: number;
  contentHash: string;
  runtimeBundle: {
    sourceRoot: "generated/pi";
    targetRoot: "upstream/aili-workflows-runtime";
    fileCount: number;
    contentHash: string;
    files: FileRecord[];
  };
  synchronizedAt: string;
  files: FileRecord[];
  skills: Array<{ name: string; sourceHash: string; files: string[] }>;
}

const anchorPatterns = [
  {
    id: "backend.opencode",
    pattern: /\bopencode\b|\.opencode\/|~\/\.config\/opencode\//gi,
    disposition: "retained as current adapter evidence; Pi must map the capability",
  },
  {
    id: "tool.subagent",
    pattern: /\bTask\b|task_id|subagent_type|subagent\.dispatch/gi,
    disposition: "mapped through subagent.dispatch or blocked",
  },
  {
    id: "tool.browser",
    pattern: /playwright_|Playwright MCP|Chrome DevTools MCP|browser\.qa/gi,
    disposition: "mapped through browser.qa or optional",
  },
  {
    id: "tool.symbol-graph",
    pattern: /\bCodeGraph\b|codegraph_|\bGraphify\b/gi,
    disposition: "mapped through repository graph capabilities or optional",
  },
  {
    id: "backend.openspec",
    pattern: /\bOpenSpec\b|openspec\//gi,
    disposition: "retained as an artifact backend contract; no completion authority",
  },
  {
    id: "path.backend-home",
    pattern: /~\/\.agents\/|~\/\.pi\/|\.config\/opencode/gi,
    disposition: "must resolve through the active adapter or remain blocked",
  },
  {
    id: "external.side-effect",
    pattern: /\b(download|install|publish|release|upload|network|credential|secret)\b/gi,
    disposition: "retained behind explicit capability and operation gates",
  },
] as const;

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function posixPath(path: string): string {
  return path.split(sep).join("/");
}

function git(source: string, args: string[]): string {
  return execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
}

async function collectFiles(root: string): Promise<FileRecord[]> {
  const records: FileRecord[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) {
        throw new Error(`symbolic links are not allowed in the skill snapshot: ${absolute}`);
      }
      if (metadata.isDirectory()) {
        await visit(absolute);
      } else if (metadata.isFile()) {
        const content = await readFile(absolute);
        records.push({
          path: posixPath(relative(root, absolute)),
          sha256: sha256(content),
          bytes: content.byteLength,
        });
      }
    }
  }

  await visit(root);
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function aggregateHash(files: FileRecord[]): string {
  return sha256(files.map((file) => `${file.path}\0${file.sha256}\0${file.bytes}\n`).join(""));
}

function skillHash(files: FileRecord[]): string {
  return aggregateHash(files);
}

function parseDescription(markdown: string): string {
  const match = markdown.match(/^---\s*\n[\s\S]*?^description:\s*(.+)$/m);
  return match?.[1]?.trim() ?? "Unverified: frontmatter description was not parsed";
}

function stopOutcomes(markdown: string): string[] {
  return ["complete", "need-user", "need-evidence", "material-delta", "blocked", "Unverified"]
    .filter((outcome) => markdown.includes(outcome));
}

function parseSpecialistRoles(markdown: string): string[] {
  const roles = [...markdown.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((match) => match[1]!);
  if (roles.length === 0 || new Set(roles).size !== roles.length || roles.includes("general") || roles.includes("rose")) {
    throw new Error("agent-selection matrix must contain a non-empty unique canonical specialist inventory without general or rose");
  }
  return roles;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) return false;
    throw error;
  }
}

function textContent(content: Buffer): string | undefined {
  if (content.includes(0)) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return undefined;
  }
}

async function anchorInventory(skillRoot: string, files: FileRecord[]): Promise<AnchorRecord[]> {
  const anchors: AnchorRecord[] = [];
  for (const anchor of anchorPatterns) {
    const occurrences: Array<{ path: string; lines: number[] }> = [];
    for (const file of files) {
      const content = textContent(await readFile(resolve(skillRoot, file.path)));
      if (content === undefined) continue;
      const lines = content.split(/\r?\n/);
      const matchingLines = lines
        .map((line, index) => {
          anchor.pattern.lastIndex = 0;
          return anchor.pattern.test(line) ? index + 1 : undefined;
        })
        .filter((line): line is number => line !== undefined);
      if (matchingLines.length > 0) occurrences.push({ path: file.path, lines: matchingLines });
    }
    if (occurrences.length > 0) {
      anchors.push({ id: anchor.id, disposition: anchor.disposition, occurrences });
    }
  }
  return anchors;
}

interface SyncArgs {
  verify: boolean;
  replaceExisting: boolean;
  source?: string;
  revision?: string;
  version?: string;
  npmGitHead?: string;
  tarballSha256?: string;
}

function argument(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(): SyncArgs {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--verify") return { verify: true, replaceExisting: false };
  const source = argument(args, "--source");
  const revision = argument(args, "--revision");
  const version = argument(args, "--package-version");
  const npmGitHead = argument(args, "--npm-git-head");
  const tarballSha256 = argument(args, "--tarball-sha256");
  if (!source || !revision || !version || !npmGitHead || !tarballSha256) {
    throw new Error(
      "usage: sync-skills.ts --source <aili-workflows-root> --revision <40-char-sha> " +
      "--package-version <version> --npm-git-head <40-char-sha> --tarball-sha256 <sha256> " +
      "[--replace-existing] | --verify",
    );
  }
  return {
    verify: false,
    replaceExisting: args.includes("--replace-existing"),
    source: resolve(source),
    revision,
    version,
    npmGitHead,
    tarballSha256,
  };
}

async function verifyReleaseSnapshot(lock: LockFile): Promise<void> {
  const release = lock.release;
  if (
    release?.package !== "rose-aili" ||
    !/^\d+\.\d+\.\d+$/.test(release.version) ||
    release.npmGitHead !== lock.commit ||
    !/^[0-9a-f]{64}$/.test(release.tarballSha256)
  ) {
    throw new Error("generated skill release identity is incomplete or inconsistent");
  }
  const expectedProtocols = [
    [release.protocols?.agentSelection, AGENT_SELECTION_PROTOCOL, AGENT_SELECTION_PATH],
    [release.protocols?.formalTaskBoard, FORMAL_TASK_BOARD_PROTOCOL, FORMAL_TASK_BOARD_PATH],
  ] as const;
  for (const [record, protocol, sourcePath] of expectedProtocols) {
    if (record?.protocol !== protocol || record.path !== sourcePath || !/^[0-9a-f]{64}$/.test(record.sha256)) {
      throw new Error(`generated skill protocol identity is incomplete: ${protocol}`);
    }
    const snapshotPath = sourcePath.replace(/^\.agents\/skills\//, "");
    const content = await readFile(resolve(SNAPSHOT, snapshotPath));
    if (record.sha256 !== sha256(content) || record.bytes !== content.byteLength || !content.toString("utf8").includes(protocol)) {
      throw new Error(`generated skill protocol drifted: ${protocol}`);
    }
  }
  const matrix = await readFile(
    resolve(SNAPSHOT, AGENT_SELECTION_PATH.replace(/^\.agents\/skills\//, "")),
    "utf8",
  );
  if (JSON.stringify(parseSpecialistRoles(matrix)) !== JSON.stringify(release.canonicalSpecialists)) {
    throw new Error("generated canonical specialist inventory drifted from the agent-selection matrix");
  }
}

async function verifySnapshot(requireRelease = true): Promise<void> {
  const lock = JSON.parse(await readFile(LOCK, "utf8")) as LockFile;
  const compatibility = JSON.parse(await readFile(COMPATIBILITY, "utf8")) as {
    source: { commit: string; contentHash: string; release?: ReleaseRecord };
    records: Array<Record<string, unknown> & { name: string; sourceHash: string }>;
  };
  const files = await collectFiles(SNAPSHOT);
  const actualHash = aggregateHash(files);
  const expectedFiles = JSON.stringify(lock.files);
  const actualFiles = JSON.stringify(files);
  if (actualFiles !== expectedFiles || actualHash !== lock.contentHash) {
    throw new Error("generated skill snapshot drifted from upstream/aili-workflows.lock.json");
  }
  if (compatibility.source.commit !== lock.commit || compatibility.source.contentHash !== lock.contentHash) {
    throw new Error("skill compatibility source does not match the lock");
  }
  if (requireRelease) {
    const runtimeFiles = await collectFiles(RUNTIME_BUNDLE);
    if (lock.runtimeBundle?.sourceRoot !== "generated/pi"
      || lock.runtimeBundle.targetRoot !== "upstream/aili-workflows-runtime"
      || lock.runtimeBundle.fileCount !== runtimeFiles.length
      || JSON.stringify(lock.runtimeBundle.files) !== JSON.stringify(runtimeFiles)
      || lock.runtimeBundle.contentHash !== aggregateHash(runtimeFiles)) {
      throw new Error("generated Pi runtime bundle drifted from upstream/aili-workflows.lock.json");
    }
    await verifyReleaseSnapshot(lock);
    if (JSON.stringify(compatibility.source.release) !== JSON.stringify(lock.release)) {
      throw new Error("skill compatibility release identity does not match the lock");
    }
  }
  const expectedSkills = new Map(lock.skills.map((skill) => [skill.name, skill.sourceHash]));
  const seen = new Set<string>();
  for (const record of compatibility.records) {
    if (seen.has(record.name)) throw new Error(`duplicate compatibility record: ${record.name}`);
    seen.add(record.name);
    if (expectedSkills.get(record.name) !== record.sourceHash) {
      throw new Error(`compatibility source hash mismatch: ${record.name}`);
    }
    for (const field of [
      "sourcePath",
      "requiredCapabilities",
      "backendAnchors",
      "adapterOwner",
      "verification",
      "status",
      "reason",
      "unverified",
    ]) {
      if (!(field in record)) throw new Error(`missing compatibility field ${field}: ${record.name}`);
    }
  }
  const missing = [...expectedSkills.keys()].filter((name) => !seen.has(name));
  const unknown = [...seen].filter((name) => !expectedSkills.has(name));
  if (missing.length || unknown.length) {
    throw new Error(`compatibility coverage mismatch; missing=${missing.join(",")} unknown=${unknown.join(",")}`);
  }
  console.log(`PASS: ${lock.skillCount} skills and ${lock.fileCount} files match ${lock.commit}`);
}

async function releaseRecord(source: string, args: SyncArgs): Promise<ReleaseRecord> {
  if (!args.version || !/^\d+\.\d+\.\d+$/.test(args.version)) throw new Error("package version must be exact semver");
  if (args.npmGitHead !== args.revision) throw new Error("npm gitHead must match the exact source revision");
  if (!args.tarballSha256 || !/^[0-9a-f]{64}$/.test(args.tarballSha256)) {
    throw new Error("tarball SHA-256 must be a lowercase 64-character hash");
  }
  const protocolRecord = async (protocol: string, path: string): Promise<ProtocolRecord> => {
    const content = await readFile(resolve(source, path));
    if (!content.toString("utf8").includes(protocol)) throw new Error(`missing protocol marker ${protocol} at ${path}`);
    return { protocol, path, sha256: sha256(content), bytes: content.byteLength };
  };
  const agentSelection = await protocolRecord(AGENT_SELECTION_PROTOCOL, AGENT_SELECTION_PATH);
  const formalTaskBoard = await protocolRecord(FORMAL_TASK_BOARD_PROTOCOL, FORMAL_TASK_BOARD_PATH);
  const matrix = await readFile(resolve(source, AGENT_SELECTION_PATH), "utf8");
  const canonicalSpecialists = parseSpecialistRoles(matrix);
  const publishedRoleNames = (await readdir(resolve(source, "agents"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "rose.md")
    .map((entry) => entry.name.slice(0, -3))
    .sort((left, right) => left.localeCompare(right));
  if (!(await exists(resolve(source, "agents/rose.md"))) || JSON.stringify([...canonicalSpecialists].sort()) !== JSON.stringify(publishedRoleNames)) {
    throw new Error("published role files do not match the canonical specialist matrix plus rose control-plane role");
  }
  return {
    package: "rose-aili",
    version: args.version,
    npmGitHead: args.npmGitHead!,
    tarballSha256: args.tarballSha256,
    protocols: { agentSelection, formalTaskBoard },
    canonicalSpecialists,
  };
}

async function synchronize(source: string, revision: string, args: SyncArgs): Promise<void> {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("revision must be a lowercase 40-character SHA");
  const head = git(source, ["rev-parse", "HEAD"]);
  const status = git(source, ["status", "--porcelain", "--untracked-files=all"]);
  const repositoryTree = git(source, ["rev-parse", "HEAD^{tree}"]);
  const skillTree = git(source, ["rev-parse", "HEAD:.agents/skills"]);
  const synchronizedAt = git(source, ["show", "-s", "--format=%cI", "HEAD"]);
  const origin = git(source, ["remote", "get-url", "origin"]);
  if (head !== revision) throw new Error(`source HEAD ${head} does not match ${revision}`);
  if (status) throw new Error("source repository is dirty; synchronization refused");
  if (origin.replace(/\.git$/, "") !== REPOSITORY.replace(/\.git$/, "")) {
    throw new Error(`unexpected source origin: ${origin}`);
  }
  const snapshotExists = await exists(SNAPSHOT);
  if (snapshotExists && !args.replaceExisting) {
    throw new Error("skills/ already exists; verify it and use a separately approved --replace-existing operation");
  }
  if (snapshotExists) await verifySnapshot(false);

  const sourceSkillRoot = resolve(source, ".agents/skills");
  const sourceRuntimeBundle = resolve(source, "generated/pi");
  const upstreamCapabilities = JSON.parse(
    await readFile(resolve(source, "manifests/skill-capabilities.json"), "utf8"),
  ) as {
    profiles: Record<string, { requiredCapabilities: string[]; optionalCapabilities: string[] }>;
    assignments: Array<{ profile: string; skills: string[] }>;
  };
  const profileBySkill = new Map<string, string>();
  for (const assignment of upstreamCapabilities.assignments) {
    for (const skill of assignment.skills) {
      if (profileBySkill.has(skill)) throw new Error(`duplicate upstream capability assignment: ${skill}`);
      profileBySkill.set(skill, assignment.profile);
    }
  }

  const files = await collectFiles(sourceSkillRoot);
  const runtimeFiles = await collectFiles(sourceRuntimeBundle);
  const release = await releaseRecord(source, args);
  const skillNames = (await readdir(sourceSkillRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  if (skillNames.length !== profileBySkill.size || skillNames.some((name) => !profileBySkill.has(name))) {
    throw new Error("upstream skill directories and capability assignments are not bijective");
  }

  const skills: LockFile["skills"] = [];
  const records = [];
  for (const name of skillNames) {
    const skillFiles = files
      .filter((file) => file.path === name || file.path.startsWith(`${name}/`))
      .map((file) => ({ ...file, path: file.path.slice(name.length + 1) }));
    const sourceHash = skillHash(skillFiles);
    const profileName = profileBySkill.get(name)!;
    const profile = upstreamCapabilities.profiles[profileName];
    if (!profile) throw new Error(`missing upstream capability profile: ${profileName}`);
    const markdown = await readFile(resolve(sourceSkillRoot, name, "SKILL.md"), "utf8");
    const anchors = await anchorInventory(resolve(sourceSkillRoot, name), skillFiles);
    const optional = ["web-research", "browser-qa", "memory", "artifact-runtime"].includes(profileName);
    skills.push({ name, sourceHash, files: skillFiles.map((file) => file.path) });
    records.push({
      name,
      sourcePath: `.agents/skills/${name}`,
      sourceHash,
      files: skillFiles,
      triggers: {
        description: parseDescription(markdown),
        nearMissDeclared: /do not|don't|near miss|仅当|不要|不负责/i.test(markdown),
        stopOutcomes: stopOutcomes(markdown),
      },
      backendAnchors: anchors,
      requiredCapabilities: profile.requiredCapabilities,
      optionalCapabilities: profile.optionalCapabilities,
      canonicalChange: "none in aili-pi; consume the pinned upstream body without semantic transformation",
      adapterOwner: optional ? `optional-pack:${profileName}` : `planned:aili-pi:${profileName}`,
      verification: ["snapshot-hash:verified", "pi-discovery:pending", "pi-behavior:pending"],
      status: optional ? "optional" : "blocked",
      reason: optional
        ? `The ${profileName} capability is not bundled until its optional provider is verified.`
        : `The required ${profileName} Pi adapter has not yet passed behavior verification.`,
      unverified: ["Pi discovery and behavior evidence are pending later BUILD packages."],
    });
  }

  const lock: LockFile = {
    schemaVersion: 1,
    repository: REPOSITORY,
    commit: revision,
    release,
    repositoryTree,
    skillTree,
    skillRoot: ".agents/skills",
    skillCount: skillNames.length,
    fileCount: files.length,
    contentHash: aggregateHash(files),
    runtimeBundle: {
      sourceRoot: "generated/pi",
      targetRoot: "upstream/aili-workflows-runtime",
      fileCount: runtimeFiles.length,
      contentHash: aggregateHash(runtimeFiles),
      files: runtimeFiles,
    },
    synchronizedAt,
    files,
    skills,
  };
  const compatibility = {
    schemaVersion: 1,
    source: {
      repository: REPOSITORY,
      commit: revision,
      tree: skillTree,
      contentHash: lock.contentHash,
      release,
    },
    allowedStatuses: ["native", "adapted", "optional", "blocked"],
    records,
  };

  const stage = resolve(ROOT, `.tmp/sync-skills-${process.pid}`);
  const stageRuntime = resolve(ROOT, `.tmp/sync-workflow-runtime-${process.pid}`);
  const backup = resolve(ROOT, `.tmp/sync-skills-backup-${process.pid}`);
  const backupRuntime = resolve(ROOT, `.tmp/sync-workflow-runtime-backup-${process.pid}`);
  const lockTemp = `${LOCK}.tmp`;
  const compatibilityTemp = `${COMPATIBILITY}.tmp`;
  await rm(stage, { recursive: true, force: true });
  await rm(stageRuntime, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });
  await rm(backupRuntime, { recursive: true, force: true });
  await rm(lockTemp, { force: true });
  await rm(compatibilityTemp, { force: true });
  await mkdir(dirname(stage), { recursive: true });
  await cp(sourceSkillRoot, stage, { recursive: true, preserveTimestamps: false });
  await cp(sourceRuntimeBundle, stageRuntime, { recursive: true, preserveTimestamps: false });
  await mkdir(dirname(LOCK), { recursive: true });
  await mkdir(dirname(COMPATIBILITY), { recursive: true });
  await writeFile(lockTemp, `${JSON.stringify(lock, null, 2)}\n`, { flag: "wx" });
  await writeFile(compatibilityTemp, `${JSON.stringify(compatibility, null, 2)}\n`, { flag: "wx" });
  const priorLock = await readFile(LOCK).catch(() => undefined);
  const priorCompatibility = await readFile(COMPATIBILITY).catch(() => undefined);
  const runtimeBundleExists = await exists(RUNTIME_BUNDLE);
  try {
    if (snapshotExists) await rename(SNAPSHOT, backup);
    if (runtimeBundleExists) await rename(RUNTIME_BUNDLE, backupRuntime);
    await rename(stage, SNAPSHOT);
    await rename(stageRuntime, RUNTIME_BUNDLE);
    await rename(lockTemp, LOCK);
    await rename(compatibilityTemp, COMPATIBILITY);
    await verifySnapshot();
    await rm(backup, { recursive: true, force: true });
    await rm(backupRuntime, { recursive: true, force: true });
  } catch (error) {
    await rm(SNAPSHOT, { recursive: true, force: true });
    await rm(RUNTIME_BUNDLE, { recursive: true, force: true });
    if (snapshotExists && await exists(backup)) await rename(backup, SNAPSHOT);
    if (runtimeBundleExists && await exists(backupRuntime)) await rename(backupRuntime, RUNTIME_BUNDLE);
    if (priorLock) await writeFile(LOCK, priorLock);
    else await rm(LOCK, { force: true });
    if (priorCompatibility) await writeFile(COMPATIBILITY, priorCompatibility);
    else await rm(COMPATIBILITY, { force: true });
    await rm(stage, { recursive: true, force: true });
    await rm(stageRuntime, { recursive: true, force: true });
    await rm(lockTemp, { force: true });
    await rm(compatibilityTemp, { force: true });
    throw error;
  }
}

const args = parseArgs();
if (args.verify) {
  await verifySnapshot();
} else {
  await synchronize(args.source!, args.revision!, args);
}
