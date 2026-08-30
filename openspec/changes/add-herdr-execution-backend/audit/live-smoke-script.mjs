// One-off live smoke (task-owned scratch, self-contained): real herdr daemon + real pi child.
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = "/home/rosetears/code/aili-pi/.tmp/herdr-smoke";
const bridgeDir = join(scratch, "run-1");
const runtimeDir = process.env.XDG_RUNTIME_DIR ?? tmpdir();
const sockDir = join(runtimeDir, ".aili-bridges", createHash("sha256").update(bridgeDir).digest("hex").slice(0, 16));
await rm(scratch, { recursive: true, force: true });
await rm(sockDir, { recursive: true, force: true });
await mkdir(bridgeDir, { recursive: true });
await mkdir(sockDir, { recursive: true, mode: 0o700 });
const token = `smoke-${Date.now()}`;

let nextId = 1;
const call = (method, params) => new Promise((resolve, reject) => {
  const id = `smoke-${nextId++}`;
  const s = connect("/home/rosetears/.config/herdr/herdr.sock");
  s.setEncoding("utf8");
  let buf = "";
  const timer = setTimeout(() => { s.destroy(); reject(new Error(method + " timeout")); }, 40000);
  s.on("data", (chunk) => {
    buf += chunk;
    const i = buf.indexOf("\n");
    if (i < 0) return;
    const line = buf.slice(0, i).trim();
    if (!line) return;
    clearTimeout(timer);
    let frame;
    try { frame = JSON.parse(line); } catch (e) { s.destroy(); reject(e); return; }
    s.destroy();
    if (frame.error) reject(new Error(frame.error.code + ": " + frame.error.message));
    else resolve(frame.result);
  });
  s.on("error", (e) => { clearTimeout(timer); reject(e); });
  s.on("connect", () => s.write(JSON.stringify({ id, method, params }) + "\n"));
});
const snap = await call("session.snapshot", {});
console.log("SYNC ok, protocol", snap.snapshot.protocol);

const ws = await call("workspace.create", { label: `aili-smoke-${Date.now() % 100000}`, cwd: scratch, focus: false });
const workspaceId = ws.workspace.workspace_id;
console.log("WORKSPACE", workspaceId);

const tab = await call("tab.create", {
  workspace_id: workspaceId,
  label: "smoke-child",
  cwd: scratch,
  focus: false,
  env: {
    AILI_HERDR_CHILD: "1",
    AILI_BRIDGE_DIR: bridgeDir,
    AILI_BRIDGE_SOCK_DIR: sockDir,
    AILI_RUN_ID: "run-1",
    AILI_AGENT_ID: "SmokeWorker",
    AILI_BRIDGE_TOKEN: token,
  },
});
const paneId = tab.root_pane.pane_id;
console.log("TAB", tab.tab.tab_id, "PANE", paneId);

try {
  const start = await call("agent.start", {
    name: "ap-smoke-child",
    kind: "pi",
    pane_id: paneId,
    timeout_ms: 30000,
    args: [
      "--no-extensions",
      "-e", "/home/rosetears/code/aili-pi/src/runtime/persistent-agents/herdr-child/index.ts",
      "-e", join(process.env.HOME ?? "/home/rosetears", ".pi/agent/extensions/herdr-agent-state.ts"),
      "--no-skills", "--no-context-files", "--no-prompt-templates", "--no-themes",
      "--session-dir", join(scratch, "sessions"),
      "--session-id", "SmokeWorker",
      "--tools", "read,ls",
    ],
  });
  console.log("AGENT.START ok:", JSON.stringify(start).slice(0, 160));
} catch (error) {
  console.log("AGENT.START returned:", error instanceof Error ? error.message : String(error));
}

const socketPath = join(sockDir, "bridge.sock");
const deadline = Date.now() + 45_000;
while (Date.now() < deadline && !existsSync(socketPath)) await new Promise((r) => setTimeout(r, 300));
if (!existsSync(socketPath)) throw new Error("bridge socket never appeared");
const child = connect(socketPath);
child.setEncoding("utf8");
let buf = "";
const frames = [];
child.on("data", (chunk) => {
  buf += chunk;
  let i = buf.indexOf("\n");
  while (i >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) frames.push(JSON.parse(line));
    i = buf.indexOf("\n");
  }
});
await new Promise((resolve) => setTimeout(resolve, 800));
child.write(JSON.stringify({ cmd: "listen", params: { afterSeq: 0, token } }) + "\n");
await new Promise((resolve) => setTimeout(resolve, 500));
child.write(JSON.stringify({ id: 7, cmd: "status", params: { token } }) + "\n");
await new Promise((resolve) => setTimeout(resolve, 800));
const status = frames.find((f) => f.id === 7);
console.log("BRIDGE STATUS:", JSON.stringify(status));
console.log("BRIDGE EVENTS:", frames.filter((f) => f.event).map((f) => f.event).join(","));
if (!status || status.ok !== true || status.result.agentId !== "SmokeWorker") throw new Error("bridge handshake failed");

child.write(JSON.stringify({ id: 8, cmd: "shutdown", params: { token } }) + "\n");
await new Promise((resolve) => setTimeout(resolve, 800));
child.destroy();
await new Promise((resolve) => setTimeout(resolve, 1_200));
await call("workspace.close", { workspace_id: workspaceId });
console.log("CLEANUP ok (workspace closed, child exited)");
await rm(scratch, { recursive: true, force: true });
await rm(sockDir, { recursive: true, force: true });
console.log("SMOKE PASS");
process.exit(0);
