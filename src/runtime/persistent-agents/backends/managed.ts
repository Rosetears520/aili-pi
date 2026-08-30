import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { TaskExecutionOutput, TaskExecutorInput } from "../sub-coordinator.js";
import type { CoordinatorJournal } from "../storage.js";
import type { ExecutionBackend } from "./registry.js";
import {
  MANAGED_BACKEND_CAPABILITIES,
  MANAGED_DRIVER_CAPABILITIES,
  type RunRecord,
} from "./types.js";

export interface ManagedExecutionBackendOptions {
  journal: CoordinatorJournal;
  /** Allocates or reopens the official Pi child SessionManager for one agent. */
  childManager: (agentId: string) => Promise<SessionManager>;
  /** Fallible turn preflight executed after the child session exists so its
   *  failure can be recorded as non-provider runtime evidence. */
  preflight?: (input: TaskExecutorInput) => void | Promise<void>;
  /** The in-process turn executor (production controller). */
  execute: (input: TaskExecutorInput & { sessionManager: SessionManager }) => Promise<TaskExecutionOutput>;
  clock?: () => Date;
}

/**
 * The existing in-process execution wrapped behind the ExecutionBackend seam
 * (ADR-001). Phase 1 moves the previous runtime wrapper — child-session
 * allocation, fallible preflight with durable failure evidence, and the
 * production controller call — into this adapter unchanged, and additionally
 * records one Run per executed turn.
 */
export class ManagedExecutionBackend implements ExecutionBackend {
  readonly kind = "managed" as const;
  readonly driver = "pi-sdk" as const;
  readonly capabilities = MANAGED_BACKEND_CAPABILITIES;
  readonly driverCapabilities = MANAGED_DRIVER_CAPABILITIES;
  private readonly clock: () => Date;

  constructor(private readonly options: ManagedExecutionBackendOptions) {
    this.clock = options.clock ?? (() => new Date());
  }

  async execute(input: TaskExecutorInput): Promise<TaskExecutionOutput> {
    const now = () => this.clock().toISOString();
    const runId = await this.options.journal.appendAllocatedRun((allocated) => ({
      agentId: input.agentId,
      jobId: input.jobId,
      turnId: input.turnId,
      record: {
        schemaVersion: 1,
        runId: allocated,
        agentId: input.agentId,
        jobId: input.jobId,
        turnId: input.turnId,
        backend: "managed",
        driver: "pi-sdk",
        lifecycle: "allocated",
        controlMode: "aili",
        createdAt: now(),
        updatedAt: now(),
      } satisfies RunRecord,
    }));
    const setLifecycle = (from: RunRecord["lifecycle"], to: RunRecord["lifecycle"], extra: Record<string, unknown> = {}) =>
      this.options.journal.append({ kind: "run.state", agentId: input.agentId, jobId: input.jobId, turnId: input.turnId, runId, payload: { from, to, ...extra } });
    await setLifecycle("allocated", "starting");
    // Allocate and register the exact child history before any fallible
    // preflight. If preflight fails, persist that failure as non-provider
    // runtime evidence so official Pi materializes the deferred JSONL.
    const manager = await this.options.childManager(input.agentId);
    try {
      await this.options.preflight?.(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      manager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: `Agent preflight failed before execution: ${message}` }],
        timestamp: Date.now(),
        api: "aili-runtime",
        provider: "aili-runtime",
        model: "preflight",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "error",
        errorMessage: message,
      } as never);
      await setLifecycle("starting", "failed", { failure: message }).catch(() => undefined);
      throw error;
    }
    await setLifecycle("starting", "live");
    let output: TaskExecutionOutput;
    try {
      output = await this.options.execute({ ...input, sessionManager: manager });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await setLifecycle("live", "failed", { failure: message }).catch(() => undefined);
      throw error;
    }
    await setLifecycle("live", "stopping");
    await setLifecycle("stopping", "stopped", { stopReason: output.status === "failed" ? "failed" : "completed" });
    return { ...output, backend: "managed", driver: "pi-sdk", runId };
  }
}
