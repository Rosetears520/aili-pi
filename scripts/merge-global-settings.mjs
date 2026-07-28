#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const home = process.env.HOME;
if (!home) {
  throw new Error("HOME is not set");
}
const checkOnly = process.argv.length === 3 && process.argv[2] === "--check";
if (process.argv.length > (checkOnly ? 3 : 2)) throw new Error("unsupported arguments");

const settingsPath = join(home, ".pi", "agent", "settings.json");

let source = null;
try {
  source = await readFile(settingsPath, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (source !== null) {
  const settings = JSON.parse(source);
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    throw new TypeError("settings.json root must be a JSON object");
  }
}
