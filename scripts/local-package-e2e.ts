import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = resolve(import.meta.dirname, "..");
const PACKAGE_NAME = "@rosetears/aili-pi";
const INITIAL_VERSION = "0.1.12";
const CURRENT_VERSION = "0.2.2";
const SOURCE = `npm:${PACKAGE_NAME}`;
const requested = process.argv[2];
const expected = requested === "linux" ? "linux" : undefined;
if (!expected) throw new Error("Usage: local-package-e2e.ts linux");
if (process.platform !== expected) throw new Error(`native ${expected} evidence unavailable on ${process.platform}`);

type PackResult = Array<{ filename: string; files?: Array<{ path: string }> }>;
type PiManifest = {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  pi?: { extensions?: string[]; prompts?: string[]; skills?: string[]; themes?: string[] };
};
type InventoryEntry = { path: string; kind: "directory" | "file"; size?: number; sha256?: string; bytes?: string };
type WrapperLog = { kind: "view" | "install" | "install-result" | "uninstall" | "uninstall-result"; ordinal?: number; args: string[]; status?: number; stdout?: string; stderr?: string };

const scratchParent = join(ROOT, ".tmp", "p8-local-e2e");
await mkdir(scratchParent, { recursive: true });
const scratch = await mkdtemp(join(scratchParent, `run-${expected}-`));
const home = join(scratch, "home");
const pack = join(scratch, "pack");
const extracted = join(scratch, "extracted");
const initialSource = join(scratch, "initial-source");
const fixtureTarballs = join(scratch, "fixture-tarballs");
const npmCache = join(scratch, "npm-cache");
const dependencySeed = join(scratch, "dependency-seed", "node_modules");
const bin = join(scratch, "bin");
await Promise.all([
  mkdir(home),
  mkdir(pack),
  mkdir(extracted),
  mkdir(initialSource),
  mkdir(fixtureTarballs),
  mkdir(npmCache),
  mkdir(dependencySeed, { recursive: true }),
  mkdir(bin),
]);
const keep = join(home, "unrelated-state.txt");
await writeFile(keep, "preserve-me\n", { mode: 0o600 });

