import { describe, expect, it } from "vitest";
import {
  planCompactCommand,
  type CompactCommandInputs,
} from "../../src/runtime/aili-compact/commands.js";
import type { CompactReferenceCatalog } from "../../src/runtime/aili-compact/references.js";

function inputs(overrides: Partial<CompactCommandInputs> = {}): CompactCommandInputs {
  const catalog: CompactReferenceCatalog = {
    catalogId: "catalog-safe",
    epochId: "root",
    messages: [
      { ref: "m000001", entryId: "raw-entry-one", epochId: "root", ordinal: 1, role: "user", atomEntryIds: ["raw-entry-one"] },
      { ref: "m000002", entryId: "raw-entry-two", epochId: "root", ordinal: 2, role: "assistant", atomEntryIds: ["raw-entry-two", "raw-entry-three"] },
      { ref: "m000003", entryId: "raw-entry-three", epochId: "root", ordinal: 3, role: "toolResult", atomEntryIds: ["raw-entry-two", "raw-entry-three"] },
    ],
    blocks: [
      { ref: "b000001", blockId: "raw-block-one", epochId: "root", ordinal: 1, active: true, queryOnly: false },
      { ref: "b000002", blockId: "raw-block-two", epochId: "root", ordinal: 2, active: false, queryOnly: false },
    ],
  };
  return {
    catalog,
    enabled: true,
    manualMode: false,
    autoCooling: true,
    candidates: [
      { ref: "m000001", compressible: false, role: "user", reasonCodes: ["recent-user", "INVALID RAW REASON"] },
      { ref: "m000002", compressible: true, role: "assistant" },
    ],
    activeRecaps: [{ blockRef: "b000001", topic: "topic", summary: "s".repeat(250) }],
    blockEligibility: [
      { blockRef: "b000001", active: true },
      { blockRef: "b000002", active: false, deactivationReason: "decompress" },
    ],
    policyReasons: [{ code: "recent-user", count: 2 }, { code: "not bounded!", count: 3 }],
    ...overrides,
  };
}

function expectUsage(args: string, overrides: Partial<CompactCommandInputs> = {}) {
  const plan = planCompactCommand(args, inputs(overrides));
  expect(plan.kind).toBe("usage");
  expect(plan.effects).toEqual({ append: false, request: false });
}

