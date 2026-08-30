/**
 * Execution-backend domain vocabulary shared by the coordination layer,
 * storage, and backend adapters. This module MUST stay dependency-free so
 * `types.ts` can import it without creating a cycle.
 */

export type ExecutionBackendKind = "managed" | "herdr";
export type AgentDriverKind = "pi-sdk" | "pi-cli" | "external-cli";

export const DEFAULT_EXECUTION_BACKEND: ExecutionBackendKind = "managed";

export const EXECUTION_BACKEND_KINDS: readonly ExecutionBackendKind[] = ["managed", "herdr"];
export const AGENT_DRIVER_KINDS: readonly AgentDriverKind[] = ["pi-sdk", "pi-cli", "external-cli"];

/** Default driver used by each registered backend adapter. A Herdr Run may
 * instead use the package-owned direct external-CLI driver. */
export const BACKEND_DRIVERS: Readonly<Record<ExecutionBackendKind, AgentDriverKind>> = Object.freeze({
  managed: "pi-sdk",
  herdr: "pi-cli",
});

export function isBackendDriverPair(backend: ExecutionBackendKind, driver: AgentDriverKind): boolean {
  return driver === BACKEND_DRIVERS[backend] || (backend === "herdr" && driver === "external-cli");
}

export function isExecutionBackendKind(value: unknown): value is ExecutionBackendKind {
  return typeof value === "string" && (EXECUTION_BACKEND_KINDS as readonly string[]).includes(value);
}

export function isAgentDriverKind(value: unknown): value is AgentDriverKind {
  return typeof value === "string" && (AGENT_DRIVER_KINDS as readonly string[]).includes(value);
}

/** Read-time interpretation of durable agent records: absence of a backend
 *  field means the record predates backend routing and ran in-process. An
 *  explicitly recorded but unknown backend is corruption and fails closed. */
export function resolveAgentBackend(record: { backend?: unknown }): ExecutionBackendKind {
  if (record.backend === undefined) return DEFAULT_EXECUTION_BACKEND;
  if (!isExecutionBackendKind(record.backend)) {
    throw new Error(`unknown execution backend on Agent record: ${String(record.backend)}`);
  }
  return record.backend;
}

export function resolveAgentDriver(record: { backend?: unknown; driver?: unknown }): AgentDriverKind {
  if (isAgentDriverKind(record.driver)) return record.driver;
  return BACKEND_DRIVERS[resolveAgentBackend(record)];
}

export type RunLifecycle =
  | "allocated"
  | "starting"
  | "live"
  | "stopping"
  | "stopped"
  | "lost"
  | "failed";

export const RUN_TRANSITIONS: Readonly<Record<RunLifecycle, ReadonlySet<RunLifecycle>>> = Object.freeze({
  allocated: new Set<RunLifecycle>(["starting", "failed"]),
  starting: new Set<RunLifecycle>(["live", "failed"]),
  live: new Set<RunLifecycle>(["stopping", "lost", "failed"]),
  stopping: new Set<RunLifecycle>(["stopped", "failed"]),
  stopped: new Set<RunLifecycle>([]),
  lost: new Set<RunLifecycle>([]),
  failed: new Set<RunLifecycle>([]),
});

export type RunControlMode = "aili" | "human" | "mixed";

/**
 * One process incarnation of an agent (ADR-002). Identity fields (AgentId,
 * DriverSessionId) survive across runs; pane/process addresses live only in
 * the backend-specific reference and may change within a run's lifetime.
 */
export interface RunRecord {
  schemaVersion: 1;
  runId: string;
  agentId: string;
  jobId?: string;
  turnId?: string;
  backend: ExecutionBackendKind;
  driver: AgentDriverKind;
  lifecycle: RunLifecycle;
  driverSessionId?: string;
  loadoutHash?: string;
  controlMode: RunControlMode;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  stopReason?: string;
  failure?: string;
  metadata?: Record<string, unknown>;
}

/** Capability a driver adapter must prove before a backend may execute work
 *  that depends on it (ADR-004). Unproven capabilities fail at preflight. */
export interface DriverCapabilities {
  structuredEvents: boolean;
  exactTurnCompletion: boolean;
  exactSessionResume: boolean;
  safeBoundarySteer: boolean;
  toolPolicy: boolean;
  permissionBroker: boolean;
  sandbox: boolean;
  formalResult: boolean;
  contextFork: boolean;
  manualTakeover: boolean;
}

/** Backend-level capability surface (orthogonal to driver capabilities). */
export interface BackendCapabilities {
  /** Whether the backend exposes externally visible terminal surfaces. */
  executionSurfaces: boolean;
  /** Whether backend runs survive parent process exit. */
  survivesParentRestart: boolean;
}

export const MANAGED_DRIVER_CAPABILITIES: Readonly<DriverCapabilities> = Object.freeze({
  structuredEvents: true,
  exactTurnCompletion: true,
  exactSessionResume: true,
  safeBoundarySteer: true,
  toolPolicy: true,
  permissionBroker: true,
  sandbox: true,
  formalResult: true,
  contextFork: false,
  manualTakeover: false,
});

export const MANAGED_BACKEND_CAPABILITIES: Readonly<BackendCapabilities> = Object.freeze({
  executionSurfaces: false,
  survivesParentRestart: false,
});

export const HERDR_BACKEND_CAPABILITIES: Readonly<BackendCapabilities> = Object.freeze({
  executionSurfaces: true,
  survivesParentRestart: true,
});