const run = async (command: string, args: string[], environment: NodeJS.ProcessEnv = process.env) => {
  const result = await execFile(command, args, {
    cwd: ROOT,
    env: environment,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return `${result.stdout}${result.stderr}`;
};

const realNpm = await resolveExecutable("npm", process.env.PATH);
const packEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  HOME: home,
  npm_config_cache: npmCache,
  npm_config_offline: "true",
  npm_config_ignore_scripts: "true",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
};
const packResult = JSON.parse(await run(realNpm, [
  "pack",
  "--pack-destination",
  pack,
  "--json",
  "--ignore-scripts",
  "--offline",
  `--cache=${npmCache}`,
], packEnvironment)) as PackResult;
if (packResult.length !== 1 || !packResult[0]?.filename) throw new Error("npm pack did not produce exactly one candidate");
const updateTarball = join(pack, packResult[0].filename);
await run("tar", ["-xzf", updateTarball, "-C", extracted], packEnvironment);
const packageRoot = join(extracted, "package");
const packedManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as PiManifest;
if (packedManifest.name !== PACKAGE_NAME || packedManifest.version !== CURRENT_VERSION) {
  throw new Error(`packed candidate identity mismatch: ${packedManifest.name}@${packedManifest.version}`);
}
assertPackedInventory(packResult[0].files ?? [], packedManifest);
const dependencySpecs = await seedInstalledDependencies(packedManifest.dependencies ?? {}, dependencySeed);

const rootLock = JSON.parse(await readFile(join(ROOT, "package-lock.json"), "utf8")) as { packages?: Record<string, Record<string, unknown>> };
if (Object.hasOwn(rootLock.packages?.[""] ?? {}, "hasInstallScript")) {
  throw new Error("root package-lock reports hasInstallScript");
}

const initialPackageRoot = join(initialSource, "package");
await cp(packageRoot, initialPackageRoot, { recursive: true, force: false });
const initialManifestPath = join(initialPackageRoot, "package.json");
const initialManifestSource = await readFile(initialManifestPath, "utf8");
const currentVersionField = `"version": "${CURRENT_VERSION}"`;
if (initialManifestSource.split(currentVersionField).length !== 2) {
  throw new Error("packed candidate package.json did not contain one exact current version field");
}
await writeFile(initialManifestPath, initialManifestSource.replace(currentVersionField, `"version": "${INITIAL_VERSION}"`));
const initialTarball = join(fixtureTarballs, `rosetears-aili-pi-${INITIAL_VERSION}.tgz`);
await run("tar", [
  "--sort=name",
  "--mtime=@0",
  "--owner=0",
  "--group=0",
  "--numeric-owner",
  "-czf",
  initialTarball,
  "-C",
  initialSource,
  "package",
], packEnvironment);

const sharedSkills = join(home, ".agents", "skills");
await Promise.all([
  mkdir(join(sharedSkills, "aili-delivery-flow", "references"), { recursive: true }),
  mkdir(join(sharedSkills, "user-only"), { recursive: true }),
]);
await Promise.all([
  writeFile(join(sharedSkills, "aili-delivery-flow", "SKILL.md"), "canonical-workflow-fixture\n", { mode: 0o600 }),
  writeFile(join(sharedSkills, "aili-delivery-flow", "references", "contract.md"), Buffer.from([0, 1, 2, 10, 255]), { mode: 0o600 }),
  writeFile(join(sharedSkills, "user-only", "SKILL.md"), "user-only-fixture\n", { mode: 0o600 }),
]);
const sharedBaseline = await inventory(sharedSkills);
const sharedTreeHash = createHash("sha256").update(JSON.stringify(sharedBaseline)).digest("hex");

const wrapperLog = join(scratch, "npm-wrapper.ndjson");
const installOrdinal = join(scratch, "npm-install-ordinal.txt");
const childLog = join(scratch, "implicit-shared-workflow-child.ndjson");
const npmWrapper = join(bin, "npm-wrapper");
await writeFile(npmWrapper, npmWrapperSource({
  realNpm,
  packageName: PACKAGE_NAME,
  initialTarball,
  updateTarball,
  cache: npmCache,
  dependencySeed,
  dependencySpecs,
  log: wrapperLog,
  ordinal: installOrdinal,
}), { mode: 0o700 });
await chmod(npmWrapper, 0o700);
for (const name of ["npx", "rose-aili"]) {
  const guard = join(bin, name);
  await writeFile(guard, failChildSource(name, childLog), { mode: 0o700 });
  await chmod(guard, 0o700);
}

const settingsDirectory = join(home, ".pi", "agent");
await mkdir(settingsDirectory, { recursive: true });
const settingsPath = join(settingsDirectory, "settings.json");
await writeFile(settingsPath, `${JSON.stringify({ npmCommand: [npmWrapper] }, null, 2)}\n`, { mode: 0o600 });
const nodeBin = dirname(process.execPath);
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  HOME: home,
  PATH: `${bin}:${join(ROOT, "node_modules", ".bin")}:${nodeBin}:/usr/bin:/bin`,
  npm_config_offline: "true",
  npm_config_ignore_scripts: "true",
  npm_config_cache: npmCache,
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
  NO_COLOR: "1",
};
delete environment.PI_OFFLINE;
const pi = join(ROOT, "node_modules", ".bin", "pi");
const managedPackage = join(home, ".pi", "agent", "npm", "node_modules", "@rosetears", "aili-pi");

await run(pi, ["install", SOURCE], environment);
await assertVersion(managedPackage, INITIAL_VERSION, "install");
await assertSettingsSource(settingsPath, true);
await assertSharedTree("install", sharedSkills, sharedBaseline);
const installed = await run(pi, ["list"], environment);
if (!installed.includes(SOURCE) || !installed.includes(managedPackage)) {
  throw new Error("Pi list did not report the managed npm Package source/path");
}
const smoke = await run(pi, ["--list-models"], environment);
if (smoke.includes("Failed to load extension")) throw new Error("installed Package failed Extension loading");
await assertInstalledPiResources(managedPackage, packedManifest);

await run(pi, ["update", SOURCE], environment);
await assertVersion(managedPackage, CURRENT_VERSION, "update");
await assertSettingsSource(settingsPath, true);
await assertSharedTree("update", sharedSkills, sharedBaseline);
const updateLog = await readWrapperLog(wrapperLog);
if (!updateLog.some((entry) => entry.kind === "view" && entry.args.join(" ") === `view ${PACKAGE_NAME} version --json`)) {
  throw new Error("Pi update did not issue the expected npm view candidate query");
}
if (!updateLog.some((entry) => entry.kind === "install" && entry.ordinal === 2)) {
  throw new Error("Pi update did not issue a second real npm install");
}

