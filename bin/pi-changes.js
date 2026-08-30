#!/usr/bin/env node
//
// Standalone changes viewer entry (user direction 2026-08-25): boots the same
// packaged, version-locked web build as pi-web but lands the browser straight
// on /changes — no Pi session, no /web command, no workbench UI. The optional
// positional path seeds the allowed roots; without one, the page itself offers
// the directory picker (and restores the last chosen directory).
//
import { realpathSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { isAbsolute, resolve } from "node:path";
import { announceLaunchFailure, launchPackagedWeb } from "./lib/web-launch-core.mjs";

function parseOptions(args) {
  const options = { target: null, port: process.env.PI_CHANGES_PORT ?? null, open: true };
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--no-open") options.open = false;
    else if (item === "--port" || item === "-p") {
      const value = args[++index];
      if (!value || value.startsWith("-")) throw new Error("missing value for port");
      options.port = value;
    } else if (item === "--open") { /* default behavior; retained for symmetry */ }
    else if (item.startsWith("-")) throw new Error(`unsupported pi-changes option: ${item}`);
    else if (options.target === null) options.target = item;
    else throw new Error("pi-changes takes at most one directory path");
  }
  return options;
}

/** Ask the kernel for a free loopback port so a running pi-web never clashes. */
function freeLoopbackPort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(String(port)));
    });
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  let canonical = null;
  if (options.target !== null) {
    const candidate = isAbsolute(options.target) ? options.target : resolve(options.target);
    let info;
    try { info = statSync(candidate); } catch { throw new Error(`Directory does not exist: ${options.target}`); }
    if (!info.isDirectory()) throw new Error(`Not a directory: ${options.target}`);
    canonical = realpathSync(candidate);
  }
  const port = options.port ?? await freeLoopbackPort();
  const openTarget = canonical
    ? `/changes?cwd=${encodeURIComponent(canonical)}`
    : "/changes";
  await launchPackagedWeb({
    hostname: "127.0.0.1",
    port,
    managed: false,
    allowedRootsValue: canonical ? JSON.stringify([canonical]) : undefined,
    label: "pi-changes",
    open: options.open,
    openTarget,
  });
}

main().catch((error) => {
  const message = announceLaunchFailure(false, error);
  process.stderr.write(`pi-changes: ${message}\n`);
  process.exitCode = 1;
});
