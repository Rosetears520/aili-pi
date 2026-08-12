import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acceptedMcpServers, previewSharedMcpConfig, writeAcceptedSharedMcpConfig } from "../../src/runtime/mcp-config.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("accepted shared MCP config preview", () => {
  it("merges exact pinned lazy servers and redacts credentials without writing", () => {
    const preview = previewSharedMcpConfig("/tmp/mcp.json", {
      mcpServers: { existing: { url: "https://example.test", headers: { Authorization: "secret" } } },
    });
    expect(preview.conflicts).toEqual([]);
    expect(preview.changed).toBe(true);
    expect(Object.keys(preview.config.mcpServers)).toEqual(["existing", "mempalace", "context7", "playwright", "codegraph"]);
    expect(preview.redactedText).toContain("[redacted]");
    expect(preview.redactedText).not.toContain("secret");
    expect(acceptedMcpServers().mempalace.args).toContain("/home/rosetears/code/ai/.mempalace");
  });

  it("blocks same-name conflicts", () => {
    const preview = previewSharedMcpConfig("/tmp/mcp.json", { mcpServers: { context7: { command: "latest" } } });
    expect(preview.conflicts).toEqual(["context7"]);
    expect(() => preview.redactedText.includes("latest")).not.toThrow();
  });

  it("backs up and atomically replaces a disposable config", async () => {
    const root = await mkdtemp(join(tmpdir(), "aili-mcp-config-"));
    roots.push(root);
    const path = join(root, "mcp", "mcp.json");
    await mkdir(join(root, "mcp"));
    await writeFile(path, '{"mcpServers":{"existing":{"url":"https://example.test"}}}\n');
    const preview = previewSharedMcpConfig(path, JSON.parse(await readFile(path, "utf8")));
    const result = await writeAcceptedSharedMcpConfig(preview);
    expect(result.backupPath).toMatch(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.bak\\.`));
    expect(JSON.parse(await readFile(path, "utf8")).mcpServers).toMatchObject({ context7: expect.any(Object) });
    expect(await readFile(result.backupPath!, "utf8")).toContain("existing");
  });
});