await run(pi, ["remove", SOURCE], environment);
await assertSettingsSource(settingsPath, false);
await assertAbsent(managedPackage, "managed Package remained after remove");
await assertSharedTree("remove", sharedSkills, sharedBaseline);
const removed = await run(pi, ["list"], environment);
if (!removed.includes("No packages installed")) throw new Error("Pi Package removal did not reconcile settings");
const finalLog = await readWrapperLog(wrapperLog);
if (!finalLog.some((entry) => entry.kind === "uninstall")) throw new Error("Pi remove did not issue real npm uninstall");
if (await readFile(keep, "utf8") !== "preserve-me\n") throw new Error("unrelated disposable-home state changed");
await assertNoImplicitChild(childLog);

const summary = finalLog
  .filter((entry) => entry.kind === "view" || entry.kind === "install" || entry.kind === "uninstall")
  .map((entry) => `${entry.kind}${entry.ordinal ? `#${entry.ordinal}` : ""}`)
  .join(",");
console.log([
  `Native ${expected} npm-source Package E2E passed`,
  `commands=pi install ${SOURCE}; pi update ${SOURCE}; pi remove ${SOURCE}`,
  `versions=${INITIAL_VERSION}->${CURRENT_VERSION}->removed`,
  `wrapper=${summary}`,
  `shared_tree_sha256=${sharedTreeHash}`,
  `evidence=${scratch}`,
].join("; "));

function assertPackedInventory(files: Array<{ path: string }>, manifest: PiManifest): void {
  const inventoryPaths = files.map(({ path }) => path.replace(/^package\//, ""));
  if (inventoryPaths.some((path) => path === "skills" || path.startsWith("skills/"))) {
    throw new Error("packed candidate contains generic skills/**");
  }
  for (const retired of ["scripts/sync-global-skills.mjs", "scripts/sync-global-skills.d.mts"]) {
    if (inventoryPaths.includes(retired)) throw new Error(`packed candidate contains retired ${retired}`);
  }
  if (manifest.scripts?.postinstall) throw new Error("packed candidate declares postinstall");
  for (const required of [
    "extensions/index.ts",
    "upstream/aili-workflows-runtime/system.md",
    "upstream/aili-workflows-runtime/role-metadata.json",
    "upstream/aili-workflows-runtime/selection-map.json",
  ]) {
    if (!inventoryPaths.includes(required)) throw new Error(`packed candidate omits required Pi resource ${required}`);
  }
  for (const excluded of ["prompts/", "upstream/aili-workflows-runtime/AGENTS.md", "upstream/aili-workflows-runtime/prompts/"]) {
    if (inventoryPaths.some((path) => path === excluded.replace(/\/$/, "") || path.startsWith(excluded))) {
      throw new Error(`packed candidate contains Workflow resource owned by rose-aili: ${excluded}`);
    }
  }
  if (manifest.pi?.prompts !== undefined) throw new Error("packed candidate duplicates rose-aili Workflow prompts");
  if (manifest.pi?.skills?.length !== 1 || manifest.pi.skills[0] !== "./node_modules/pi-web-access/skills") {
    throw new Error("packed candidate Pi skill declaration is not the required bundled resource");
  }
}

async function assertInstalledPiResources(root: string, manifest: PiManifest): Promise<void> {
  const packageResources = [
    ...(manifest.pi?.extensions ?? []),
    ...(manifest.pi?.prompts ?? []),
    ...(manifest.pi?.themes ?? []),
  ];
  for (const resource of packageResources) await access(resolve(root, resource));
  const managedNodeModules = dirname(dirname(root));
  for (const resource of manifest.pi?.skills ?? []) {
    const dependencyRelative = resource.replace(/^\.\/node_modules\//, "");
    await access(join(managedNodeModules, dependencyRelative));
  }
}

async function assertVersion(root: string, version: string, stage: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PiManifest;
  if (manifest.name !== PACKAGE_NAME || manifest.version !== version) {
    throw new Error(`${stage} managed Package identity mismatch: ${manifest.name}@${manifest.version}`);
  }
}

async function assertSettingsSource(path: string, present: boolean): Promise<void> {
  const settings = JSON.parse(await readFile(path, "utf8")) as { packages?: unknown[]; npmCommand?: string[] };
  const packages = settings.packages ?? [];
  if (packages.includes(SOURCE) !== present) throw new Error(`Pi settings source presence=${!present}, expected=${present}`);
  if (settings.npmCommand?.length !== 1 || !settings.npmCommand[0]?.endsWith("/npm-wrapper")) {
    throw new Error("Pi changed the configured task-owned npmCommand seam");
  }
}

async function assertSharedTree(stage: string, root: string, baseline: InventoryEntry[]): Promise<void> {
  const actual = await inventory(root);
  if (JSON.stringify(actual) !== JSON.stringify(baseline)) {
    throw new Error(`${stage} changed the shared workflow tree or added an entry`);
  }
}

async function inventory(root: string): Promise<InventoryEntry[]> {
  const entries: InventoryEntry[] = [];
  const visit = async (directory: string): Promise<void> => {
    const children = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolute = join(directory, child.name);
      const path = relative(root, absolute).split("\\").join("/");
      if (child.isDirectory()) {
        entries.push({ path, kind: "directory" });
        await visit(absolute);
      } else if (child.isFile()) {
        const bytes = await readFile(absolute);
        entries.push({
          path,
          kind: "file",
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          bytes: bytes.toString("base64"),
        });
      } else {
        throw new Error(`shared workflow fixture contains unsupported entry: ${path}`);
      }
    }
  };
  await visit(root);
  return entries;
}

async function assertAbsent(path: string, message: string): Promise<void> {
  try {
    await stat(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(message);
}

async function assertNoImplicitChild(path: string): Promise<void> {
  try {
    const contents = await readFile(path, "utf8");
    if (contents.length > 0) throw new Error(`implicit shared-workflow child invoked: ${contents.slice(0, 512)}`);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

async function readWrapperLog(path: string): Promise<WrapperLog[]> {
  const source = await readFile(path, "utf8");
  const lines = source.trim().split("\n").filter(Boolean);
  if (lines.length > 16) throw new Error(`npm wrapper log exceeded bound: ${lines.length}`);
  return lines.map((line) => JSON.parse(line) as WrapperLog);
}

async function resolveExecutable(name: string, pathValue: string | undefined): Promise<string> {
  for (const directory of (pathValue ?? "").split(":")) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return resolve(candidate);
    } catch { }
  }
  throw new Error(`unable to resolve executable: ${name}`);
}

async function seedInstalledDependencies(dependencies: Record<string, string>, destination: string): Promise<string[]> {
  const visited = new Set<string>();
  const versions = new Map<string, string>();
  const targets = new Set<string>();
  const visit = async (name: string, fromRoot: string, optional: boolean): Promise<void> => {
    const source = await resolveInstalledPackage(name, fromRoot);
    if (!source) {
      if (optional) return;
      throw new Error(`repository-local dependency seed is missing ${name} required by ${fromRoot}`);
    }
    if (visited.has(source)) return;
    visited.add(source);
    const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8")) as {
      name?: string;
      version?: string;
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    if (manifest.name !== name || !manifest.version) throw new Error(`invalid installed dependency identity at ${source}`);
    const prior = versions.get(name);
    if (prior && prior !== manifest.version) {
      throw new Error(`dependency seed requires conflicting ${name} versions: ${prior}, ${manifest.version}`);
    }
    versions.set(name, manifest.version);
    const target = join(destination, ...name.split("/"));
    targets.add(target);
    await mkdir(dirname(target), { recursive: true });
    try {
      await access(target);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
      await cp(source, target, { recursive: true, force: false });
    }
    for (const childName of Object.keys(manifest.dependencies ?? {}).sort()) await visit(childName, source, false);
    for (const childName of Object.keys(manifest.optionalDependencies ?? {}).sort()) await visit(childName, source, true);
  };
  for (const name of Object.keys(dependencies).sort()) await visit(name, ROOT, false);
  return [...targets].sort();
}

async function resolveInstalledPackage(name: string, fromRoot: string): Promise<string | undefined> {
  let current = fromRoot;
  while (true) {
    const candidate = join(current, "node_modules", ...name.split("/"));
    try {
      await access(join(candidate, "package.json"));
      return candidate;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (current === ROOT) return undefined;
    const parent = dirname(current);
    if (parent === current || !parent.startsWith(ROOT)) return undefined;
    current = parent;
  }
}

function npmWrapperSource(config: {
  realNpm: string;
  packageName: string;
  initialTarball: string;
  updateTarball: string;
  cache: string;
  dependencySeed: string;
  dependencySpecs: string[];
  log: string;
  ordinal: string;
}): string {
  return `#!/usr/bin/env node
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const config = ${JSON.stringify(config)};
const args = process.argv.slice(2);
const bounded = (value) => String(value ?? "").slice(0, 1000);
const record = (entry) => {
  const count = existsSync(config.log) ? readFileSync(config.log, "utf8").split("\\n").filter(Boolean).length : 0;
  if (count >= 16) throw new Error("npm wrapper log entry bound exceeded");
  appendFileSync(config.log, JSON.stringify({ ...entry, args: (entry.args ?? []).slice(0, 32).map((arg) => bounded(arg).slice(0, 240)) }) + "\\n", { mode: 0o600 });
};
if (args[0] === "view") {
  record({ kind: "view", args });
  if (args.length !== 4 || args[1] !== config.packageName || args[2] !== "version" || args[3] !== "--json") {
    throw new Error("unexpected npm view argv: " + JSON.stringify(args));
  }
  process.stdout.write(JSON.stringify("${CURRENT_VERSION}") + "\\n");
  process.exit(0);
}
const runRealNpm = (kind, invocationArgs, ordinal) => {
  record({ kind, ...(ordinal ? { ordinal } : {}), args: invocationArgs });
  let npmArgs = invocationArgs;
  if (kind === "install") {
    const prefixIndex = invocationArgs.indexOf("--prefix");
    const prefix = prefixIndex >= 0 ? invocationArgs[prefixIndex + 1] : undefined;
    if (!prefix) throw new Error("npm install lacked expected --prefix argv");
    const target = join(prefix, "node_modules");
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(config.dependencySeed)) {
      cpSync(join(config.dependencySeed, entry), join(target, entry), { recursive: true, force: false, errorOnExist: false });
    }
    const optionIndex = invocationArgs.findIndex((arg, index) => index > 0 && arg.startsWith("-"));
    const insertionIndex = optionIndex === -1 ? invocationArgs.length : optionIndex;
    npmArgs = [...invocationArgs.slice(0, insertionIndex), ...config.dependencySpecs, ...invocationArgs.slice(insertionIndex), "--install-links=true"];
  }
  const forced = [...npmArgs, "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--update-notifier=false", "--cache=" + config.cache];
  const result = spawnSync(config.realNpm, forced, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      npm_config_offline: "true",
      npm_config_ignore_scripts: "true",
      npm_config_cache: config.cache,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
    },
  });
  record({ kind: kind + "-result", ...(ordinal ? { ordinal } : {}), args: [], status: result.status ?? 1, stdout: bounded(result.stdout), stderr: bounded(result.stderr ?? result.error?.message) });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
};
if (args[0] === "install") {
  const ordinal = existsSync(config.ordinal) ? Number(readFileSync(config.ordinal, "utf8")) + 1 : 1;
  writeFileSync(config.ordinal, String(ordinal), { mode: 0o600 });
  const tarball = ordinal === 1 ? config.initialTarball : config.updateTarball;
  let replaced = false;
  const invocationArgs = args.map((arg) => {
    if (arg === config.packageName || arg === config.packageName + "@latest") {
      replaced = true;
      return tarball;
    }
    return arg;
  });
  if (!replaced) throw new Error("npm install lacked expected Package spec: " + JSON.stringify(args));
  runRealNpm("install", invocationArgs, ordinal);
}
if (args[0] === "uninstall") runRealNpm("uninstall", args);
throw new Error("unexpected configured npm argv: " + JSON.stringify(args));
`;
}

function failChildSource(command: string, log: string): string {
  return `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ command: ${JSON.stringify(command)}, args: process.argv.slice(2, 18) }) + "\\n", { mode: 0o600 });
process.stderr.write("forbidden implicit shared-workflow child: ${command}\\n");
process.exit(97);
`;
}
