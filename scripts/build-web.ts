import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

export const WEB_SOURCE_ROOT = "src/web";
export const WEB_OUTPUT_ROOT = "dist/web";
export const PI_WEB_SOURCE_LOCK = "upstream/web-source-locks.json";

export const LOCKED_WEB_RUNTIME_DEPENDENCIES = Object.freeze({
  next: "16.2.12",
  react: "19.2.4",
  "react-dom": "19.2.4",
  "js-yaml": "5.2.3",
  "proper-lockfile": "4.1.2",
  "remark-frontmatter": "5.0.0",
  undici: "8.5.0",
});

export const LOCKED_PI_DEVELOPMENT_PACKAGES = Object.freeze({
  "@earendil-works/pi-agent-core": "0.84.1",
  "@earendil-works/pi-ai": "0.84.1",
  "@earendil-works/pi-coding-agent": "0.84.1",
  "@earendil-works/pi-tui": "0.84.1",
});

/** Exact versions resolved by the imported Pi Web 0.8.8 source lock for its UI build. */
export const LOCKED_WEB_UI_BUILD_DEPENDENCIES = Object.freeze({
  "@lobehub/icons": "5.6.0",
  "@tailwindcss/postcss": "4.2.2",
  "@types/js-yaml": "4.0.9",
  "@types/proper-lockfile": "4.1.4",
  "@types/react": "19.2.14",
  "@types/react-dom": "19.2.3",
  "@types/react-syntax-highlighter": "15.5.13",
  katex: "0.16.47",
  mammoth: "1.12.0",
  mermaid: "11.14.0",
  postcss: "8.5.8",
  "react-markdown": "10.1.0",
  "react-syntax-highlighter": "16.1.1",
  "rehype-katex": "7.0.1",
  "rehype-raw": "7.0.0",
  "rehype-sanitize": "6.0.0",
  "remark-gfm": "4.0.1",
  "remark-math": "6.0.0",
  tailwindcss: "4.2.2",
});

const ABSORBED_PACKAGES = ["@agegr/pi-web", "@narumitw/pi-analytics", "@narumitw/pi-stamp", "@narumitw/pi-btw", "@narumitw/pi-worktree"] as const;
const REQUIRED_PACKAGE_EXCLUSIONS = ["!src/web/", "!upstream/pi-web-0.8.8/", "!upstream/pi-extensions/"] as const;

export interface WebBuildManifestV1 {
  readonly schemaVersion: 1;
  readonly source: "upstream/pi-web-0.8.8";
  readonly sourceRevision: "5a53c18ca9328400a3dfb8c48c1e4f343b3e4903";
  readonly piVersion: "0.84.1";
  readonly sourceDigest: string;
  readonly files: readonly string[];
}

export async function assertLockedWebDependencies(root = process.cwd()): Promise<void> {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    engines?: { node?: string };
    bin?: Record<string, string>;
    files?: string[];
    pi?: { extensions?: string[] };
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8")) as {
    lockfileVersion?: number;
    packages?: Record<string, { version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; peerDependencies?: Record<string, string> }>;
  };
  const sourceLock = JSON.parse(await readFile(join(root, PI_WEB_SOURCE_LOCK), "utf8")) as {
    sources?: Array<{ id?: string; version?: string; gitRevision?: string }>;
  };
  const piWebSource = sourceLock.sources?.find((source) => source.id === "pi-web");
  if (piWebSource?.version !== "0.8.8" || piWebSource.gitRevision !== "5a53c18ca9328400a3dfb8c48c1e4f343b3e4903") {
    throw new Error("locked Pi Web source identity mismatch");
  }
  const dependencies = manifest.dependencies ?? {};
  for (const [name, version] of Object.entries(LOCKED_WEB_RUNTIME_DEPENDENCIES)) {
    if (dependencies[name] !== version) throw new Error(`locked Pi Web dependency mismatch: ${name}@${dependencies[name] ?? "missing"}`);
  }
  for (const [name, version] of Object.entries(LOCKED_PI_DEVELOPMENT_PACKAGES)) {
    if (manifest.devDependencies?.[name] !== version) throw new Error(`official Pi development package mismatch: ${name}`);
  }
  for (const [name, version] of Object.entries(LOCKED_WEB_UI_BUILD_DEPENDENCIES)) {
    if (manifest.devDependencies?.[name] !== version) throw new Error(`locked Pi Web UI build dependency mismatch: ${name}`);
  }
  if (manifest.engines?.node !== ">=22.19.0") throw new Error("Pi Web Node.js compatibility manifest mismatch");
  if (manifest.peerDependencies?.["@earendil-works/pi-coding-agent"] !== "*" || manifest.peerDependencies?.typebox !== "*") {
    throw new Error("Pi Package host peer wildcard exception mismatch");
  }
  if (manifest.bin?.["pi-web"] !== "./bin/pi-web.js") throw new Error("packaged pi-web executable declaration mismatch");
  if (manifest.pi?.extensions?.length !== 1 || manifest.pi.extensions[0] !== "./extensions/index.ts") {
    throw new Error("Pi package must retain exactly one Extension entry");
  }
  if (!manifest.files?.includes("dist/web/") || REQUIRED_PACKAGE_EXCLUSIONS.some((entry) => !manifest.files?.includes(entry))) {
    throw new Error("Pi Web package inclusion/exclusion rules are incomplete");
  }
  for (const name of ABSORBED_PACKAGES) {
    if (dependencies[name] !== undefined || manifest.devDependencies?.[name] !== undefined || manifest.peerDependencies?.[name] !== undefined) {
      throw new Error(`absorbed/reference package must not be installed: ${name}`);
    }
  }

  const lockPackages = lock.packages;
  if (lock.lockfileVersion !== 3 || !lockPackages?.[""]) throw new Error("npm package lock is missing or incompatible");
  const lockRoot = lockPackages[""]!;
  for (const [name, version] of Object.entries(LOCKED_WEB_RUNTIME_DEPENDENCIES)) {
    if (lockRoot.dependencies?.[name] !== version || lockPackages[`node_modules/${name}`]?.version !== version) {
      throw new Error(`resolved locked Pi Web dependency mismatch: ${name}`);
    }
  }
  for (const [name, version] of Object.entries(LOCKED_PI_DEVELOPMENT_PACKAGES)) {
    if (lockRoot.devDependencies?.[name] !== version || lockPackages[`node_modules/${name}`]?.version !== version) {
      throw new Error(`resolved official Pi package mismatch: ${name}`);
    }
    for (const [path, record] of Object.entries(lockPackages)) {
      if ((path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)) && record.version !== version) {
        throw new Error(`duplicate official Pi package version mismatch: ${name}@${record.version ?? "missing"}`);
      }
    }
  }
  for (const [name, version] of Object.entries(LOCKED_WEB_UI_BUILD_DEPENDENCIES)) {
    if (lockRoot.devDependencies?.[name] !== version || lockPackages[`node_modules/${name}`]?.version !== version) {
      throw new Error(`resolved locked Pi Web UI build dependency mismatch: ${name}`);
    }
  }
  if (lockRoot.peerDependencies?.["@earendil-works/pi-coding-agent"] !== "*" || lockRoot.peerDependencies?.typebox !== "*") {
    throw new Error("locked Pi Package host peer wildcard exception mismatch");
  }
}

