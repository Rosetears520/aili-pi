import { describe, expect, it } from "vitest";
import {
  createRuntimeEvent,
  deriveOpaqueSessionHandle,
  eventCursor,
  isCurrentMutationDisposition,
  isCurrentRuntimeEvent,
  mutationIdentityDigest,
  parseEventCursor,
  validateMutationEnvelope,
  validateRuntimeEvent,
  validateSnapshot,
  type MutationDispositionV1,
  type MutationEnvelopeV1,
  type RuntimeSnapshotV1,
} from "../../src/runtime/web/contracts.js";

function snapshot(overrides: Partial<RuntimeSnapshotV1> = {}): RuntimeSnapshotV1 {
  return {
    schemaVersion: 1,
    type: "RuntimeSnapshotV1",
    runtimeEpoch: "epoch-7",
    sessionHandle: "session-public-7",
    lastSequence: 3,
    cursor: "epoch-7:3",
    createdAt: "2026-08-13T00:00:00.000Z",
    state: "running",
    writer: { state: "owned", owner: "web", generation: "lease-7", activeTurn: true },
    capabilities: { "prompt.submit": true, "session.read": true },
    projection: { status: "running" },
    ...overrides,
  };
}

function envelope(overrides: Partial<MutationEnvelopeV1> = {}): MutationEnvelopeV1 {
  return {
    schemaVersion: 1,
    type: "MutationEnvelopeV1",
    requestId: "request-7",
    clientId: "client-7",
    runtimeEpoch: "epoch-7",
    leaseGeneration: "lease-7",
    sessionHandle: "session-public-7",
    sessionLeaf: "session-internal-7",
    requestedAt: "2026-08-13T00:00:00.000Z",
    capability: "prompt.submit",
    commandType: "prompt.submit",
    arguments: { text: "hello", options: { dryRun: true } },
    ...overrides,
  };
}

function disposition(overrides: Partial<MutationDispositionV1> = {}): MutationDispositionV1 {
  return {
    schemaVersion: 1,
    requestId: "request-7",
    clientId: "client-7",
    runtimeEpoch: "epoch-7",
    leaseGeneration: "lease-7",
    sessionHandle: "session-public-7",
    capability: "prompt.submit",
    commandType: "prompt.submit",
    origin: "web",
    disposition: "completed",
    reason: "mutation-completed",
    at: "2026-08-13T00:00:01.000Z",
    identityDigest: "a".repeat(64),
    sequence: 4,
    ...overrides,
  };
}

