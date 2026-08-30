import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Pi Web static lifecycle seams", () => {
  it("registers the web and changes commands through the package extension entry", async () => {
    const [entry, web] = await Promise.all([
      source("extensions/index.ts"),
      source("extensions/web/index.ts"),
    ]);

    expect(entry).toContain('import { registerChangesCommand, registerWebCommand } from "./web/index.js"');
    expect(entry).toContain("registerWebCommand(pi)");
    expect(entry).toContain("registerChangesCommand(pi)");
    expect(web).toContain('WEB_COMMAND_NAME = "web"');
    expect(web).toContain('CHANGES_COMMAND_NAME = "changes"');
    expect(web).toContain("pi.registerCommand(WEB_COMMAND_NAME");
    expect(web).toContain("pi.registerCommand(CHANGES_COMMAND_NAME");
    expect(web).toContain("Pi-owned AILI Web foreground child");
    expect(web).not.toContain("registerTool(");
    // /changes reuses the same one web child and only swaps the entry URL.
    expect(web).toContain("changesViewerUrl(address, sessionRoot)");
    expect(web).toContain('`${base}/changes?cwd=${encodeURIComponent(sessionRoot)}`');
    expect(web).toContain('`${base}/changes`');
  });

  it("falls back to a free port when the default web port is held by a foreign process", async () => {
    const web = await source("extensions/web/index.ts");
    // Only the DEFAULT port may silently move; explicit -p requests stay strict.
    expect(web).toContain("portExplicit");
    expect(web).toContain("reserveWebPort(options.hostname, options.port)");
    expect(web).toContain("!options.portExplicit && options.port === WEB_DEFAULT_PORT");
    expect(web).toContain("onPortFallback?.(options.port, actual)");
    // Both commands surface the fallback in their readiness notice.
    expect(web.match(/portNote = ` \(port \$\{requested\} was busy; using \$\{actual\}\)`;/g)?.length).toBe(2);
    // The fallback port flows into the child identity check, not just the spawn.
    expect(web).toContain("expectedAddress: launch.expectedAddress");
  });

  it("keeps the CLI foreground-owned and performs all static pre-listen checks before spawn", async () => {
    const [cli, core] = await Promise.all([
      source("bin/pi-web.js"),
      source("bin/lib/web-launch-core.mjs"),
    ]);
    const prelisten = core.lastIndexOf("checkPrelisten(hostname, port, allowedRootsValue)");
    const buildCheck = core.lastIndexOf("assertBuild(appRoot)");
    const runtimeCheck = core.lastIndexOf('if (!regularFile(nextCli)) throw new Error("locked Next runtime is missing")');
    const spawn = core.indexOf("const child = spawn(", runtimeCheck);

    expect(prelisten).toBeGreaterThan(-1);
    expect(buildCheck).toBeGreaterThan(prelisten);
    expect(runtimeCheck).toBeGreaterThan(buildCheck);
    expect(spawn).toBeGreaterThan(runtimeCheck);
    expect(core).toContain('stdio: ["inherit", "pipe", "inherit", "pipe", "pipe", "pipe"]');
    expect(core).toContain("shell: false");
    expect(core).not.toContain("detached: true");
    expect(core).toContain('detached: false');
    expect(core).toContain('child.once("error"');
    expect(core).toContain('child.once("exit"');
    // pi-web stays a thin CLI over the shared core and keeps its managed mode.
    expect(cli).toContain('from "./lib/web-launch-core.mjs"');
    expect(cli).toContain('item === "--managed"');
    expect(cli).toContain('item === "--open"');
    expect(cli).toContain('label: "pi-web"');
  });

  it("ships a standalone changes-viewer launcher that reuses the shared core without new surfaces", async () => {
    const [cli, manifest] = await Promise.all([
      source("bin/pi-changes.js"),
      source("package.json"),
    ]);
    expect(cli).toContain('from "./lib/web-launch-core.mjs"');
    // Loopback only, random free port by default, browser lands on /changes.
    expect(cli).toContain('hostname: "127.0.0.1"');
    expect(cli).toContain("freeLoopbackPort()");
    expect(cli).toContain('openTarget = canonical');
    expect(cli).toContain('"/changes"');
    // The positional path seeds the allowed roots; nothing is force-opened.
    expect(cli).toContain("JSON.stringify([canonical])");
    expect(cli).not.toContain("detached: true");
    expect(manifest).toContain('"pi-changes": "./bin/pi-changes.js"');
  });

  it("builds and stages only the declared AILI-owned web source boundary", async () => {
    const build = await source("scripts/build-web.ts");
    expect(build).toContain('WEB_SOURCE_ROOT = "src/web"');
    expect(build).toContain('WEB_OUTPUT_ROOT = "dist/web"');
    expect(build).toContain('PI_WEB_SOURCE_LOCK = "upstream/web-source-locks.json"');
    expect(build).toContain('source: "upstream/pi-web-0.8.11"');
    expect(build).toContain('sourceRevision: "28bab3c25f5f6770c9b0b745ebbfec1c27f7b948"');
    expect(build).toContain("await runNextBuild(root, sourceRoot)");
    expect(build).toContain('cp(join(sourceRoot, ".next"), join(outputRoot, ".next")');
    expect(build).not.toContain('cp(join(root, "upstream"');
  });

  it("pins the browser runtime and packages the CLI, built output, extension, and runtime sources", async () => {
    const manifest = JSON.parse(await source("package.json")) as {
      bin?: Record<string, string>;
      files?: string[];
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(manifest.bin).toEqual({
      "pi-web": "./bin/pi-web.js",
      "pi-changes": "./bin/pi-changes.js",
      "aili-pi": "./bin/aili-pi.js",
    });
    expect(manifest.files).toEqual(expect.arrayContaining(["bin/", "dist/web/", "extensions/web/", "src/"]));
    expect(manifest.dependencies).toMatchObject({ next: "16.3.1", react: "19.2.4", "react-dom": "19.2.4" });
    expect(manifest.dependencies).not.toHaveProperty("@agegr/pi-web");
    expect(manifest.scripts).toMatchObject({ "build:web": expect.stringContaining("scripts/build-web.ts") });
  });

  it("routes retained core Agent mutations through the Runtime Gateway compatibility facade", async () => {
    const [route, newRoute, client, composition, instrumentation, rpcManager] = await Promise.all([
      source("src/web/app/api/agent/[id]/route.ts"),
      source("src/web/app/api/agent/new/route.ts"),
      source("src/web/lib/agent-client.ts"),
      source("src/web/server/foreground-composition.ts"),
      source("src/web/instrumentation.ts"),
      source("src/web/lib/rpc-manager.ts"),
    ]);
    expect(route).toContain("isGatewayAgentMutation(body)");
    expect(route).toContain("isReadOnlyAgentCommand(body)");
    expect(route).toContain("Unsupported direct Agent command");
    expect(route).toContain('kind: "agent.command"');
    expect(route.indexOf("isGatewayAgentMutation(body)")).toBeLessThan(route.indexOf("getRpcSession(id)"));
    expect(newRoute).toContain("createCompatibilitySession");
    expect(newRoute).not.toContain("startRpcSession");
    expect(newRoute).toContain('body.type !== "ensure_session"');
    for (const command of ["prompt", "steer", "follow_up", "compact", "abort", "abort_compaction", "bash", "abort_bash", "navigate_tree", "fork", "reload", "clear_queue", "set_tools", "set_auto_compaction", "set_auto_retry", "set_perm_mode", "extension_ui_response", "extension_ui_input", "set_model", "set_thinking_level", "set_session_name"]) {
      expect(client).toContain(`"${command}"`);
    }
    expect(client).toContain("ensureMutationSession()");
    expect(composition).toContain("Pi Web RPC runtime adapter is unavailable");
    expect(instrumentation).toContain("installRuntimeGatewayAgentAdapter");
    expect(rpcManager).toContain("startRpcSession(sessionId, path, cwd)");
    expect(composition).toContain('"pi.model": Object.freeze(["select_model"])');
    expect(composition).toContain('"pi.abort": Object.freeze(["abort", "abort_compaction"])');
    expect(composition).toContain('"pi.branch": Object.freeze(["branch"])');
    expect(composition).toContain('"pi.fork": Object.freeze(["fork"])');
    expect(composition).toContain('envelope.capability === "pi.fork"');
  });

  it("routes retained session rename through the Runtime Gateway compatibility facade", async () => {
    const [route, composition, sidebar] = await Promise.all([
      source("src/web/app/api/sessions/[id]/route.ts"),
      source("src/web/server/foreground-composition.ts"),
      source("src/web/components/SessionSidebar.tsx"),
    ]);
    expect(route).toContain("dispatchCompatibilityMutation");
    expect(route).toContain('kind: "session.rename"');
    expect(route).not.toContain("appendSessionInfo");
    expect(route).toContain('kind: "session.delete"');
    expect(route).not.toContain("unlinkSync");
    expect(composition).toContain("dispatchCompatibilityMutation(request");
    expect(composition).toContain('capability: "session.rename"');
    expect(composition).toContain('commandType: "rename"');
    expect(composition).toContain('commandType: "safe_delete"');
    expect(sidebar).toContain("ensureMutationSession()");
  });

  it("does not compose the retired stock-TUI projection path into the Web runtime", async () => {
    const [composition, extension] = await Promise.all([
      source("src/web/server/foreground-composition.ts"),
      source("extensions/web/index.ts"),
    ]);
    expect(composition).not.toContain("connectProjectionObserver");
    expect(composition).not.toContain("attachObserver");
    expect(composition).not.toContain("tui-projection-unavailable");
    expect(composition).toContain("session-owned-outside-web-runtime");
    expect(extension).not.toContain("OwnerOnlyProjectionServer");
    expect(extension).not.toContain('pi.on("session_start"');
  });

  it("sets private no-store and same-origin response headers in both Next and BFF seams", async () => {
    const [next, bff] = await Promise.all([
      source("src/web/next.config.js"),
      source("src/runtime/web/bff-gateway.ts"),
    ]);
    for (const value of [
      "private, no-store, max-age=0",
      "no-referrer",
      "nosniff",
      "same-origin",
    ]) {
      expect(next).toContain(value);
      expect(bff).toContain(value);
    }
    expect(bff).toContain("Content-Security-Policy");
    expect(bff).toContain("frame-ancestors 'none'");
  });
});
