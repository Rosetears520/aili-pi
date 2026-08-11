#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE_PASTE_ACTION = "app.clipboard.pasteImage";
const IMAGE_PASTE_BINDINGS = ["ctrl+v", "alt+v"];
const DEFAULT_OPERATIONS = { access, lstat, mkdir, open, readFile, realpath, rename, unlink };

function isMissing(error) {
  return error?.code === "ENOENT";
}

function parseMode(args) {
  if (args.length === 0) return "apply";
  if (args.length === 1 && args[0] === "--check") return "check";
  throw new Error("usage: merge-global-keybindings.mjs [--check]");
}

async function detectWsl(environment, platform, operations) {
  if (platform !== "linux") return false;
  if (environment.WSL_INTEROP?.trim() || environment.WSL_DISTRO_NAME?.trim()) return true;

  for (const path of ["/proc/sys/kernel/osrelease", "/proc/version"]) {
    try {
      if (/microsoft|wsl/i.test(await operations.readFile(path, "utf8"))) return true;
    } catch {
      // A missing or unreadable proc signal is not proof that this is WSL.
    }
  }
  return false;
}

function assertSafeDirectory(path, info) {
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`unsafe keybindings parent: ${path} must be a real directory`);
  }
}

async function inspectParents(homePath, operations, createMissing) {
  let homeInfo;
  try {
    homeInfo = await operations.lstat(homePath);
  } catch (error) {
    if (isMissing(error)) throw new Error(`unsafe keybindings HOME: ${homePath} does not exist`);
    throw error;
  }
  assertSafeDirectory(homePath, homeInfo);
  if (await operations.realpath(homePath) !== homePath) {
    throw new Error(`unsafe keybindings HOME resolution: ${homePath}`);
  }

  let nearestExistingPath = homePath;
  let complete = true;
  const parentPath = join(homePath, ".pi", "agent");
  for (const path of [join(homePath, ".pi"), parentPath]) {
    let info;
    try {
      info = await operations.lstat(path);
    } catch (error) {
      if (!isMissing(error)) throw error;
      if (!createMissing) {
        complete = false;
        break;
      }
      try {
        await operations.mkdir(path, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw mkdirError;
      }
      info = await operations.lstat(path);
    }
    assertSafeDirectory(path, info);
    if (await operations.realpath(path) !== path) {
      throw new Error(`unsafe keybindings parent resolution: ${path}`);
    }
    nearestExistingPath = path;
  }

  return { complete, nearestExistingPath, parentPath };
}

async function inspectTarget(targetPath, operations) {
  let pathInfo;
  try {
    pathInfo = await operations.lstat(targetPath);
  } catch (error) {
    if (isMissing(error)) return { exists: false, value: {} };
    throw error;
  }

  if (pathInfo.isSymbolicLink()) throw new Error("unsafe keybindings target: symlinks are not allowed");
  if (!pathInfo.isFile()) throw new Error("unsafe keybindings target: keybindings.json must be a regular file");
  if (pathInfo.nlink !== 1) throw new Error("unsafe keybindings target: multiple hard links are not allowed");
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new Error("safe keybindings file opening is unavailable on this platform");
  }

  const handle = await operations.open(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let source;
  let openedInfo;
  try {
    openedInfo = await handle.stat();
    if (!openedInfo.isFile() || openedInfo.nlink !== 1) {
      throw new Error("unsafe keybindings target: keybindings.json changed during validation");
    }
    if (openedInfo.dev !== pathInfo.dev || openedInfo.ino !== pathInfo.ino) {
      throw new Error("unsafe keybindings target: keybindings.json changed during validation");
    }
    source = await handle.readFile();
  } finally {
    await handle.close();
  }

  let value;
  try {
    value = JSON.parse(source.toString("utf8"));
  } catch {
    throw new SyntaxError("keybindings.json must contain valid JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("keybindings.json root must be a JSON object");
  }

  return {
    exists: true,
    identity: { dev: openedInfo.dev, ino: openedInfo.ino },
    source,
    value,
  };
}

async function assertTargetUnchanged(targetPath, expected, operations) {
  let current;
  try {
    current = await operations.lstat(targetPath);
  } catch (error) {
    if (isMissing(error) && !expected.exists) return;
    throw new Error("unsafe keybindings target: keybindings.json changed before replacement");
  }

  if (!expected.exists) {
    throw new Error("unsafe keybindings target: keybindings.json appeared before replacement");
  }
  if (
    current.isSymbolicLink()
    || !current.isFile()
    || current.nlink !== 1
    || current.dev !== expected.identity.dev
    || current.ino !== expected.identity.ino
  ) {
    throw new Error("unsafe keybindings target: keybindings.json changed before replacement");
  }
}

async function temporaryIsOwned(temporaryPath, identity, operations) {
  if (!identity) return false;
  let current;
  try {
    current = await operations.lstat(temporaryPath);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  return !current.isSymbolicLink()
    && current.isFile()
    && current.nlink === 1
    && current.dev === identity.dev
    && current.ino === identity.ino;
}

async function atomicReplace(homePath, targetPath, expected, content, operations) {
  const parentPath = dirname(targetPath);
  const temporaryPath = join(
    parentPath,
    `.${basename(targetPath)}.aili-pi-${process.pid}-${randomUUID()}.tmp`,
  );
  let handle;
  let temporaryIdentity;
  let renamed = false;
  const failures = [];

  try {
    handle = await operations.open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    const temporaryInfo = await handle.stat();
    if (!temporaryInfo.isFile() || temporaryInfo.nlink !== 1) {
      throw new Error("unsafe keybindings temporary file");
    }
    temporaryIdentity = { dev: temporaryInfo.dev, ino: temporaryInfo.ino };
    await handle.chmod(0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;

    const parents = await inspectParents(homePath, operations, false);
    if (!parents.complete || parents.parentPath !== parentPath) {
      throw new Error("unsafe keybindings parent changed before replacement");
    }
    if (!await temporaryIsOwned(temporaryPath, temporaryIdentity, operations)) {
      throw new Error("unsafe keybindings temporary file changed before replacement");
    }
    await assertTargetUnchanged(targetPath, expected, operations);
    await operations.rename(temporaryPath, targetPath);
    renamed = true;
  } catch (error) {
    failures.push(error);
    if (handle) {
      try {
        await handle.close();
      } catch (closeError) {
        failures.push(closeError);
      }
    }
    if (!renamed) {
      try {
        if (await temporaryIsOwned(temporaryPath, temporaryIdentity, operations)) {
          await operations.unlink(temporaryPath);
        }
      } catch (cleanupError) {
        if (!isMissing(cleanupError)) failures.push(cleanupError);
      }
    }
    if (failures.length > 1) throw new AggregateError(failures, "keybindings atomic replacement failed");
    throw error;
  }
}

export async function mergeGlobalKeybindings(options = {}) {
  const mode = parseMode(options.args ?? []);
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const operations = { ...DEFAULT_OPERATIONS, ...options.operations };

  if (!await detectWsl(environment, platform, operations)) return { status: "not-wsl" };

  const home = environment.HOME;
  if (!home) throw new Error("HOME is not set");
  if (!isAbsolute(home)) throw new Error("unsafe keybindings HOME: path must be absolute");
  const homePath = resolve(home);
  const parents = await inspectParents(homePath, operations, mode === "apply");
  const targetPath = join(homePath, ".pi", "agent", "keybindings.json");
  const target = await inspectTarget(targetPath, operations);
  const hasExplicitAction = Object.prototype.hasOwnProperty.call(target.value, IMAGE_PASTE_ACTION);

  if (hasExplicitAction) return { status: "unchanged", targetPath };

  const writableParent = parents.complete ? parents.parentPath : parents.nearestExistingPath;
  await operations.access(writableParent, constants.W_OK | constants.X_OK);
  if (mode === "check") return { status: "valid", targetPath };
  if (!parents.complete) throw new Error("keybindings parent creation did not complete");

  target.value[IMAGE_PASTE_ACTION] = [...IMAGE_PASTE_BINDINGS];
  const content = `${JSON.stringify(target.value, null, 2)}\n`;
  await atomicReplace(homePath, targetPath, target, content, operations);
  return { status: "changed", targetPath };
}

async function main() {
  await mergeGlobalKeybindings({ args: process.argv.slice(2) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown failure";
    console.error(`AILI keybindings: ERROR ${message}`);
    process.exitCode = 1;
  }
}
