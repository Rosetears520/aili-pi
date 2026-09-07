import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listMcpPanelServers,
  setMcpPanelServerDisabled,
  setMcpPanelServerLifecycle,
  type McpLifecycle,
} from "../../src/web/lib/mcp-panel-access.ts";

// Global-toggle contract (user direction 2026-08-20): the panel manages ONE
// file — the shared global MCP config. Mode changes use the adapter's public
// config writer; reads are redacted to name+disabled+lifecycle; nothing is ever
// written into the project directory.

async function fixture(): Promise<{ shared: string; cwd: string }> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-panel-"));
  const shared = join(dir, "mcp.json");
  await writeFile(shared, JSON.stringify({
    unrelated: { retained: true },
    mcpServers: {
      "alpha": { command: "npx", args: ["-y", "alpha@1"], env: { TOKEN: "secret" } },
      "beta.mcp": { command: "beta" },
      "gamma": { command: "gamma", disabled: true },
    },
  }, null, 2));
  const cwd = join(dir, "project");
  await writeFile(join(cwd, "marker.txt"), "", { flag: "wx" }).catch(() => mkdirHack(cwd));
  return { shared, cwd };
}

async function mkdirHack(path: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path);
  await writeFile(join(path, "marker.txt"), "");
}

describe("mcp panel global toggles", () => {
  it("lists shared servers redacted to name + disabled + lifecycle", async () => {
    const { shared } = await fixture();
    const { servers } = listMcpPanelServers(undefined, shared);
    expect(servers.map((s) => s.name)).toEqual(["alpha", "beta.mcp", "gamma"]);
    expect(servers.find((s) => s.name === "gamma")?.disabled).toBe(true);
    expect(servers.find((s) => s.name === "alpha")?.disabled).toBe(false);
    expect(servers.find((s) => s.name === "alpha")?.lifecycle).toBe("lazy");
    expect(Object.keys(servers[0]!).sort()).toEqual(["disabled", "lifecycle", "name"]);
    expect(JSON.stringify(servers)).not.toContain("command");
    expect(JSON.stringify(servers)).not.toContain("TOKEN");
  });

  it("disables by writing the global disabled flag and enables by removing it", async () => {
    const { shared } = await fixture();
    expect(setMcpPanelServerDisabled("alpha", true, undefined, shared).changed).toBe(true);
    let raw = JSON.parse(await readFile(shared, "utf8"));
    expect(raw.mcpServers.alpha.disabled).toBe(true);
    expect(raw.mcpServers.alpha.command).toBe("npx");
    expect(raw.unrelated).toEqual({ retained: true });

    expect(setMcpPanelServerDisabled("gamma", false, undefined, shared).changed).toBe(true);
    raw = JSON.parse(await readFile(shared, "utf8"));
    expect(raw.mcpServers.gamma.disabled).toBeUndefined();
    expect(raw.mcpServers.gamma.command).toBe("gamma");

    expect(setMcpPanelServerDisabled("alpha", true, undefined, shared).changed).toBe(false);
  });

  it.each(["eager", "keep-alive", "lazy", "lazy-keep-alive"] as const)("saves and reads the %s lifecycle mode", async (lifecycle) => {
    const { shared } = await fixture();
    expect(setMcpPanelServerLifecycle("alpha", lifecycle, undefined, shared)).toEqual({ changed: true });
    const raw = JSON.parse(await readFile(shared, "utf8"));
    expect(raw.mcpServers.alpha.lifecycle).toBe(lifecycle);
    expect(listMcpPanelServers(undefined, shared).servers.find((server) => server.name === "alpha")).toEqual({
      name: "alpha",
      disabled: false,
      lifecycle,
    });
  });

  it("preserves the lifecycle while disabling and re-enabling a server", async () => {
    const { shared } = await fixture();
    setMcpPanelServerLifecycle("alpha", "keep-alive", undefined, shared);
    setMcpPanelServerDisabled("alpha", true, undefined, shared);
    let raw = JSON.parse(await readFile(shared, "utf8"));
    expect(raw.mcpServers.alpha).toMatchObject({ lifecycle: "keep-alive", disabled: true });
    expect(listMcpPanelServers(undefined, shared).servers.find((server) => server.name === "alpha")).toMatchObject({
      disabled: true,
      lifecycle: "keep-alive",
    });

    setMcpPanelServerDisabled("alpha", false, undefined, shared);
    raw = JSON.parse(await readFile(shared, "utf8"));
    expect(raw.mcpServers.alpha.disabled).toBeUndefined();
    expect(raw.mcpServers.alpha.lifecycle).toBe("keep-alive");
  });

  it("enables a disabled server when a lifecycle mode is selected", async () => {
    const { shared } = await fixture();
    expect(setMcpPanelServerLifecycle("gamma", "eager", undefined, shared)).toEqual({ changed: true });
    const raw = JSON.parse(await readFile(shared, "utf8"));
    expect(raw.mcpServers.gamma).toMatchObject({ command: "gamma", lifecycle: "eager" });
    expect(raw.mcpServers.gamma.disabled).toBeUndefined();
    expect(listMcpPanelServers(undefined, shared).servers.find((server) => server.name === "gamma")).toEqual({
      name: "gamma",
      disabled: false,
      lifecycle: "eager",
    });
  });

  it("preserves non-mode fields, including secret-bearing fixture fields", async () => {
    const { shared } = await fixture();
    const before = JSON.parse(await readFile(shared, "utf8"));
    const beforeEntry = before.mcpServers.alpha;
    setMcpPanelServerLifecycle("alpha", "lazy-keep-alive", undefined, shared);
    const after = JSON.parse(await readFile(shared, "utf8"));
    expect({ ...after.mcpServers.alpha, lifecycle: undefined, disabled: undefined }).toEqual({
      ...beforeEntry,
      lifecycle: undefined,
      disabled: undefined,
    });
    expect(after.unrelated).toEqual(before.unrelated);
    expect(after.mcpServers["beta.mcp"]).toEqual(before.mcpServers["beta.mcp"]);
    expect(after.mcpServers.gamma).toEqual(before.mcpServers.gamma);
  });

  it("rejects an invalid lifecycle without writing the file", async () => {
    const { shared } = await fixture();
    const before = await readFile(shared, "utf8");
    expect(() => setMcpPanelServerLifecycle("alpha", "invalid" as unknown as McpLifecycle, undefined, shared)).toThrow(/invalid lifecycle/);
    expect(await readFile(shared, "utf8")).toBe(before);
  });

  it("normalizes the legacy root spelling to canonical mcpServers on write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-panel-legacy-"));
    const shared = join(dir, "mcp.json");
    await writeFile(shared, JSON.stringify({
      unrelated: "keep",
      "mcp-servers": { legacy: { command: "legacy-command", args: ["--flag"] } },
    }));

    expect(listMcpPanelServers(undefined, shared).servers).toEqual([{ name: "legacy", disabled: false, lifecycle: "lazy" }]);
    expect(setMcpPanelServerDisabled("legacy", true, undefined, shared)).toEqual({ changed: true });
    const raw = JSON.parse(await readFile(shared, "utf8"));
    expect(raw["mcp-servers"]).toBeUndefined();
    expect(raw.mcpServers.legacy).toEqual({ command: "legacy-command", args: ["--flag"], disabled: true });
    expect(raw.unrelated).toBe("keep");

    expect(setMcpPanelServerDisabled("legacy", false, undefined, shared)).toEqual({ changed: true });
    const roundtrip = JSON.parse(await readFile(shared, "utf8"));
    expect(roundtrip.mcpServers.legacy).toEqual({ command: "legacy-command", args: ["--flag"] });
  });

  it("surfaces malformed shared config instead of silently replacing it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-panel-invalid-"));
    const shared = join(dir, "mcp.json");
    await writeFile(shared, "{ invalid json");
    expect(() => listMcpPanelServers(undefined, shared)).toThrow(/Failed to read shared MCP config/);
    expect(() => setMcpPanelServerDisabled("alpha", true, undefined, shared)).toThrow(/Failed to read shared MCP config/);
    expect(await readFile(shared, "utf8")).toBe("{ invalid json");
  });

  it("rejects unknown and malformed names without touching the file", async () => {
    const { shared } = await fixture();
    const before = await readFile(shared, "utf8");
    expect(() => setMcpPanelServerDisabled("nope", true, undefined, shared)).toThrow(/unknown server/);
    expect(() => setMcpPanelServerLifecycle("nope", "lazy", undefined, shared)).toThrow(/unknown server/);
    expect(() => setMcpPanelServerDisabled("../evil", true, undefined, shared)).toThrow(/invalid server name/);
    expect(await readFile(shared, "utf8")).toBe(before);
  });

  it("never writes into the project directory", async () => {
    const { shared, cwd } = await fixture();
    const before = await readdir(cwd);
    setMcpPanelServerDisabled("alpha", true, undefined, shared);
    setMcpPanelServerDisabled("alpha", false, undefined, shared);
    setMcpPanelServerLifecycle("alpha", "lazy-keep-alive", undefined, shared);
    expect(await readdir(cwd)).toEqual(before);
  });
});
