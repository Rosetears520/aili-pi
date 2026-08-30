import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { dispatchOfficialPiMutation } = await jiti.import("../../src/web/server/foreground-composition.ts");

function envelope(capability, commandType, argumentsValue) {
  return {
    schemaVersion: 1,
    type: "MutationEnvelopeV1",
    requestId: "request-core",
    clientId: "client-core",
    runtimeEpoch: "epoch-core",
    leaseGeneration: "generation-core",
    sessionHandle: "session-core",
    sessionLeaf: "leaf-core",
    requestedAt: "2026-08-27T00:00:00.000Z",
    capability,
    commandType,
    arguments: argumentsValue,
  };
}

test("core Agent mutations map to the shared Pi Web wrapper", async () => {
  const sent = [];
  const session = {
    send: async (command) => {
      sent.push(command);
      if (command.type === "compact") return { tokensBefore: 100, estimatedTokensAfter: 40 };
      if (command.type === "navigate_tree") return { cancelled: false };
      if (command.type === "fork") return { cancelled: false, newSessionId: "session-new" };
      if (command.type === "safe_delete") return { deleted: true };
      return undefined;
    },
    isRunning: () => true,
  };

  const prompt = await dispatchOfficialPiMutation(session, envelope("pi.send", "send", { message: "hello" }));
  await dispatchOfficialPiMutation(session, envelope("pi.follow_up", "follow_up", { message: "later" }));
  await dispatchOfficialPiMutation(session, envelope("pi.steer", "steer", { message: "change" }));
  const compact = await dispatchOfficialPiMutation(session, envelope("pi.compact", "compact", { instructions: "keep decisions" }));
  await dispatchOfficialPiMutation(session, envelope("pi.abort", "abort", {}));
  const branch = await dispatchOfficialPiMutation(session, envelope("pi.branch", "branch", { targetId: "entry-1" }));
  const fork = await dispatchOfficialPiMutation(session, envelope("pi.fork", "fork", { entryId: "entry-1" }));
  await dispatchOfficialPiMutation(session, envelope("pi.thinking", "select_thinking", { thinkingLevel: "high" }));
  await dispatchOfficialPiMutation(session, envelope("pi.model", "select_model", { provider: "provider", modelId: "model" }));
  const deleted = await dispatchOfficialPiMutation(session, envelope("session.safe_delete", "safe_delete", {}));

  assert.deepEqual(prompt, { activeTurnContinues: true });
  assert.deepEqual(compact, { activeTurnContinues: true, result: { tokensBefore: 100, estimatedTokensAfter: 40 } });
  assert.deepEqual(branch, { result: { cancelled: false } });
  assert.deepEqual(fork, { result: { cancelled: false, newSessionId: "session-new" } });
  assert.deepEqual(deleted, { result: { deleted: true } });
  assert.deepEqual(sent, [
    { type: "prompt", message: "hello" },
    { type: "follow_up", message: "later" },
    { type: "steer", message: "change" },
    { type: "compact", customInstructions: "keep decisions" },
    { type: "abort" },
    { type: "navigate_tree", targetId: "entry-1" },
    { type: "fork", entryId: "entry-1" },
    { type: "set_thinking_level", level: "high" },
    { type: "set_model", provider: "provider", modelId: "model" },
    { type: "safe_delete" },
  ]);
});
