import { describe, expect, it } from "vitest";
import {
  BoundedProjectionFrameDecoder,
  PROJECTION_EVENT_TYPE,
  PROJECTION_HELLO_TYPE,
  PROJECTION_RESET_TYPE,
  PROJECTION_SNAPSHOT_TYPE,
  ProjectionBootstrapAuthority,
  projectionChannelPaths,
  validateProjectionHello,
  validateProjectionServerFrame,
} from "../../src/runtime/web/projection-channel.js";
import { createRuntimeEvent, eventCursor, validateSnapshot } from "../../src/runtime/web/contracts.js";

function snapshot() {
  return validateSnapshot({
    schemaVersion: 1,
    type: "RuntimeSnapshotV1",
    runtimeEpoch: "epoch-projection-1",
    sessionHandle: "session-public-1",
    lastSequence: 0,
    cursor: eventCursor("epoch-projection-1", 0),
    createdAt: "2026-08-13T00:00:00.000Z",
    state: "idle",
    writer: { state: "owned", owner: "tui", generation: "generation-tui-1", activeTurn: false },
    capabilities: { "session.observe": true },
    projection: { surface: "tui", readOnlyObserver: true },
  });
}

describe("owner-only TUI projection protocol", () => {
  it("consumes each bootstrap identity once and fails closed after spoofing or expiry", () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    const authority = new ProjectionBootstrapAuthority(() => now, 1_000);

    const first = authority.issue();
    expect(authority.consume(first)).toBe(true);
    expect(authority.consume(first)).toBe(false);

    const spoofed = authority.issue();
    expect(authority.consume(`${spoofed.slice(0, -1)}x`)).toBe(false);
    expect(authority.consume(spoofed)).toBe(false);

    const expired = authority.issue();
    now.setTime(now.getTime() + 1_001);
    expect(authority.consume(expired)).toBe(false);
  });

  it("accepts one bounded hello frame and rejects extra, malformed, and oversized input", () => {
    const decoder = new BoundedProjectionFrameDecoder(512);
    const hello = {
      schemaVersion: 1,
      type: PROJECTION_HELLO_TYPE,
      clientId: "observer-1",
      bootstrapIdentity: "a".repeat(43),
    };
    expect(decoder.push(Buffer.from(`${JSON.stringify(hello)}\n`))).toEqual([hello]);
    expect(validateProjectionHello(hello)).toEqual(hello);
    expect(() => validateProjectionHello({ ...hello, mutation: "prompt.submit" })).toThrow(/ProjectionHelloV1/);
    expect(() => new BoundedProjectionFrameDecoder(512).push(Buffer.from("not-json\n"))).toThrow(/malformed/);
    expect(() => new BoundedProjectionFrameDecoder(256).push(Buffer.from("x".repeat(257)))).toThrow(/bound/);
  });

  it("validates only read-only snapshot, event, and reset server frames", () => {
    const current = snapshot();
    expect(validateProjectionServerFrame({
      schemaVersion: 1,
      type: PROJECTION_SNAPSHOT_TYPE,
      readOnly: true,
      snapshot: current,
    })).toMatchObject({ type: PROJECTION_SNAPSHOT_TYPE, readOnly: true, snapshot: current });

    const event = createRuntimeEvent({
      runtimeEpoch: current.runtimeEpoch,
      sessionHandle: current.sessionHandle,
      sequence: 1,
      source: "tui",
      eventType: "state",
      payload: { state: "running" },
      emittedAt: "2026-08-13T00:00:01.000Z",
      leaseGeneration: "generation-tui-1",
    });
    expect(validateProjectionServerFrame({ schemaVersion: 1, type: PROJECTION_EVENT_TYPE, event }))
      .toMatchObject({ type: PROJECTION_EVENT_TYPE, event });
    expect(validateProjectionServerFrame({
      schemaVersion: 1,
      type: PROJECTION_RESET_TYPE,
      reason: "gap",
      latestCursor: event.cursor,
      snapshotRequired: true,
    })).toMatchObject({ type: PROJECTION_RESET_TYPE, reason: "gap", snapshotRequired: true });

    expect(() => validateProjectionServerFrame({
      schemaVersion: 1,
      type: "ProjectionMutationV1",
      command: "prompt.submit",
    })).toThrow(/projection server frame/);
    expect(() => validateProjectionServerFrame({
      schemaVersion: 1,
      type: PROJECTION_SNAPSHOT_TYPE,
      readOnly: false,
      snapshot: current,
    })).toThrow(/projection server frame/);
  });

  it("uses digested discovery names and a short owner-local endpoint root", () => {
    const paths = projectionChannelPaths("/tmp/aili-runtime-fixture", "private/pi/session/path.jsonl");
    const serialized = JSON.stringify(paths);
    expect(serialized).not.toContain("private/pi/session/path.jsonl");
    expect(paths.sessionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(paths.discoveryPath).toContain(paths.sessionDigest);
    expect(paths.bootstrapPath).toContain(paths.sessionDigest);
    expect(paths.endpointDirectory).not.toContain(paths.sessionDigest);
  });
});
