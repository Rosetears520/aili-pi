#!/usr/bin/env node
import { announceLaunchFailure, launchPackagedWeb, normalizeHostname } from "./lib/web-launch-core.mjs";

let managed = false;

function parseOptions(args) {
  let hostname = process.env.PI_WEB_HOSTNAME ?? "127.0.0.1";
  let port = process.env.PORT ?? "30141";
  let open = false;
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--managed") managed = true;
    else if (item === "--open") open = true;
    else if (item === "--hostname" || item === "-H") hostname = optionValue(args, ++index, "hostname");
    else if (item === "--port" || item === "-p") port = optionValue(args, ++index, "port");
    else if (item === "--no-open") { /* retained as an inert compatibility option; this launcher never detaches a browser. */ }
    else throw new Error("unsupported pi-web option");
  }
  hostname = normalizeHostname(hostname);
  return { hostname, port, open };
}

function optionValue(args, index, name) {
  const value = args[index];
  if (!value || value.startsWith("-")) throw new Error(`missing value for ${name}`);
  return value;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  await launchPackagedWeb({
    hostname: options.hostname,
    port: options.port,
    managed,
    allowedRootsValue: process.env.PI_WEB_ALLOWED_ROOTS,
    label: "pi-web",
    open: options.open,
    openTarget: "",
  });
}

main().catch((error) => {
  const message = announceLaunchFailure(managed, error);
  process.stderr.write(`pi-web: ${message}\n`);
  process.exitCode = 1;
});
