import { describe, expect, it } from "vitest";
import {
  evaluateToolResultCooling,
  resolveToolCoolingPolicy,
  resultObservationIdentityDigest,
  type ResultObservationIdentity,
} from "../../src/runtime/aili-compact/cooling-profiles.js";

const identity: ResultObservationIdentity = {
  sessionId: "s", branchLeafId: "leaf", epochId: "root", callEntryId: "call-entry", callId: "call",
  toolName: "read", resultEntryId: "result", resultBodyDigest: "a".repeat(64), providerInputIdentity: "b".repeat(64), settledRequestId: "request",
};
const observation = (turn: string) => ({ identity, successful: true, assistantTurnId: turn });

describe("AILI Compact exact result-only cooling", () => {
  it("uses exact fail-safe profiles and rejects unsafe overrides", () => {
    expect(resolveToolCoolingPolicy("read").policy).toMatchObject({ profile: "retrieval", automatic: true, minObservedTurns: 2 });
    expect(resolveToolCoolingPolicy("unknown-tool").policy).toMatchObject({ profile: "unknown", automatic: false });
    expect(resolveToolCoolingPolicy("aili_compact", { toolName: "aili_compact", profile: "retrieval", automatic: true })).toMatchObject({
      policy: { profile: "protocol-control", automatic: false }, diagnostics: ["cooling-override-protocol-control"],
    });
    expect(resolveToolCoolingPolicy("read", { toolName: "r*", profile: "retrieval" }).diagnostics).toEqual(["cooling-override-invalid-exact-name"]);
  });

  it("requires successful exact later-request observations and keeps latest equal raw", () => {
    const base = { identity, isError: false, isComplete: true, hasBinaryOrSecret: false, inCurrentTurn: false, observations: [observation("t1"), observation("t2")] };
    expect(evaluateToolResultCooling({ ...base, observations: [observation("t1")] })).toMatchObject({ eligible: false, code: "result-not-observed" });
    expect(evaluateToolResultCooling({ ...base, latestEqualResultEntryId: "result" })).toMatchObject({ eligible: false, code: "result-latest-equal-kept" });
    expect(evaluateToolResultCooling(base)).toMatchObject({ eligible: true, profile: "retrieval", observationCount: 2 });
  });

  it("protects durable refs and unresolved errors permanently", () => {
    const errorIdentity = { ...identity, toolName: "bash" };
    const observations = Array.from({ length: 5 }, (_, index) => ({ identity: errorIdentity, successful: true, assistantTurnId: `t${index}` }));
    const base = { identity: errorIdentity, isError: true, isComplete: true, hasBinaryOrSecret: false, inCurrentTurn: false, observations };
    expect(evaluateToolResultCooling(base)).toMatchObject({ eligible: false, code: "error-unresolved" });
    expect(evaluateToolResultCooling({ ...base, durableRefs: ["agent://durable"] })).toMatchObject({ eligible: false, code: "result-durable-reference" });
    expect(evaluateToolResultCooling({ ...base, resolution: { resultIdentityDigest: resultObservationIdentityDigest(errorIdentity), assistantTurnId: "resolved", status: "resolved" } })).toMatchObject({ eligible: true });
  });
});
