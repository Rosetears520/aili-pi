import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MutationDispositionJournal } from "../../src/runtime/web/mutation-disposition.js";
import type { MutationEnvelopeV1 } from "../../src/runtime/web/contracts.js";

function mutation(overrides: Partial<MutationEnvelopeV1> = {}): MutationEnvelopeV1 {
  return {
    schemaVersion: 1,
    type: "MutationEnvelopeV1",
    requestId: "request-1",
    clientId: "client-1",
    runtimeEpoch: "epoch-1",
    leaseGeneration: "lease-1",
    sessionHandle: "session-public-1",
    sessionLeaf: "session-internal-leaf-1",
    requestedAt: "2026-08-13T00:00:00.000Z",
    capability: "prompt.submit",
    commandType: "prompt.submit",
    arguments: { text: "do-not-journal-body-marker", nested: { opaque: "do-not-journal-nested-marker" } },
    ...overrides,
  };
}

async function withJournalDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "aili-mutations-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("mutation disposition journal", () => {
  it("joins an identical in-flight request and returns its one terminal disposition", async () => {
    const journal = new MutationDispositionJournal("session-public-1", {
      now: () => new Date("2026-08-13T00:00:01.000Z"),
    });
    const envelope = mutation();

    const admitted = await journal.admit(envelope, "web");
    const joined = await journal.admit(envelope, "web");
    expect(admitted).toMatchObject({ kind: "execute", execute: true, disposition: { disposition: "pending" } });
    expect(joined).toMatchObject({ kind: "join", execute: false, disposition: { requestId: "request-1", clientId: "client-1" } });
    if (joined.kind !== "join") throw new Error("fixture request did not join the in-flight mutation");

    const completed = await journal.complete(envelope, "web", 7);
    await expect(joined.settled).resolves.toEqual(completed);
    expect(completed).toMatchObject({
      requestId: "request-1",
      clientId: "client-1",
      runtimeEpoch: "epoch-1",
      leaseGeneration: "lease-1",
      sessionHandle: "session-public-1",
      disposition: "completed",
      sequence: 7,
    });

    const duplicate = await journal.admit(envelope, "web");
    expect(duplicate).toMatchObject({ kind: "known", execute: false, disposition: completed });
  });

  it("rejects request-id collisions without replacing the admitted identity", async () => {
    const journal = new MutationDispositionJournal("session-public-1", {
      now: () => new Date("2026-08-13T00:00:01.000Z"),
    });
    const original = mutation();
    const collision = mutation({ arguments: { text: "different operation" } });

    await journal.admit(original, "web");
    const denied = await journal.admit(collision, "web");
    expect(denied).toMatchObject({
      kind: "collision",
      execute: false,
      disposition: { disposition: "rejected", reason: "request-id-collision" },
    });
    expect(journal.get("request-1")).toMatchObject({ disposition: "pending" });

    const otherClient = await journal.admit(mutation({ clientId: "client-2" }), "web");
    expect(otherClient).toMatchObject({ kind: "collision", execute: false });
  });

  it("keeps the first terminal outcome idempotent", async () => {
    let now = new Date("2026-08-13T00:00:01.000Z");
    const journal = new MutationDispositionJournal("session-public-1", { now: () => now });
    const envelope = mutation();
    await journal.admit(envelope, "web");
    const completed = await journal.complete(envelope, "web", 9);

    now = new Date("2026-08-13T00:00:03.000Z");
    expect(await journal.complete(envelope, "web", 10)).toEqual(completed);
    expect(await journal.fail(envelope, "web", "late-failure")).toEqual(completed);
    expect(await journal.reject(envelope, "web", "late-rejection")).toEqual(completed);
    expect(journal.list()).toEqual([completed]);
  });

  it("persists digests rather than arguments and converts a pending restart to unknown", async () => {
    await withJournalDirectory(async (directory) => {
      const envelope = mutation();
      const beforeRestart = new MutationDispositionJournal("session-public-1", {
        directory,
        now: () => new Date("2026-08-13T00:00:01.000Z"),
      });
      await beforeRestart.admit(envelope, "web");

      const [file] = await readdir(directory);
      expect(file).toMatch(/^[a-f0-9]{64}\.jsonl$/);
      const persisted = await readFile(join(directory, file!), "utf8");
      expect(persisted).not.toContain("do-not-journal-body-marker");
      expect(persisted).not.toContain("do-not-journal-nested-marker");
      expect(persisted).toContain('"identityDigest"');

      const restarted = new MutationDispositionJournal("session-public-1", {
        directory,
        now: () => new Date("2026-08-13T00:00:02.000Z"),
      });
      await restarted.restore();
      expect(restarted.get("request-1")).toMatchObject({
        disposition: "unknown",
        reason: "owner-restart-outcome-unknown",
        requestId: "request-1",
        runtimeEpoch: "epoch-1",
        leaseGeneration: "lease-1",
      });
      expect(await restarted.admit(envelope, "web")).toMatchObject({ kind: "unknown", execute: false });

      const reconciled = await restarted.reconcile(envelope, "web", "completed", 11);
      expect(reconciled).toMatchObject({
        disposition: "completed",
        reason: "authoritative-state-confirms-completed",
        sequence: 11,
      });

      const restoredAgain = new MutationDispositionJournal("session-public-1", {
        directory,
        now: () => new Date("2026-08-13T00:00:03.000Z"),
      });
      await restoredAgain.restore();
      expect(await restoredAgain.admit(envelope, "web")).toMatchObject({
        kind: "known",
        execute: false,
        disposition: { disposition: "completed", sequence: 11 },
      });
    });
  });

  it("rejects cross-session envelopes and invalid reconciliation", async () => {
    const journal = new MutationDispositionJournal("session-public-1");
    await expect(journal.admit(mutation({ sessionHandle: "session-public-2" }), "web")).rejects.toThrow(/session/i);
    await expect(journal.reconcile(mutation(), "web", "not-applied")).rejects.toThrow(/unknown disposition/i);
  });
});
