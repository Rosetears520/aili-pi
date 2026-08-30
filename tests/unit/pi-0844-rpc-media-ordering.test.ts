import { describe, expect, it, vi } from "vitest";
import { dispatchOfficialPiMutation } from "../../src/web/server/foreground-composition.js";
import { projectJsonl } from "../../src/runtime/web/jsonl-browser.js";

function envelope(capability: string, commandType: string, args: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    type: "MutationEnvelopeV1",
    requestId: "request-1",
    clientId: "client-1",
    runtimeEpoch: "epoch-1",
    leaseGeneration: "lease-1",
    sessionHandle: "session-1",
    sessionLeaf: "leaf-1",
    requestedAt: "2026-01-01T00:00:00.000Z",
    capability,
    commandType,
    arguments: args,
  } as never;
}

function session(send: (command: Record<string, unknown>) => Promise<unknown>) {
  return { send, isRunning: () => false } as never;
}

describe("official Pi 0.84.4 RPC adaptation regressions", () => {
  it("projects a complete final JSONL entry when the file has no trailing newline", () => {
    const entry = {
      type: "message",
      id: "entry-1",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: "resume me", timestamp: 1 },
    };
    const projected = projectJsonl(JSON.stringify(entry));
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ type: "message", role: "user", content: "resume me" });
  });

  it("preserves the official clearQueue result shape through the Gateway dispatcher", async () => {
    const send = vi.fn(async () => ({ steering: ["steer"], followUp: ["later"] }));
    await expect(dispatchOfficialPiMutation(
      session(send),
      envelope("pi.queue", "clear_queue"),
    )).resolves.toEqual({ result: { steering: ["steer"], followUp: ["later"] } });
    expect(send).toHaveBeenCalledWith({ type: "clear_queue" });
  });

  it("rejects overlong steering and follow-up projections before official dispatch", async () => {
    const send = vi.fn(async () => undefined);
    for (const [capability, commandType] of [["pi.steer", "steer"], ["pi.follow_up", "follow_up"]] as const) {
      await expect(dispatchOfficialPiMutation(
        session(send),
        envelope(capability, commandType, { message: "x".repeat(4_097) }),
      )).rejects.toThrow("queued-message-too-long");
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("does not inject toolChoice into compaction or branch summary/navigation commands", async () => {
    const commands: Record<string, unknown>[] = [];
    const send = vi.fn(async (command: Record<string, unknown>) => {
      commands.push(command);
      return command.type === "compact"
        ? { summary: "unchanged", tokensBefore: 10, firstKeptEntryId: "entry-1" }
        : { cancelled: false };
    });
    await dispatchOfficialPiMutation(session(send), envelope("pi.compact", "compact"));
    await dispatchOfficialPiMutation(session(send), envelope("pi.branch", "branch", { targetId: "entry-1" }));
    expect(commands).toEqual([
      { type: "compact" },
      { type: "navigate_tree", targetId: "entry-1" },
    ]);
    expect(commands.every((command) => !("toolChoice" in command))).toBe(true);
  });
});
