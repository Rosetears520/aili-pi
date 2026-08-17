#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const launcher = resolve(dirname(fileURLToPath(import.meta.url)), "pi-web.js");
const USAGE = [
  "aili-pi — AILI distribution for the official Pi coding agent",
  "",
  "Usage:",
  "  aili-pi web [--hostname <host>] [--port <port>] [--open]   start the AILI Web UI in the foreground",
  "",
  "The server binds to loopback by default and prints its address when ready.",
].join("\n");

const args = process.argv.slice(2);
if (args[0] !== "web") {
  process.stderr.write(args.length === 0 ? USAGE : `aili-pi: unknown command '${args[0] ?? ""}'\n${USAGE}\n`);
  process.exitCode = 1;
} else {
  // Same foreground launcher as pi-web; --open is handled by the launcher.
  const child = spawn(process.execPath, [launcher, ...args.slice(1)], {
    stdio: "inherit",
    detached: false,
    shell: false,
  });
  const stop = (signal) => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
      const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 5_000);
      timer.unref();
    }
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(signal));
  child.once("error", (error) => {
    process.stderr.write(`aili-pi: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