describe("versioned web runtime contracts", () => {
  it("validates and freezes snapshots with epoch, handle, cursor, and writer generation", () => {
    const accepted = validateSnapshot(snapshot());
    expect(accepted).toMatchObject({
      runtimeEpoch: "epoch-7",
      sessionHandle: "session-public-7",
      lastSequence: 3,
      cursor: "epoch-7:3",
      writer: { state: "owned", owner: "web", generation: "lease-7", activeTurn: true },
    });
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(accepted.writer)).toBe(true);
    expect(Object.isFrozen(accepted.projection)).toBe(true);

    expect(() => validateSnapshot(snapshot({ cursor: "epoch-6:3" }))).toThrow(/invalid RuntimeSnapshotV1/);
    expect(() => validateSnapshot(snapshot({ writer: { state: "unowned", owner: "web", activeTurn: false } }))).toThrow(/invalid RuntimeSnapshotV1/);
  });

  it("requires every mutation routing and idempotency identity", () => {
    const accepted = validateMutationEnvelope(envelope());
    expect(accepted).toMatchObject({
      requestId: "request-7",
      clientId: "client-7",
      runtimeEpoch: "epoch-7",
      leaseGeneration: "lease-7",
      sessionHandle: "session-public-7",
      sessionLeaf: "session-internal-7",
    });
    expect(Object.isFrozen(accepted.arguments)).toBe(true);

    for (const field of ["requestId", "clientId", "runtimeEpoch", "leaseGeneration", "sessionHandle", "sessionLeaf"] as const) {
      expect(() => validateMutationEnvelope(envelope({ [field]: "" }))).toThrow(/invalid MutationEnvelopeV1/);
    }
    expect(() => validateMutationEnvelope(envelope({ capability: "Prompt Submit" }))).toThrow(/invalid MutationEnvelopeV1/);
    expect(() => validateMutationEnvelope(envelope({ arguments: { invalid: Number.NaN } }))).toThrow(/non-finite/);
  });

  it("binds mutation identity digests to client, request, epoch, lease, command, arguments, and origin", () => {
    const base = envelope({ arguments: { b: 2, a: 1 } });
    const first = mutationIdentityDigest(base, "web");
    const reordered = mutationIdentityDigest(envelope({ arguments: { a: 1, b: 2 } }), "web");
    expect(first).toBe(reordered);
    expect(first).toMatch(/^[a-f0-9]{64}$/);

    const variants: MutationEnvelopeV1[] = [
      { ...base, requestId: "request-8" },
      { ...base, clientId: "client-8" },
      { ...base, runtimeEpoch: "epoch-8" },
      { ...base, leaseGeneration: "lease-8" },
      { ...base, sessionHandle: "session-public-8" },
      { ...base, sessionLeaf: "session-internal-8" },
      { ...base, capability: "prompt.cancel" },
      { ...base, commandType: "prompt.cancel" },
      { ...base, arguments: { text: "different" } },
    ];
    for (const variant of variants) expect(mutationIdentityDigest(variant, "web")).not.toBe(first);
    expect(mutationIdentityDigest(base, "tui")).not.toBe(first);
  });

  it("accepts only current event and disposition epochs, handles, sequences, and lease generations", () => {
    const current = validateSnapshot(snapshot());
    const event = createRuntimeEvent({
      runtimeEpoch: "epoch-7",
      sessionHandle: "session-public-7",
      sequence: 4,
      source: "runtime",
      eventType: "mutation",
      payload: { status: "completed" },
      leaseGeneration: "lease-7",
      requestId: "request-7",
      capability: "prompt.submit",
      runId: "run-7",
      emittedAt: "2026-08-13T00:00:01.000Z",
    });
    expect(event.cursor).toBe("epoch-7:4");
    expect(isCurrentRuntimeEvent(current, event)).toBe(true);
    expect(isCurrentRuntimeEvent(current, { ...event, runtimeEpoch: "epoch-8", cursor: "epoch-8:4" })).toBe(false);
    expect(isCurrentRuntimeEvent(current, { ...event, sessionHandle: "session-public-8" })).toBe(false);
    expect(isCurrentRuntimeEvent(current, { ...event, sequence: 3, cursor: "epoch-7:3" })).toBe(false);
    expect(isCurrentRuntimeEvent(current, { ...event, leaseGeneration: "lease-8" })).toBe(false);

    expect(isCurrentMutationDisposition(current, disposition())).toBe(true);
    expect(isCurrentMutationDisposition(current, disposition({ runtimeEpoch: "epoch-8" }))).toBe(false);
    expect(isCurrentMutationDisposition(current, disposition({ sessionHandle: "session-public-8" }))).toBe(false);
    expect(isCurrentMutationDisposition(current, disposition({ leaseGeneration: "lease-8" }))).toBe(false);
  });

  it("round-trips bounded cursors and rejects malformed or unsafe cursor values", () => {
    expect(eventCursor("epoch-7", 42)).toBe("epoch-7:42");
    expect(parseEventCursor("epoch-7:42")).toEqual({ runtimeEpoch: "epoch-7", sequence: 42 });
    for (const cursor of ["", "epoch-7", "epoch with spaces:1", "epoch-7:-1", "epoch-7:1.2", "epoch-7:Infinity"]) {
      expect(parseEventCursor(cursor)).toBeUndefined();
    }
  });

  it("rejects protected public projection keys while allowing bounded inbound arguments", () => {
    const protectedKey = ["pass", "word"].join("");
    expect(() => validateRuntimeEvent({
      ...createRuntimeEvent({
        runtimeEpoch: "epoch-7",
        sessionHandle: "session-public-7",
        sequence: 4,
        source: "runtime",
        eventType: "message",
        payload: { status: "ok" },
      }),
      payload: { [protectedKey]: "must-not-project" },
    })).toThrow(/protected data/);

    expect(validateMutationEnvelope(envelope({ arguments: { [protectedKey]: "inbound-only" } })).arguments).toEqual({
      [protectedKey]: "inbound-only",
    });
  });

  it("derives stable opaque public handles without disclosing the internal identity", () => {
    const first = deriveOpaqueSessionHandle("internal-jsonl-identity", "runtime-local-salt");
    expect(first).toBe(deriveOpaqueSessionHandle("internal-jsonl-identity", "runtime-local-salt"));
    expect(first).not.toBe(deriveOpaqueSessionHandle("internal-jsonl-identity", "different-salt"));
    expect(first).toMatch(/^session-[A-Za-z0-9_-]{32}$/);
    expect(first).not.toContain("internal-jsonl-identity");
  });
});
