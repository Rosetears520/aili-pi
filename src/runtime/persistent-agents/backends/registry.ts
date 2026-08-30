import type { TaskExecutionOutput, TaskExecutorInput } from "../sub-coordinator.js";
import {
  BACKEND_DRIVERS,
  isExecutionBackendKind,
  type AgentDriverKind,
  type BackendCapabilities,
  type DriverCapabilities,
  type ExecutionBackendKind,
} from "./types.js";

/** Raised when the resolved backend is not available in this build. Never
 *  triggers silent substitution (ADR-005). */
export class ExecutionBackendUnavailableError extends Error {
  constructor(
    readonly kind: string,
    readonly availableKinds: readonly ExecutionBackendKind[],
  ) {
    super(
      `execution backend '${kind}' is not available${availableKinds.length > 0 ? ` (available: ${availableKinds.join(", ")})` : " (none registered)"}; refusing to fall back to another backend`,
    );
    this.name = "ExecutionBackendUnavailableError";
  }
}

/**
 * Phase-1 execution seam: the coordination layer stops creating child sessions
 * itself and hands each allocated turn to the resolved backend (ADR-001).
 * Later phases extend this interface (createAgent/restoreAgent, submitTurn,
 * steer, reconcile, inspection) without changing managed semantics.
 */
export interface ExecutionBackend {
  readonly kind: ExecutionBackendKind;
  readonly driver: AgentDriverKind;
  readonly capabilities: Readonly<BackendCapabilities>;
  readonly driverCapabilities: Readonly<DriverCapabilities>;
  execute(input: TaskExecutorInput): Promise<TaskExecutionOutput>;
}

export class ExecutionBackendRegistry {
  private readonly backends = new Map<ExecutionBackendKind, ExecutionBackend>();

  register(backend: ExecutionBackend): void {
    if (!isExecutionBackendKind(backend.kind)) throw new Error(`unknown execution backend kind: ${String(backend.kind)}`);
    if (backend.driver !== BACKEND_DRIVERS[backend.kind]) {
      throw new Error(`${backend.kind}: driver ${backend.driver} is not a formally supported pairing (expected ${BACKEND_DRIVERS[backend.kind]})`);
    }
    if (this.backends.has(backend.kind)) throw new Error(`${backend.kind}: duplicate execution backend registration`);
    this.backends.set(backend.kind, backend);
  }

  has(kind: string): boolean {
    return this.backends.has(kind as ExecutionBackendKind);
  }

  kinds(): ExecutionBackendKind[] {
    return [...this.backends.keys()];
  }

  /** Resolves or fails explicitly. Callers must surface this error; it never
   *  triggers a fallback to another backend. */
  require(kind: string): ExecutionBackend {
    const backend = this.backends.get(kind as ExecutionBackendKind);
    if (!backend) throw new ExecutionBackendUnavailableError(kind, this.kinds());
    return backend;
  }
}