export async function createWebBuildManifest(root = process.cwd()): Promise<WebBuildManifestV1> {
  await assertLockedWebDependencies(root);
  const sourceRoot = join(root, WEB_SOURCE_ROOT);
  let sourceInfo: Awaited<ReturnType<typeof stat>>;
  try { sourceInfo = await stat(sourceRoot); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("AILI-owned Pi Web source boundary is missing");
    throw error;
  }
  if (!sourceInfo.isDirectory()) throw new Error("AILI-owned Pi Web source boundary is not a directory");
  const files = await sortedFiles(sourceRoot);
  if (files.length === 0) throw new Error("AILI-owned Pi Web source boundary is empty");
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file).update("\0").update(await readFile(join(sourceRoot, file))).update("\0");
  }
  return Object.freeze({
    schemaVersion: 1,
    source: "upstream/pi-web-0.8.8",
    sourceRevision: "5a53c18ca9328400a3dfb8c48c1e4f343b3e4903",
    piVersion: "0.84.1",
    sourceDigest: digest.digest("hex"),
    files,
  });
}

/** Builds only the AILI-owned boundary and stages only its declared output. */
export async function buildWeb(root = process.cwd()): Promise<WebBuildManifestV1> {
  const manifest = await createWebBuildManifest(root);
  await assertExecutable(join(root, "bin", "pi-web.js"));
  const sourceRoot = join(root, WEB_SOURCE_ROOT);
  const outputRoot = join(root, WEB_OUTPUT_ROOT);
  await runNextBuild(root, sourceRoot);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true, mode: 0o755 });
  await cp(join(sourceRoot, ".next"), join(outputRoot, ".next"), { recursive: true, force: true, dereference: false });
  try {
    await cp(join(sourceRoot, "public"), join(outputRoot, "public"), { recursive: true, force: true, dereference: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rm(join(outputRoot, ".next", "cache"), { recursive: true, force: true });
  await rm(join(outputRoot, ".next", "dev"), { recursive: true, force: true });
  await writeFile(join(outputRoot, "build-manifest.json"), `${JSON.stringify(manifest)}\n`, { encoding: "utf8", mode: 0o644 });
  await normalizeStagedTree(outputRoot);
  return manifest;
}

async function assertExecutable(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o111) === 0) throw new Error("packaged pi-web executable is missing or not executable");
}

async function runNextBuild(root: string, sourceRoot: string): Promise<void> {
  const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
  await stat(nextCli);
  await new Promise<void>((resolveBuild, rejectBuild) => {
    const child = spawn(process.execPath, [nextCli, "build", "--webpack", sourceRoot], {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env: {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        LANG: "C",
        LC_ALL: "C",
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        TZ: "UTC",
      },
    });
    child.once("error", rejectBuild);
    child.once("exit", (code, signal) => code === 0 ? resolveBuild() : rejectBuild(new Error(`Pi Web build failed: code=${code ?? "null"}; signal=${signal ?? "none"}`)));
  });
}

async function sortedFiles(root: string, base = root): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries.sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)))) {
    if (entry.name === ".next" || entry.name === "node_modules") continue;
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Pi Web source contains an unsupported symbolic link: ${relative(base, path)}`);
    if (entry.isDirectory()) output.push(...await sortedFiles(path, base));
    else if (entry.isFile()) output.push(relative(base, path));
    else throw new Error(`Pi Web source contains an unsupported file type: ${relative(base, path)}`);
  }
  return output;
}

async function normalizeStagedTree(root: string): Promise<void> {
  const info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Pi Web staged output root is unsafe");
  await chmod(root, 0o755);
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)))) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Pi Web staged output contains a symbolic link: ${relative(root, path)}`);
    if (entry.isDirectory()) await normalizeStagedTree(path);
    else if (entry.isFile()) {
      if (entry.name.endsWith(".map")) await rm(path, { force: true });
      else await chmod(path, 0o644);
    } else throw new Error("Pi Web staged output contains an unsupported file type");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  buildWeb().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
