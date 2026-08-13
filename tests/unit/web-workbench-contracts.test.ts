import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AILI_BFF_BASE,
  ACTION_CONTRACTS,
  EXCLUDED_UPSTREAM_WEB_BEHAVIORS,
  PI_WEB_BASELINE,
  PI_WEB_RETAINED_SURFACES,
  acceptRuntimeSnapshot,
  branchForkExplanation,
  buildSessionTree,
  composerActions,
  inspectMcpProjection,
  projectWorkbenchRuntime,
  runtimeStatusView,
  safeWorktreeRemovalArguments,
  toOfficialPiImageContent,
  validateBrowserMedia,
  validateNoDirectBrowserMutationUrl,
  validateRuntimeSnapshot,
  validateWorkbenchCatalog,
} from "../../src/web/index.js";

const at = "2026-08-13T00:00:00.000Z";
function snapshot(overrides: Record<string, unknown> = {}) {
  return validateRuntimeSnapshot({
    schemaVersion: 1,
    type: "RuntimeSnapshotV1",
    runtimeEpoch: "epoch-web-contracts",
    sessionHandle: "session-web-contracts",
    lastSequence: 0,
    cursor: "epoch-web-contracts:0",
    createdAt: at,
    state: "running",
    writer: { state: "owned", owner: "web", generation: "generation-web", activeTurn: true },
    capabilities: {
      "pi.send": true,
      "pi.follow_up": true,
      "pi.steer": true,
      "agent.continue": true,
      "worktree.read": true,
    },
    projection: {
      pi: { provider: "provider", model: "vision-model", thinkingLevel: "high", contextTokens: 1200, contextWindow: 8000, activeRun: true, leafId: "leaf-1" },
      agent: { tasks: [{ handle: "agent-1", label: "Implementation", state: "running", continuationAllowed: false }] },
      mcp: { servers: [{ handle: "mcp-1", label: "Files", state: "lazy", lazy: true, toolCount: 3 }] },
    },
    ...overrides,
  });
}

function png(width = 1, height = 1): Uint8Array {
  const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe("locked Pi Web adaptation inventory", () => {
  it("pins the sole code/function baseline and retained tasks 6.1 surfaces", () => {
    expect(PI_WEB_BASELINE).toMatchObject({ package: "@agegr/pi-web", version: "0.8.8", revision: "5a53c18ca9328400a3dfb8c48c1e4f343b3e4903" });
    expect(PI_WEB_RETAINED_SURFACES).toEqual(expect.arrayContaining([
      "session-tree", "project-grouping", "resume", "rename", "export", "safe-delete", "branch", "fork",
      "model-provider", "thinking", "commands", "skills", "plugins", "files", "git-diff", "worktree-navigation",
      "media-preview", "i18n", "responsive-layout", "pwa",
    ]));
    expect(EXCLUDED_UPSTREAM_WEB_BEHAVIORS).toContain("direct-agent-session-ownership");
    expect(EXCLUDED_UPSTREAM_WEB_BEHAVIORS).toContain("force-worktree-removal");
  });

  it("keeps browser network ownership under the AILI BFF", async () => {
    expect(AILI_BFF_BASE).toBe("/api/runtime/v1");
    validateNoDirectBrowserMutationUrl("/api/runtime/v1/mutations");
    expect(() => validateNoDirectBrowserMutationUrl("/api/agent/private-session")).toThrow(/bypasses/);
    const client = await readFile("src/web/gateway-client.ts", "utf8");
    expect(client).not.toMatch(/\/api\/(?:agent|files|git|worktrees|skills|plugins|models-config)\b/);
  });

  it("makes retained JavaScript placeholders ineligible and keeps both Next configs aligned", async () => {
    const [effectiveConfig, typedConfig, pageJs, layoutJs, pageTsx, layoutTsx] = await Promise.all([
      readFile("src/web/next.config.js", "utf8"),
      readFile("src/web/next.config.ts", "utf8"),
      readFile("src/web/app/page.js", "utf8"),
      readFile("src/web/app/layout.js", "utf8"),
      readFile("src/web/app/page.tsx", "utf8"),
      readFile("src/web/app/layout.tsx", "utf8"),
    ]);
    expect(pageJs).toContain("Private runtime projection is initializing");
    expect(layoutJs).toContain('title: "AILI Web"');
    expect(pageTsx).toContain("AiliWorkbench");
    expect(layoutTsx).toContain("PwaRegistration");

    const expectedExternals = ["undici", "@earendil-works/pi-coding-agent", "@earendil-works/pi-agent-core", "@earendil-works/pi-ai", "@earendil-works/pi-tui"];
    for (const source of [effectiveConfig, typedConfig]) {
      const extensions = source.match(/pageExtensions:\s*(\[[^\]]+\])/)?.[1];
      const externals = source.match(/serverExternalPackages:\s*(\[[^\]]+\])/)?.[1];
      expect(extensions).toBeDefined();
      expect(JSON.parse(extensions!)).toEqual(["tsx", "ts"]);
      expect(["page.js", "layout.js"].every((name) => !JSON.parse(extensions!).includes(name.split(".")[1]))).toBe(true);
      expect(externals).toBeDefined();
      expect(JSON.parse(externals!)).toEqual(expectedExternals);
      expect(source).toMatch(/output:\s*"standalone"/);
      expect(source).toMatch(/poweredByHeader:\s*false/);
      expect(source).toContain('source: "/:path*"');
      expect(source).toContain('{ key: "Cache-Control", value: "private, no-store, max-age=0" }');
      expect(source).toContain('{ key: "Referrer-Policy", value: "no-referrer" }');
      expect(source).toContain('{ key: "X-Content-Type-Options", value: "nosniff" }');
      expect(source).toContain('{ key: "Cross-Origin-Resource-Policy", value: "same-origin" }');
      expect(source).toContain('source: "/sw.js"');
      expect(source).toContain('{ key: "Service-Worker-Allowed", value: "/" }');
      expect(source).toContain('source: "/manifest.webmanifest"');
      expect(source.match(/public, max-age=0, must-revalidate/g)).toHaveLength(2);
    }
  });
});

