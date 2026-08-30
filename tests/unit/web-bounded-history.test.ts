import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ReadonlyJsonlBrowser } from "../../src/runtime/web/jsonl-browser.js";
import { PrivateWebBffBridge } from "../../src/web/server/private-bff-bridge.js";
import { validateWorkbenchHistory } from "../../src/web/contracts.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("bounded Web history reads", () => {
  it("pages the selected branch in stable ancestor order without AgentSession", async () => {
    const root = await mkdtemp(join(tmpdir(), "aili-history-"));
    roots.push(root);
    const project = join(root, "project");
    await mkdir(project);
    const path = join(project, "session.jsonl");
    await writeFile(path, "bounded fixture\n");
    const entries = [
      { type: "message", id: "e1", parentId: null, timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "one" } },
      { type: "message", id: "e2", parentId: "e1", timestamp: "2026-01-01T00:00:01Z", message: { role: "assistant", content: [{ type: "text", text: "two" }] } },
      { type: "message", id: "alternate", parentId: "e1", timestamp: "2026-01-01T00:00:02Z", message: { role: "assistant", content: [{ type: "text", text: "not active" }] } },
      { type: "message", id: "e4", parentId: "e2", timestamp: "2026-01-01T00:00:03Z", message: { role: "user", content: "four" } },
      { type: "message", id: "e5", parentId: "e4", timestamp: "2026-01-01T00:00:04Z", message: { role: "assistant", content: [{ type: "text", text: "five" }] } },
    ];
    const browser = new ReadonlyJsonlBrowser({
      allowedRoots: [root],
      privateSalt: "test-salt",
      sessionManagerOpen: () => ({
        getHeader: () => null,
        getEntries: () => entries as never,
        getSessionName: () => "fixture",
        getLeafId: () => "e5",
      }),
    });
    const [descriptor] = await browser.list();
    const first = await browser.readBranchPage(descriptor!.sessionHandle, undefined, 2);
    expect(first.records.map((record) => record.index)).toEqual([3, 4]);
    expect(first.hasMore).toBe(true);
    const earlier = await browser.readBranchPage(descriptor!.sessionHandle, first.oldestIndex!, 200);
    expect(earlier.records.map((record) => record.index)).toEqual([0, 1]);
    expect(earlier.hasMore).toBe(false);
  });

  it("forwards only the opaque continuation cursor through the BFF bridge", async () => {
    let observed: unknown;
    const bridge = new PrivateWebBffBridge({} as never, {
      catalog: () => ({ status: 200, body: {}, headers: {} }),
      history: (_identity, handle, cursor) => {
        observed = { handle, cursor };
        return { status: 200, body: {}, headers: {} };
      },
      execute: async () => undefined,
    });
    await bridge.dispatch({ method: "GET", segments: ["sessions", "session-opaque", "history"], cursor: "history-abcdefghijklmnopqrstuvwxyzABCDEFG" });
    expect(observed).toEqual({ handle: "session-opaque", cursor: "history-abcdefghijklmnopqrstuvwxyzABCDEFG" });
  });

  it("validates cursor/media projections and rejects raw media URLs", () => {
    const history = validateWorkbenchHistory({
      schemaVersion: 1,
      sessionHandle: "session-opaque",
      hasMore: true,
      cursor: "history-abcdefghijklmnopqrstuvwxyzABCDEFG",
      timeline: [{
        id: "item-1", kind: "tool", status: "complete", title: "tool",
        media: [{ id: "media-opaque", label: "image", mimeType: "image/png", url: "/api/runtime/v1/media/media-opaque" }],
      }],
    });
    expect(history.timeline).toHaveLength(1);
    expect(() => validateWorkbenchHistory({ ...history, timeline: [{ ...history.timeline[0], media: [{ id: "media-opaque", label: "image", mimeType: "image/png", url: "/api/sessions/raw/entries/raw/image" }] }] })).toThrow();
  });
});
