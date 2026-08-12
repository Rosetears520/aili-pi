import { homedir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSharedMcpConfigPath } from "../../src/runtime/mcp.js";

describe("shared MCP config path", () => {
  it("prefers XDG_CONFIG_HOME and otherwise uses HOME/.config", () => {
    expect(resolveSharedMcpConfigPath({ XDG_CONFIG_HOME: "/tmp/xdg", HOME: "/tmp/home" }))
      .toBe(resolve("/tmp/xdg/mcp/mcp.json"));
    expect(resolveSharedMcpConfigPath({ HOME: "/tmp/home" }))
      .toBe(resolve("/tmp/home/.config/mcp/mcp.json"));
  });

  it("uses the platform home fallback without embedding a current-user path", () => {
    expect(resolveSharedMcpConfigPath({})).toBe(resolve(homedir(), ".config/mcp/mcp.json"));
    expect(resolveSharedMcpConfigPath.toString()).not.toContain("/home/rosetears");
  });
});
