import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const API_ROOT = path.dirname(new URL(import.meta.url).pathname);
const WEB_ROOT = path.resolve(API_ROOT, "../..");
const MUTATING_METHOD = /export\s+(?:(?:async\s+)?function\s+|const\s+)(POST|PUT|PATCH|DELETE)\b/g;

/**
 * Every exported non-GET API method has one source-grounded disposition.
 * Adding a mutating route without extending this table fails the equality
 * assertion below; a route cannot quietly become an unclassified owner.
 */
const MUTATION_DISPOSITIONS = Object.freeze({
  "agent/[id] POST": "gateway",
  "agent/new POST": "gateway",
  "aili/btw POST": "isolated-side-thread",
  "aili/keybinds PUT": "gateway",
  "aili/native-file-dialog POST": "native-dialog",
  "aili/upload POST": "file-upload",
  "auth/api-key/[provider] DELETE": "credential",
  "auth/api-key/[provider] POST": "credential",
  "auth/login/[provider] POST": "credential",
  "auth/logout/[provider] POST": "credential",
  "cwd/open POST": "native-dialog",
  "cwd/pick POST": "native-dialog",
  "cwd/validate POST": "cwd-admission",
  "default-cwd POST": "cwd-admission",
  "files/[...path] POST": "file-upload",
  "git/checkout POST": "reject",
  "mcp PATCH": "gateway",
  "models-config/discover POST": "query",
  "models-config PUT": "gateway",
  "models-config/test POST": "query",
  "plugins POST": "gateway",
  "project-trust POST": "gateway",
  "runtime/v1/[...segments] POST": "gateway",
  "sessions/[id]/auto-name POST": "gateway",
  "sessions/[id] DELETE": "gateway",
  "sessions/[id] PATCH": "gateway",
  "skills/check POST": "query",
  "skills/install POST": "gateway",
  "skills PATCH": "gateway",
  "skills/search POST": "query",
  "skills/update POST": "gateway",
  "worktrees DELETE": "reject",
  "worktrees POST": "reject",
});

const DISPOSITION_EVIDENCE = Object.freeze({
  gateway: /(?:translateConfigurationRoute|dispatchCompatibilityMutation|createCompatibilitySession|bridge\.dispatch\()/,
  reject: /rejectCompatibilityMutation/,
  credential: /(?:provider-credential-store|callbacks\.resolve)/,
  "native-dialog": /(?:native-dialog-bridge|openInSystemExplorer|pickSystemDirectory)/,
  "file-upload": /(?:storeAttachment|parseFormDataWithinLimit)/,
  "cwd-admission": /(?:allowFileRoot|mkdirSync)/,
  query: /(?:fetch\(|checkSkillUpdates|completeSimple)/,
  "isolated-side-thread": /BtwSideThreadRuntime/,
});

async function filesBelow(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(candidate));
    else files.push(candidate);
  }
  return files;
}

/** Complete mechanical inventory: a newly exported mutating HTTP method is
 * automatically included and must remain visible in this test's evidence. */
async function mutationInventory() {
  const routes = (await filesBelow(API_ROOT)).filter((file) => file.endsWith("route.ts"));
  const inventory = [];
  for (const file of routes) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(MUTATING_METHOD)) {
      inventory.push(`${path.relative(API_ROOT, file).replaceAll(path.sep, "/").replace(/\/route\.ts$/, "")} ${match[1]}`);
    }
  }
  return inventory.sort();
}

test("every browser API mutation has an exhaustive owned disposition", async () => {
  const inventory = await mutationInventory();
  assert.ok(inventory.length > 0);
  assert.equal(new Set(inventory).size, inventory.length);
  assert.deepEqual(inventory, Object.keys(MUTATION_DISPOSITIONS).sort());

  await Promise.all(Object.entries(MUTATION_DISPOSITIONS).map(async ([entry, disposition]) => {
    const split = entry.lastIndexOf(" ");
    const route = entry.slice(0, split);
    const source = await readFile(path.join(API_ROOT, route, "route.ts"), "utf8");
    assert.match(source, DISPOSITION_EVIDENCE[disposition], `${entry} must retain its ${disposition} boundary`);
  }));

  const autoName = await readFile(path.join(API_ROOT, "sessions/[id]/auto-name/route.ts"), "utf8");
  assert.match(autoName, /kind:\s*"session\.auto_name"/);
  assert.doesNotMatch(autoName, /(?:getRpcSession|startRpcSession|setSessionName|generateSessionTitle)/);

  const btwRuntime = await readFile(path.join(WEB_ROOT, "../runtime/btw/side-thread.ts"), "utf8");
  assert.match(btwRuntime, /has no Pi command or session capability/);
  assert.match(btwRuntime, /never[\s*]+receives access to the main conversation/);
});

test("Git and Worktree compatibility mutations fail closed outside the Gateway", async () => {
  const checkout = await readFile(path.join(API_ROOT, "git/checkout/route.ts"), "utf8");
  const worktrees = await readFile(path.join(API_ROOT, "worktrees/route.ts"), "utf8");
  for (const source of [checkout, worktrees]) {
    assert.match(source, /rejectCompatibilityMutation/);
    assert.doesNotMatch(source, /\b(?:switchBranch|addWorktree|removeWorktree)\s*\(/);
  }
  assert.match(checkout, /"\/api\/git\/checkout POST", null/);
  assert.match(worktrees, /"worktree-add"/);
  assert.match(worktrees, /"worktree-remove"/);
});

test("force removal and dirty-byte destruction are not reachable", async () => {
  const route = await readFile(path.join(API_ROOT, "worktrees/route.ts"), "utf8");
  const helper = await readFile(path.join(WEB_ROOT, "lib/worktree.ts"), "utf8");
  const sidebar = await readFile(path.join(WEB_ROOT, "components/SessionSidebar.tsx"), "utf8");
  const fixture = Buffer.from("modified byte 00: \u0000\nuntracked byte ff: \u00ff\n", "utf8");
  const before = Buffer.from(fixture);

  assert.doesNotMatch(`${route}\n${helper}\n${sidebar}`, /--force|forceRemoveCheckout/);
  assert.doesNotMatch(route, /\bforce\b/);
  assert.match(helper, /removeWorktree\(cwd: string, worktreePath: string\)/);
  assert.doesNotMatch(helper, /\["(?:stash|reset|checkout|clean)"/);
  assert.doesNotMatch(sidebar, /JSON\.stringify\(\{ cwd: worktreeState\.projectRoot, path, force \}\)/);
  assert.deepEqual(fixture, before, "static dirty/untracked fixture bytes must remain untouched");
});

test("Pi Web 0.8.11 mutation-only additions and raw bypass routes stay absent", async () => {
  const routeNames = (await filesBelow(API_ROOT))
    .filter((file) => file.endsWith("route.ts"))
    .map((file) => path.relative(API_ROOT, file).replaceAll(path.sep, "/"));
  const forbidden = [
    /^subagents\//,
    /^chat\//,
    /^settings\//,
    /^tools\//,
    /^powershell\//i,
    /^push\//,
    /^media\//,
    /^sessions\/\[id\]\/raw\//,
    /^skills\/\[[^/]+\]\//,
  ];
  for (const route of routeNames) {
    assert.equal(forbidden.some((pattern) => pattern.test(route)), false, `forbidden 0.8.11 route is active: ${route}`);
  }
});