describe("AILI Compact pure command parser/planner", () => {
  it("plans bounded context defaults and redacts raw catalog identities", () => {
    const plan = planCompactCommand("", inputs());
    expect(plan.kind).toBe("context");
    if (plan.kind !== "context") return;
    expect(plan.output).toMatchObject({ catalogId: "catalog-safe", epochId: "root", offset: 0, limit: 32 });
    expect(plan.output.refs[1]).toEqual({ ref: "m000002", role: "assistant", atomRefs: ["m000002", "m000003"] });
    expect(plan.output.candidates).toEqual([
      { ref: "m000001", compressible: false, role: "user", reasonCodes: ["recent-user"] },
      { ref: "m000002", compressible: true, role: "assistant", reasonCodes: [] },
    ]);
    expect(plan.output.activeRecaps[0]?.summaryPreview).toHaveLength(201);
    expect(plan.output.policyReasons).toEqual([{ code: "recent-user", count: 2 }]);
    expect(JSON.stringify(plan.output)).not.toContain("raw-entry");
    expect(JSON.stringify(plan.output)).not.toContain("raw-block");
  });

  it("uses offset/limit paging and rejects invalid context bounds", () => {
    const plan = planCompactCommand("context 1 1", inputs());
    expect(plan.kind).toBe("context");
    if (plan.kind === "context") {
      expect(plan.output.refs.map((item) => item.ref)).toEqual(["m000002"]);
      expect(plan.output.nextOffset).toBe(2);
      expect(plan.output.candidates.map((item) => item.ref)).toEqual(["m000002"]);
    }
    for (const args of ["context -1", "context nope", "context 0 0", "context 0 65", "context 0 1 extra"]) expectUsage(args);
  });

  it("keeps stats distinct from context and sanitizes counters", () => {
    const plan = planCompactCommand("stats", inputs({
      stats: {
        session: { transactions: 4, blocks: 3, sourceChars: 900, projectedSavingChars: 500 },
        branch: { transactions: 2, blocks: 2, activeBlocks: 1, cooledResults: -1 },
        cache: { eligibleSamples: 5, cacheReads: 100, cacheWrites: 20 },
      },
    }));
    expect(plan.kind).toBe("stats");
    if (plan.kind === "stats") {
      expect(plan.output.scope).toBe("current-session/current-branch");
      expect(plan.output.branch.cooledResults).toBe(0);
      expect(plan.output).not.toHaveProperty("refs");
    }
    expectUsage("stats extra");
  });

  it("plans sweep default/range and no-effect usage for invalid limits", () => {
    expect(planCompactCommand("sweep", inputs())).toMatchObject({ kind: "sweep", limit: 8, candidateRefs: ["m000002"], effects: { append: true, request: false } });
    expect(planCompactCommand("sweep 16", inputs())).toMatchObject({ kind: "sweep", limit: 16 });
    expect(planCompactCommand("sweep", inputs({ candidates: [] }))).toMatchObject({ kind: "sweep", candidateRefs: [], effects: { append: false, request: false } });
    for (const args of ["sweep 0", "sweep 17", "sweep 1.5", "sweep 1 extra"]) expectUsage(args);
  });

  it("keeps manual mode independent from auto cooling", () => {
    expect(planCompactCommand("manual status", inputs({ manualMode: true, autoCooling: false }))).toEqual({
      kind: "manual-status",
      manualMode: true,
      autoCooling: false,
      effects: { append: false, request: false },
    });
    expect(planCompactCommand("manual on", inputs({ autoCooling: false }))).toEqual({
      kind: "manual-control",
      value: "on",
      effects: { append: true, request: false },
    });
    expectUsage("manual maybe");
  });

  it("plans one visible one-shot compress request and rejects busy/off/oversized focus", () => {
    expect(planCompactCommand("compress focus old tools", inputs())).toEqual({
      kind: "compress",
      focus: "focus old tools",
      trigger: "one-shot",
      effects: { append: true, request: true },
    });
    expectUsage("compress focus", { pendingManualTrigger: true });
    expectUsage("compress", { enabled: false });
    expectUsage(`compress ${"x".repeat(1_001)}`);
  });

  it("validates 1..16 all-or-nothing block refs and recompress eligibility", () => {
    expect(planCompactCommand("decompress b000001", inputs())).toMatchObject({
      kind: "decompress", catalogId: "catalog-safe", blockRefs: ["b000001"], effects: { append: true, request: false },
    });
    expect(planCompactCommand("recompress b000002", inputs())).toMatchObject({ kind: "recompress", blockRefs: ["b000002"] });
    for (const args of [
      "decompress",
      "decompress b1",
      "decompress b000002",
      "decompress b000001 b000001",
      `decompress ${Array.from({ length: 17 }, (_, index) => `b${String(index + 1).padStart(6, "0")}`).join(" ")}`,
      "recompress b000001",
    ]) expectUsage(args);
  });

  it("validates cache, prompt, controls and doctor arguments", () => {
    expect(planCompactCommand("cache", inputs()).kind).toBe("cache-status");
    expect(planCompactCommand("cache panel off", inputs())).toMatchObject({ kind: "cache-panel", value: "off" });
    expect(planCompactCommand("prompt", inputs()).kind).toBe("prompt-status");
    expect(planCompactCommand("prompt reload", inputs()).kind).toBe("prompt-reload");
    expect(planCompactCommand("restore-all", inputs())).toMatchObject({ kind: "control", value: "restore-all" });
    expect(planCompactCommand("doctor", inputs()).kind).toBe("doctor");
    for (const args of ["cache on", "cache panel maybe", "prompt now", "on extra", "off extra", "restore-all extra", "doctor verbose", "unknown"]) expectUsage(args);
  });
});
