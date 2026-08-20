import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Tasks 5.2-5.4 contract (webui-user-terminal): user-controlled terminal
// over WebSocket + PTY, labeled, lifecycle-clean, loopback fail-closed, and
// completely decoupled from the agent runtime.

const panel = await readFile(new URL("./TerminalPanel.tsx", import.meta.url), "utf8");
const manager = await readFile(new URL("../lib/terminal-manager.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/terminal/route.ts", import.meta.url), "utf8");
const instrumentation = await readFile(new URL("../instrumentation.ts", import.meta.url), "utf8");
const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const en = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zh = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");

test("panel is labeled as the user's own terminal", () => {
  assert.match(panel, /t\("terminal\.title"\)/);
  assert.match(panel, /aria-label=\{t\("terminal\.title"\)\}/);
  assert.match(en, /"terminal\.title": "Terminal · User controlled"/);
  assert.match(zh, /"terminal\.title": "终端 · 用户控制"/);
});

test("panel loads xterm lazily with static css and connects same-origin", () => {
  assert.match(panel, /import "@xterm\/xterm\/css\/xterm\.css";/);
  assert.match(panel, /import\("@xterm\/xterm"\)/);
  assert.match(panel, /import\("@xterm\/addon-fit"\)/);
  assert.match(panel, /\/api\/terminal\?cwd=\$\{encodeURIComponent\(cwd\)\}/);
  // Same origin and port as the app — no separate terminal port.
  assert.match(panel, /\$\{protocol\}:\/\/\$\{window\.location\.host\}\$\{session\.path\}/);
  assert.ok(!panel.includes("session.port"), "panel must not use a separate port");
});

test("client-server protocol is bounded JSON frames from the client", () => {
  assert.match(panel, /JSON\.stringify\(\{ t: "d", data \}\)/);
  assert.match(panel, /JSON\.stringify\(\{ t: "resize", cols: terminal\.cols, rows: terminal\.rows \}\)/);
  const framing = manager.match(/message\.t === "d"[\s\S]*?message\.data\.length <= MAX_INPUT_FRAME/);
  assert.ok(framing, "manager must bound input frame size");
  assert.match(manager, /t === "resize"/);
});

test("manager lifecycle: one PTY per connection, reaped on close and dispose", () => {
  assert.match(manager, /ws\.on\("close", teardown\)/);
  assert.match(manager, /ws\.on\("error", teardown\)/);
  assert.match(manager, /pty\.kill\(\)/);
  assert.match(manager, /dispose\(\)/);
  // Backpressure drops output instead of accumulating it.
  assert.match(manager, /bufferedAmount > MAX_BUFFERED_OUTPUT/);
});

test("transport rides the app's own server and fails closed at the upgrade", () => {
  assert.match(manager, /noServer: true/);
  assert.match(manager, /randomUUID\(\)/);
  assert.match(manager, /0 \| 400 \| 403/);
  assert.match(manager, /"400 Bad Request"/);
  assert.match(manager, /"403 Unauthorized"/);
  assert.match(instrumentation, /installTerminalUpgradeHook/);
  assert.match(instrumentation, /manager\.routeUpgrades\(handle\)/);
  assert.match(instrumentation, /routeUpgrades\(this\)/);
  assert.match(manager, /server\.removeAllListeners\("upgrade"\)/);
  assert.match(route, /terminal is available on loopback hosts only/);
  assert.match(route, /status: 503/);
  assert.match(route, /isExistingFilePathAllowed\(cwd, allowedRoots\)/);
});

test("terminal is decoupled from the agent runtime", () => {
  for (const source of [panel, manager, route]) {
    assert.ok(!source.includes("set_perm_mode"), "no permission-mode coupling");
    assert.ok(!source.includes("bash-output"), "no agent bash log coupling");
    assert.ok(!/agentSession|AgentSession/.test(source), "no agent session coupling");
  }
});

test("AppShell exposes a terminal button in the bottom-left toolbar", () => {
  assert.match(shell, /import \{ TerminalPanel \} from "\.\/TerminalPanel"/);
  assert.match(shell, /label: translate\("terminal\.open"\)/);
  assert.match(shell, /onClick: \(\) => setTerminalOpen\(true\)/);
  assert.match(shell, /<TerminalPanel cwd=/);
});

test("terminal strings exist in both i18n catalogs", () => {
  for (const key of [
    "terminal.title",
    "terminal.open",
    "terminal.close",
    "terminal.connecting",
    "terminal.ended",
    "terminal.unavailable",
    "terminal.status.connecting",
    "terminal.status.ready",
    "terminal.status.ended",
    "terminal.status.error",
  ]) {
    assert.ok(en.includes(`"${key}"`), `en must define ${key}`);
    assert.ok(zh.includes(`"${key}"`), `zh-CN must define ${key}`);
  }
});
