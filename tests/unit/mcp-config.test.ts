import { homedir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSharedMcpConfigPath } from "../../src/runtime/mcp.js";
import { acceptedMcpServers, resolveCodeGraphSelection } from "../../src/runtime/mcp-config.js";

describe("shared MCP config path", () => {
  it("prefers XDG_CONFIG_HOME and otherwise uses HOME/.config", () => {
    expect(resolveSharedMcpConfigPath({ XDG_CONFIG_HOME: "/tmp/xdg", HOME: "/tmp/home" }))
      .toBe(resolve("/tmp/xdg/mcp/mcp.json"));
    expect(resolveSharedMcpConfigPath({ HOME: "/tmp/home" }))
      .toBe(resolve("/tmp/home/.config/mcp/mcp.json"));
  });

  it("selects CodeGraph PATH only at its exact governed version and configures five keep-alive servers", () => {
    expect(resolveCodeGraphSelection(() => "/bin/codegraph", () => "codegraph 1.4.1")).toMatchObject({ strategy: "npx", actualVersion: "1.4.1", status: "fallback" });
    expect(resolveCodeGraphSelection(() => "/bin/codegraph", () => "1.5.0")).toMatchObject({ strategy: "path", status: "compatible" });
    const servers = acceptedMcpServers(resolveCodeGraphSelection(() => undefined));
    expect(Object.keys(servers)).toEqual(["mempalace", "context7", "playwright", "codegraph", "graphify"]);
    expect(Object.values(servers).every((server) => server.lifecycle === "keep-alive")).toBe(true);
    expect(servers.context7?.env).toBeUndefined();
    expect(servers.graphify).toMatchObject({ command: "graphify-mcp", args: ["graphify-out/graph.json"] });
  });

  it("uses the platform home fallback without embedding a current-user path", () => {
    expect(resolveSharedMcpConfigPath({})).toBe(resolve(homedir(), ".config/mcp/mcp.json"));
    expect(resolveSharedMcpConfigPath.toString()).not.toContain("/home/rosetears");
  });
});