describe("session, Branch/Fork, and safe Worktree contracts", () => {
  it("builds the Pi Web parent session tree while keeping Branch and Fork distinct", () => {
    const base = { projectHandle: "project-1", summary: "", modifiedAt: at, messageCount: 1, actions: { resume: true, rename: true, export: true, safeDelete: true, branch: true, fork: true }, timeline: [] } as const;
    const root = { ...base, handle: "session-root", name: "Root" };
    const fork = { ...base, handle: "session-fork", name: "Fork", parentHandle: root.handle };
    const tree = buildSessionTree([fork, root]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.session.handle).toBe("session-fork");
    expect(ACTION_CONTRACTS.branch.commandType).toBe("branch");
    expect(ACTION_CONTRACTS.fork.commandType).toBe("fork");
    expect(branchForkExplanation("branch")).toContain("current Pi JSONL");
    expect(branchForkExplanation("fork")).toContain("independent Pi session file");
  });

  it("cannot express force removal or branch deletion", () => {
    expect(safeWorktreeRemovalArguments("worktree-1")).toEqual({ worktreeHandle: "worktree-1" });
    expect(Object.values(ACTION_CONTRACTS).map((contract) => contract.commandType)).not.toContain("force_remove");
    expect(Object.values(ACTION_CONTRACTS).map((contract) => contract.commandType)).not.toContain("delete_branch");
  });
});

describe("persistent runtime status and unambiguous busy composer", () => {
  it("shows material model/thinking/context/writer/run state", () => {
    const state = acceptRuntimeSnapshot(snapshot());
    expect(runtimeStatusView(state)).toMatchObject({ connection: "connected", writer: "Web writer", writable: true, activeRun: true, model: "provider/vision-model", thinking: "high", context: "1k / 8k" });
    const actions = composerActions(state);
    expect(actions.primary).toMatchObject({ action: "queue-next", label: "Queue Next", commandType: "follow_up" });
    expect(actions.secondary).toMatchObject({ action: "steer", label: "Steer", commandType: "steer" });
    expect(actions.primary.effect).not.toBe(actions.secondary?.effect);
  });

  it("makes a TUI-owned observer visibly read-only and consumes the current top-level TUI projection", () => {
    const tui = acceptRuntimeSnapshot(snapshot({
      writer: { state: "owned", owner: "tui", generation: "generation-tui", activeTurn: true },
      projection: { surface: "tui", provider: "provider", model: "tui-model", thinkingLevel: "medium", contextTokens: 50, contextWindow: 500, leafId: "leaf-tui" },
    }));
    expect(runtimeStatusView(tui)).toMatchObject({ writable: false, model: "provider/tui-model", thinking: "medium", context: "50 / 500" });
    expect(composerActions(tui).disabledReason).toMatch(/TUI owns/);
  });
});

