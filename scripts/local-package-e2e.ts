import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = resolve(import.meta.dirname, "..");
const requested = process.argv[2];
const expected = requested === "linux" ? "linux" : undefined;
if (!expected) throw new Error("Usage: local-package-e2e.ts linux");
if (process.platform !== expected) throw new Error(`native ${expected} evidence unavailable on ${process.platform}`);

const scratchParent = join(ROOT, ".tmp", "p8-local-e2e");
await mkdir(scratchParent, { recursive: true });
const scratch = await mkdtemp(join(scratchParent, `run-${expected}-`));
const home = join(scratch, "home");
const pack = join(scratch, "pack");
const extracted = join(scratch, "extracted");
await Promise.all([mkdir(home), mkdir(pack), mkdir(extracted)]);
const keep = join(home, "unrelated-state.txt");
await writeFile(keep, "preserve-me\n", { mode: 0o600 });

const run = async (command: string, args: string[], environment: NodeJS.ProcessEnv = process.env) => {
  const result = await execFile(command, args, { cwd: ROOT, env: environment, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024 });
  return `${result.stdout}${result.stderr}`;
};
const packResult = JSON.parse(await run("npm", ["pack", "--pack-destination", pack, "--json"])) as Array<{ filename: string }>;
const tarball = join(pack, packResult[0]!.filename);
await run("tar", ["-xzf", tarball, "-C", extracted]);
const packageRoot = join(extracted, "package");
const nodeBin = dirname(process.execPath);
const environment: NodeJS.ProcessEnv = {
  HOME: home,
  PATH: `${join(ROOT, "node_modules", ".bin")}:${nodeBin}:/usr/bin:/bin`,
  npm_config_offline: "true",
  npm_config_cache: join(scratch, "npm-cache"),
};
const pi = join(ROOT, "node_modules", ".bin", "pi");

await run(pi, ["install", packageRoot], environment);
const installed = await run(pi, ["list"], environment);
if (!installed.includes(packageRoot)) throw new Error("Pi list did not report the installed local Package");
const smoke = await run(pi, ["--list-models"], environment);
if (smoke.includes("Failed to load extension")) throw new Error("installed Package failed Extension loading");
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { pi?: { extensions?: string[]; prompts?: string[]; skills?: string[] } };
if (packageJson.pi?.extensions?.length !== 4 || packageJson.pi?.prompts?.length !== 5 || packageJson.pi?.skills?.length !== 1 || packageJson.pi.skills[0] !== "./node_modules/pi-web-access/skills") throw new Error("packed resource declarations are incomplete");
await run(pi, ["remove", packageRoot], environment);
const removed = await run(pi, ["list"], environment);
if (!removed.includes("No packages installed")) throw new Error("Pi Package removal did not reconcile settings");
if (await readFile(keep, "utf8") !== "preserve-me\n") throw new Error("unrelated disposable-home state changed");
console.log(`Native ${expected} local Package E2E passed; evidence retained at ${scratch}`);
