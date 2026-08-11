import { afterEach, describe, expect, it } from "vitest";

import {
  assertLiveCaptureClaims,
  classifyRealOverflowAttempt,
  compactLiveCaptureBudget,
  executeLiveCaptureLifecycle,
  observePersistentBoundaryTask,
  observePersistentSandboxTask,
  PERSISTENT_BOUNDARY_TASK_TEXT,
  observePersistentTask,
  PERSISTENT_SANDBOX_MARKER_BYTES,
  PERSISTENT_SANDBOX_MARKER_PATH,
  PERSISTENT_SANDBOX_TASK_TEXT,
  selectCompactLiveInput,
} from "../../scripts/live-release-support.js";

const ENV_KEY = "AILI_LIVE_RELEASE_ENV_FIXTURE";

afterEach(() => {
  delete process.env[ENV_KEY];
});

function call(id = "task-1", async = false) {
  return { role: "assistant", content: [{ type: "toolCall", id, name: "task", arguments: { task: "fixture", async } }] };
}

function result(toolCallId = "task-1", status = "completed") {
  return {
    role: "toolResult", toolName: "task", toolCallId, isError: false,
    details: { results: [{
      status, agentId: "child", jobId: "job-1", turnId: "turn-1",
      outputRef: "agent://child", historyRef: "history://child",
      lifecycle: { agent: "idle", job: "completed", turn: "completed" },
    }] },
  };
}

function sandboxCall(overrides: Record<string, unknown> = {}) {
  return {
    role: "assistant",
    content: [{
      type: "toolCall", id: "task-1", name: "task",
      arguments: {
        task: PERSISTENT_SANDBOX_TASK_TEXT,
        agent: "general",
        async: false,
        tools: ["bash"],
        workspace: "shared",
        writeScope: { paths: [PERSISTENT_SANDBOX_MARKER_PATH], resources: [] },
        ...overrides,
      },
    }],
  };
}

function boundaryCall(overrides: Record<string, unknown> = {}) {
  return {
    role: "assistant",
    content: [{
      type: "toolCall", id: "task-1", name: "task",
      arguments: {
        task: PERSISTENT_BOUNDARY_TASK_TEXT,
        agent: "general",
        async: false,
        tools: [],
        workspace: "shared",
        writeScope: { paths: [], resources: [] },
        ...overrides,
      },
    }],
  };
}

function captureBundle(overrides: { provider?: string; transport?: string; ordering?: string; boundary?: string } = {}) {
  return {
    persistentArtifact: {
      status: "NON_PASS",
      probes: [
        { id: "provider-turn", status: overrides.provider ?? "PASS" },
      ],
    },
    compactArtifact: {
      status: "NON_PASS",
      representative: {
        transport: { status: overrides.transport ?? "PASS" },
        extensionOrdering: {
          before: { status: overrides.ordering ?? "PASS" },
          after: { status: overrides.ordering ?? "PASS" },
        },
        parentPersistentChild: { status: overrides.boundary ?? "PASS" },
      },
    },
  };
}

