import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listMcpPanelServers, setMcpPanelServerDisabled } from "../../src/web/lib/mcp-panel-access.ts";

// Global-toggle contract (user direction 2026-08-20): the panel manages ONE
// file — the shared global MCP config. Toggles flip the disabled field there
// (through the vendored adapter writer); reads are redacted to name+disabled;
// nothing is ever written into the project directory.

async function fixture(): Promise<{ shared: string; cwd: string }> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-panel-"));
  const shared = join(dir, "mcp.json");
  await writeFile(shared, JSON.stringify({
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
  it("lists shared servers redacted to name + disabled", async () => {
    const { shared } = await fixture();
    const { servers } = listMcpPanelServers(undefined, shared);
    expect(servers.map((s) => s.name)).toEqual(["alpha", "beta.mcp", "gamma"]);
    expect(servers.find((s) => s.name === "gamma")?.disabled).toBe(true);
    expect(servers.find((s) => s.name === "alpha")?.disabled).toBe(false);
    expect(JSON.stringify(servers)).not.toContain("command");
    expect(JSON.stringify(servers)).not.toContain("TOKEN");
  });

  it("disables by writing the global disabled flag and enables by removing it", async () => {
    const { shared } = await fixture();
    expect(setMcpPanelServerDisabled("alpha", true, undefined, shared).changed).toBe(true);
    let raw = JSON.parse(await readFile(shared, "utf8"));
    expect(raw.mcpServers.alpha.disabled).toBe(true);
    expect(raw.mcpServers.alpha.command).toBe("npx");

    expect(setMcpPanelServerDisabled("gamma", false, undefined, shared).changed).toBe(true);
    raw = JSON.parse(await readFile(shared, "utf8"));
    expect(raw.mcpServers.gamma.disabled).toBeUndefined();
    expect(raw.mcpServers.gamma.command).toBe("gamma");

    expect(setMcpPanelServerDisabled("alpha", true, undefined, shared).changed).toBe(false);
  });

  it("rejects unknown and malformed names without touching the file", async () => {
    const { shared } = await fixture();
    const before = await readFile(shared, "utf8");
    expect(() => setMcpPanelServerDisabled("nope", true, undefined, shared)).toThrow(/unknown server/);
    expect(() => setMcpPanelServerDisabled("../evil", true, undefined, shared)).toThrow(/invalid server name/);
    expect(await readFile(shared, "utf8")).toBe(before);
  });

  it("never writes into the project directory", async () => {
    const { shared, cwd } = await fixture();
    const before = await readdir(cwd);
    setMcpPanelServerDisabled("alpha", true, undefined, shared);
    setMcpPanelServerDisabled("alpha", false, undefined, shared);
    expect(await readdir(cwd)).toEqual(before);
  });
});