describe("truthful persistent-Agent and MCP projection", () => {
  it("uses explicit projections, keeps continuation owner-gated, and exposes no connect action", () => {
    const state = acceptRuntimeSnapshot(snapshot());
    const projected = projectWorkbenchRuntime(state);
    expect(projected.agents[0]).toMatchObject({ handle: "agent-1", state: "running", continuationAllowed: false });
    const mcp = inspectMcpProjection(state);
    expect(mcp).toMatchObject({ mode: "projection-only", connectedCount: 0 });
    expect(mcp.servers[0]).toMatchObject({ state: "lazy", lazy: true });
    expect(mcp).not.toHaveProperty("connect");
    expect(JSON.stringify(mcp)).not.toMatch(/config|credential|environment|argument/i);
  });

  it("does not infer Agent or MCP state from timeline/transcript text", () => {
    const value = snapshot({ projection: { timeline: [{ body: "MCP connected; agent running" }], pi: { activeRun: false, leafId: "root" } } });
    const projected = projectWorkbenchRuntime(acceptRuntimeSnapshot(value));
    expect(projected.agents).toEqual([]);
    expect(projected.mcpServers).toEqual([]);
  });
});

describe("bounded browser media", () => {
  it("validates bytes and converts only accepted input to official Pi image content", () => {
    const result = validateBrowserMedia([{ name: "pixel.png", declaredMimeType: "image/png", bytes: png() }], { modelSupportsImages: true });
    expect(result.ok).toBe(true);
    expect(result.accepted[0]).toMatchObject({ mimeType: "image/png", width: 1, height: 1 });
    const content = toOfficialPiImageContent(result.accepted);
    expect(content).toEqual([{ type: "image", mimeType: "image/png", data: expect.any(String) }]);
  });

  it.each([
    { label: "invalid", input: { name: "fake.png", declaredMimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }, imageCap: true, code: "unsupported" },
    { label: "mismatched", input: { name: "fake.jpg", declaredMimeType: "image/jpeg", bytes: png() }, imageCap: true, code: "invalid-bytes" },
    { label: "model-incompatible", input: { name: "pixel.png", declaredMimeType: "image/png", bytes: png() }, imageCap: false, code: "model-incompatible" },
    { label: "oversized", input: { name: "large.png", declaredMimeType: "image/png", bytes: new Uint8Array(), reportedSize: 10 * 1024 * 1024 + 1 }, imageCap: true, code: "oversized" },
    { label: "dimensions", input: { name: "huge.png", declaredMimeType: "image/png", bytes: png(8193, 1) }, imageCap: true, code: "dimensions" },
  ])("reports $label visibly without an attachment", ({ input, imageCap, code }) => {
    const result = validateBrowserMedia([input], { modelSupportsImages: imageCap });
    expect(result.accepted).toEqual([]);
    expect(result.failures[0]).toMatchObject({ code, message: expect.any(String) });
  });
});

describe("catalog redaction and safe surfaces", () => {
  it("accepts opaque handles and rejects raw private path keys", () => {
    const catalog = { schemaVersion: 1, clientId: "client-1", projects: [], models: [], commands: [], skills: [], plugins: [], files: [], worktrees: [], locales: ["en", "zh-CN"] };
    expect(validateWorkbenchCatalog(catalog)).toEqual(catalog);
    expect(() => validateWorkbenchCatalog({ ...catalog, files: [{ handle: "file-1", label: "x", kind: "text", privatePath: "/secret" }] })).toThrow(/protected/);
  });
});