describe("live release support", () => {
  it("selects real-overflow input only within the explicit bounded character budget", () => {
    const conservative = compactLiveCaptureBudget();
    expect(conservative).toEqual({ maxInputCharacters: 600_000, source: "conservative-default" });
    expect(selectCompactLiveInput(600_000, conservative)).toEqual({
      status: "WITHIN_BUDGET", requiredInputCharacters: 600_000, maxInputCharacters: 600_000,
    });
    expect(selectCompactLiveInput(600_001, conservative)).toEqual({
      status: "NON_PASS", reason: "capture-input-budget-exceeded",
      requiredInputCharacters: 600_001, maxInputCharacters: 600_000,
    });
    expect(compactLiveCaptureBudget("750000")).toEqual({
      maxInputCharacters: 750_000, source: "explicit-operation-budget",
    });
    expect(() => compactLiveCaptureBudget("unbounded")).toThrow(/exact positive integer/);
  });

  it.each([
    ["missing result", [call()]],
    ["mismatched result", [call(), result("task-other")]],
    ["async true", [call("task-1", true), result()]],
    ["duplicate calls", [call(), call("task-2"), result()]],
  ])("keeps Persistent Agent observation NON_PASS for %s", (_name, messages) => {
    expect(observePersistentTask(messages)).toMatchObject({ status: "NON_PASS" });
  });

  it("accepts exactly one matching synchronous completed persistent child result", () => {
    expect(observePersistentTask([call(), result()])).toEqual({
      status: "PASS", callId: "task-1", childStatus: "completed", agentId: "child", jobId: "job-1", turnId: "turn-1",
    });
  });

  it("requires exact no-tool parent arguments for the real provider lifecycle boundary", () => {
    expect(observePersistentBoundaryTask([boundaryCall(), result()])).toEqual({
      status: "PASS", callId: "task-1", childStatus: "completed", agentId: "child", jobId: "job-1", turnId: "turn-1",
      taskArgumentsExact: true, zeroParentBashCalls: true, childLifecycleCompleted: true,
    });
    expect(observePersistentBoundaryTask([boundaryCall({ tools: ["bash"] }), result()])).toMatchObject({
      status: "NON_PASS", reason: "task-arguments-not-exact",
    });
  });

  it("rejects invented nested output/history references", () => {
    const malformed = result();
    const details = malformed.details as { results: Array<Record<string, unknown>> };
    details.results[0]!.outputRef = "agent://child/job-1/turn-1/output";
    details.results[0]!.historyRef = "history://child/job-1/turn-1";
    expect(observePersistentTask([call(), malformed])).toMatchObject({
      status: "NON_PASS",
      reason: "persistent-child-not-completed",
    });
  });

  it("does not treat a sandbox marker as child completion without the matching task result", () => {
    const markerBody = "CHILD_SANDBOX_OK";
    expect(markerBody).toBe("CHILD_SANDBOX_OK");
    expect(observePersistentTask([call()])).toMatchObject({ status: "NON_PASS", reason: "matching-task-result-missing" });
  });

  it("requires exact sandbox task arguments, zero parent Bash, child completion, and exact marker bytes", () => {
    expect(observePersistentSandboxTask([sandboxCall(), result()], PERSISTENT_SANDBOX_MARKER_BYTES)).toEqual({
      status: "PASS", callId: "task-1", childStatus: "completed", agentId: "child", jobId: "job-1", turnId: "turn-1",
      taskArgumentsExact: true, zeroParentBashCalls: true, childLifecycleCompleted: true, markerExact: true,
      childBashInspection: "Unverified", childBashInspectionReason: "child-history-not-exposed-in-parent-task-result",
    });
  });

  it.each([
    ["prose-only child completion", [{ role: "assistant", content: [{ type: "text", text: "completed" }] }], PERSISTENT_SANDBOX_MARKER_BYTES, "task-call-missing"],
    ["wrong task arguments", [sandboxCall({ workspace: "isolated" }), result()], PERSISTENT_SANDBOX_MARKER_BYTES, "task-arguments-not-exact"],
    ["missing marker", [sandboxCall(), result()], "", "sandbox-marker-missing"],
    ["wrong marker bytes", [sandboxCall(), result()], "CHILD_SANDBOX_NOT_OK", "sandbox-marker-bytes-mismatch"],
    ["parent-created marker", [sandboxCall(), { role: "assistant", content: [{ type: "toolCall", id: "bash-parent", name: "bash", arguments: { command: "write marker" } }] }, result()], PERSISTENT_SANDBOX_MARKER_BYTES, "parent-bash-call-observed"],
  ])("keeps sandbox observation NON_PASS for %s", (_name, messages, marker, reason) => {
    expect(observePersistentSandboxTask(messages, marker)).toMatchObject({ status: "NON_PASS", reason });
  });

  it("classifies message_end provider context errors separately from preflight and missing-message failures", () => {
    const overflow = { code: "provider-overflow", recognized: true, errorCode: "context-length-exceeded", thresholdCompactedFirst: false } as const;
    expect(classifyRealOverflowAttempt([overflow], 0, [], true)).toEqual({ status: "PROVIDER_CONTEXT_ERROR", source: "message-end" });
    expect(classifyRealOverflowAttempt([], 0, [], true)).toEqual({ status: "NON_PASS", reason: "overflow-preflight-or-stage-failed", source: "none" });
    expect(classifyRealOverflowAttempt([], 0, [], false)).toEqual({ status: "NON_PASS", reason: "overflow-message-end-missing", source: "none" });
    expect(classifyRealOverflowAttempt([], 0, [{ role: "assistant", stopReason: "error", errorMessage: "context_length_exceeded" }], true)).toMatchObject({
      status: "PROVIDER_CONTEXT_ERROR", source: "assistant-fallback", fallbackEvent: overflow,
    });
    expect(classifyRealOverflowAttempt([{ code: "provider-call", turn: "user", succeeded: false }], 0, [], true)).toEqual({
      status: "NON_PASS", reason: "provider-context-error-not-induced", source: "message-end",
    });
  });

  it("requires only the real-provider transport, ordering, and persistent-child boundary", () => {
    expect(() => assertLiveCaptureClaims(captureBundle())).not.toThrow();
    expect(() => assertLiveCaptureClaims(captureBundle({ provider: "NON_PASS", transport: "NON_PASS", ordering: "NON_PASS", boundary: "NON_PASS" }))).toThrow(
      "capture-required-claims-missing:persistent-provider-turn,official-pi-transport,controlled-extension-order,parent-persistent-child-lifecycle",
    );
  });

  it("restores process environment independently and never publishes PASS after cleanup failure", async () => {
    process.env[ENV_KEY] = "prior";
    let publishedStatus: unknown;
    const result = await executeLiveCaptureLifecycle({
      environment: { [ENV_KEY]: "temporary" },
      capture: async () => {
        expect(process.env[ENV_KEY]).toBe("temporary");
        return { persistentArtifact: { status: "PASS" }, compactArtifact: { status: "PASS" } };
      },
      failure: () => ({ persistentArtifact: { status: "NON_PASS" }, compactArtifact: { status: "NON_PASS" } }),
      cleanup: async () => { throw new Error("injected cleanup failure"); },
      verifyCleanup: async () => true,
      downgradeForCleanupFailure: (bundle) => ({
        persistentArtifact: { ...bundle.persistentArtifact, status: "NON_PASS" },
        compactArtifact: { ...bundle.compactArtifact, status: "NON_PASS" },
      }),
      publish: async (bundle) => { publishedStatus = bundle.persistentArtifact.status; },
    });
    expect(process.env[ENV_KEY]).toBe("prior");
    expect(result.persistentArtifact.status).toBe("NON_PASS");
    expect(result.compactArtifact.status).toBe("NON_PASS");
    expect(publishedStatus).toBe("NON_PASS");
  });

  it("publishes a staged PASS only after verified cleanup", async () => {
    const order: string[] = [];
    const result = await executeLiveCaptureLifecycle({
      environment: { [ENV_KEY]: "temporary" },
      capture: async () => { order.push("capture"); return { persistentArtifact: { status: "PASS" }, compactArtifact: { status: "PASS" } }; },
      failure: () => ({ persistentArtifact: { status: "NON_PASS" }, compactArtifact: { status: "NON_PASS" } }),
      cleanup: async () => { order.push("cleanup"); },
      verifyCleanup: async () => { order.push("verify-cleanup"); return true; },
      downgradeForCleanupFailure: (bundle) => bundle,
      publish: async () => { order.push("publish"); },
    });
    expect(order).toEqual(["capture", "cleanup", "verify-cleanup", "publish"]);
    expect(result.persistentArtifact.status).toBe("PASS");
    expect(process.env[ENV_KEY]).toBeUndefined();
  });

  it("publishes and verifies cleanup before a missing capture-time claim fails the command", async () => {
    const order: string[] = [];
    await expect(executeLiveCaptureLifecycle({
      environment: { [ENV_KEY]: "temporary" },
        capture: async () => captureBundle({ transport: "NON_PASS" }),
      failure: () => captureBundle({ provider: "NON_PASS" }),
      cleanup: async () => { order.push("cleanup"); },
      verifyCleanup: async () => { order.push("verify-cleanup"); return true; },
      downgradeForCleanupFailure: (bundle) => bundle,
      publish: async () => { order.push("publish"); },
      assertPublished: (bundle) => { order.push("assert"); assertLiveCaptureClaims(bundle); },
    })).rejects.toThrow("capture-required-claims-missing:official-pi-transport");
    expect(order).toEqual(["cleanup", "verify-cleanup", "publish", "assert"]);
    expect(process.env[ENV_KEY]).toBeUndefined();
  });
});
