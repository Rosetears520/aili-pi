import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReadonlyJsonlBrowser, projectJsonl, projectSessionManager } from "../../src/runtime/web/jsonl-browser.js";

async function withJsonlRoots(run: (root: string, outside: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "aili-jsonl-root-"));
  const outside = await mkdtemp(join(tmpdir(), "aili-jsonl-outside-"));
  try {
    await run(root, outside);
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  }
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    type: "message",
    id: "entry-1",
    parentId: null,
    timestamp: "2026-08-13T00:00:00.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "hello" }], provider: "fixture-provider", model: "fixture-model" },
    ...overrides,
  };
}

function manager(entries = [entry()], name: string | undefined = "Catalog Session") {
  return {
    getHeader: () => null,
    getEntries: () => entries as never,
    getSessionName: () => name,
  };
}

describe("read-only JSONL browser", () => {
  it("projects only bounded public SessionEntry fields and ignores malformed fixture lines", () => {
    const text = [
      JSON.stringify(entry({
        type: "message/event",
        internalOnly: "must-not-project",
      })),
      "{truncated",
      JSON.stringify(entry({
        id: "entry-2",
        message: { role: "user", content: "question" },
      })),
      JSON.stringify(["not", "an", "object"]),
      JSON.stringify({ type: "message", message: { role: "user", content: "missing id" } }),
      "",
    ].join("\n");

    expect(projectJsonl(text)).toEqual([
      {
        schemaVersion: 1,
        index: 0,
        type: "message_event",
        role: "assistant",
        content: "hello",
        timestamp: "2026-08-13T00:00:00.000Z",
        data: { entryId: "entry-1", model: "fixture-model", provider: "fixture-provider" },
      },
      {
        schemaVersion: 1,
        index: 1,
        type: "message",
        role: "user",
        content: "question",
        timestamp: "2026-08-13T00:00:00.000Z",
        data: { entryId: "entry-2" },
      },
    ]);
    expect(JSON.stringify(projectJsonl(text))).not.toContain("must-not-project");
  });

  it("bounds official SessionManager projections and truncates long content", () => {
    const projected = projectSessionManager(manager([
      entry({ message: { role: "assistant", content: "x".repeat(40_000) } }),
      entry({ id: "entry-2", message: { role: "assistant", content: "second" } }),
    ]), 1);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ index: 0, type: "message", data: { entryId: "entry-1" } });
    expect(projected[0]?.content).toHaveLength(32_768);
  });

  it("lists opaque descriptors and reads through the injected read-only SessionManager seam", async () => {
    await withJsonlRoots(async (root, outside) => {
      const jsonlPath = join(root, "alpha-session.jsonl");
      await writeFile(jsonlPath, `${JSON.stringify(entry())}\n`, "utf8");
      await writeFile(join(root, "ignored.txt"), JSON.stringify(entry()), "utf8");
      await writeFile(join(outside, "outside.jsonl"), JSON.stringify(entry()), "utf8");
      await symlink(join(outside, "outside.jsonl"), join(root, "linked.jsonl"));
      let opens = 0;

      const browser = new ReadonlyJsonlBrowser({
        allowedRoots: [root],
        maxBytes: 1_024,
        maxLines: 10,
        privateSalt: "fixture-private-salt",
        sessionManagerOpen: () => { opens += 1; return manager(); },
      });
      const listed = await browser.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ schemaVersion: 1, label: "Catalog Session" });
      expect(listed[0]?.sessionHandle).toMatch(/^session-[A-Za-z0-9_-]{32}$/);
      expect(listed[0]?.sessionId).toBe(listed[0]?.sessionHandle);
      expect(JSON.stringify(listed)).not.toContain(root);
      expect(await browser.list()).toEqual(listed);
      expect(await browser.read(listed[0]!.sessionHandle)).toEqual([
        {
          schemaVersion: 1,
          index: 0,
          type: "message",
          role: "assistant",
          content: "hello",
          timestamp: "2026-08-13T00:00:00.000Z",
          data: { entryId: "entry-1", model: "fixture-model", provider: "fixture-provider" },
        },
      ]);
      expect(opens).toBe(3);
      expect(browser.privatePathForHandle(listed[0]!.sessionHandle)).toBe(jsonlPath);
      await expect(browser.read("session-unknown")).rejects.toThrow(/unknown JSONL session handle/);
      await expect(browser.readPrivatePath(join(outside, "outside.jsonl"))).rejects.toThrow(/outside allowed roots/);
      await expect(browser.readPrivatePath(join(root, "ignored.txt"))).rejects.toThrow(/JSONL/);
    });
  });

  it("fails closed for absent, relative, or invalid root configuration", async () => {
    expect(() => new ReadonlyJsonlBrowser({ allowedRoots: [] })).toThrow(/at least one/);
    expect(() => new ReadonlyJsonlBrowser({ allowedRoots: ["relative"] })).toThrow(/absolute/);
    expect(() => new ReadonlyJsonlBrowser({ allowedRoots: ["/tmp"], maxBytes: 1_023 })).toThrow(/maxBytes/);

    await withJsonlRoots(async (root) => {
      const browser = new ReadonlyJsonlBrowser({ allowedRoots: [join(root, "absent")] });
      await expect(browser.list()).rejects.toThrow(/ENOENT|no such file/i);
    });
  });
});
