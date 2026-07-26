#!/usr/bin/env node
import { constants } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

const home = process.env.HOME;
if (!home) {
  throw new Error("HOME is not set");
}
const checkOnly = process.argv.length === 3 && process.argv[2] === "--check";
if (process.argv.length > (checkOnly ? 3 : 2)) throw new Error("unsupported arguments");

const agentDirectory = join(home, ".pi", "agent");
const settingsPath = join(agentDirectory, "settings.json");

let source = null;
let mode = 0o600;
try {
  const handle = await open(settingsPath, constants.O_RDONLY);
  try {
    const metadata = await handle.stat();
    mode = metadata.mode & 0o7777;
    source = await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

let settings = {};
if (source !== null) {
  settings = JSON.parse(source);
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    throw new TypeError("settings.json root must be a JSON object");
  }
}

if (checkOnly || settings.compaction?.enabled === false) {
  process.exit(0);
}

await mkdir(agentDirectory, { recursive: true, mode: 0o700 });
const compaction = settings.compaction;
const compactionObject = compaction !== null && typeof compaction === "object" && !Array.isArray(compaction)
  ? compaction
  : {};
settings.compaction = { ...compactionObject, enabled: false };
const output = `${JSON.stringify(settings, null, 2)}\n`;

const temporaryPath = join(
  agentDirectory,
  `.settings.json.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
);
let temporary;
try {
  temporary = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
  await temporary.writeFile(output, "utf8");
  await temporary.sync();
  await temporary.chmod(mode);
  await temporary.close();
  temporary = undefined;
  await rename(temporaryPath, settingsPath);
} finally {
  await temporary?.close().catch(() => undefined);
  await unlink(temporaryPath).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}
