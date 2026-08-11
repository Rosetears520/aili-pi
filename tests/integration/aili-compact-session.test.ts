import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { sourceDigest } from "../../src/runtime/aili-compact/contracts.js";
import { registerAiliCompact } from "../../src/runtime/aili-compact/index.js";
import { activeBlocks, reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("AILI Compact persisted-session controls", () => {
  it("appends model/control state without rewriting prior Pi JSONL lines and replays it after reload", async () => {
    const scratchRoot = join(process.cwd(), ".tmp");
    mkdirSync(scratchRoot, { recursive: true });
    const sessionDir = mkdtempSync(join(scratchRoot, "aili-compact-session-"));
    temporaryDirectories.push(sessionDir);
    const projectDir = join(sessionDir, "project");
    mkdirSync(join(projectDir, ".pi"), { recursive: true });
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), '{ "enabled": true }');
    const manager = SessionManager.create(projectDir, sessionDir, { id: "aili-compact-session" });
    manager.appendMessage({ role: "user", content: "persisted source", timestamp: 1 } as any);
    // Pi defers creation of a new JSONL until it has an assistant entry.
    const sourceId = manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "persisted answer" }], timestamp: 2 } as any);
    const sessionFile = manager.getSessionFile()!;
    const before = readFileSync(sessionFile, "utf8");
    const source = manager.getBranch().find((entry) => entry.id === sourceId)!;
    const contextTx = {
      schema: "aili.compact.tx.v1" as const,
      id: "compact-call",
      kind: "compact" as const,
      epochId: "root",
      blocks: [{
        id: "block:persisted",
        kind: "semantic" as const,
        epochId: "root",
        sourceEntryIds: [sourceId],
        sourceDigest: sourceDigest([source], [sourceId]),
        summary: "Persisted answer was compacted.",
        active: true,
      }],
    };
    manager.appendMessage({ role: "assistant", content: [{ type: "toolCall", id: "compact-call", name: "aili_compact", arguments: {} }], timestamp: 3 } as any);
    manager.appendMessage({ role: "toolResult", toolCallId: "compact-call", toolName: "aili_compact", content: [], isError: false, details: { contextTx }, timestamp: 4 } as any);

    const commands = new Map<string, (args: string, context: any) => Promise<void>>();
    const handlers = new Map<string, (event: any, context: any) => any>();
    registerAiliCompact({
      registerTool() {},
      registerCommand(name: string, command: { handler: (args: string, context: any) => Promise<void> }) { commands.set(name, command.handler); },
      on(event: string, handler: (event: any, context: any) => any) { handlers.set(event, handler); },
      appendEntry(customType: string, data: unknown) { manager.appendCustomEntry(customType, data); },
    } as unknown as ExtensionAPI);

    const context = {
      cwd: projectDir,
      sessionManager: manager,
      getContextUsage: () => undefined,
      ui: { setStatus() {}, notify() {} },
    };
    handlers.get("session_start")!({ type: "session_start", reason: "new" }, context);
    await commands.get("aili-compact")!("cache panel on", context);

    const after = readFileSync(sessionFile, "utf8");
    expect(after.startsWith(before)).toBe(true);
    expect(after.slice(before.length)).toContain('"customType":"aili-compact"');

    const reloaded = SessionManager.open(sessionFile, sessionDir);
    const reloadedState = reduceCompactState(reloaded.getBranch());
    expect(reloadedState.cachePanel).toBe(true);
    expect(activeBlocks(reloadedState).map((block) => block.id)).toEqual(["block:persisted"]);
  });
});
