export const COORDINATOR_SCHEMA_VERSION = 1 as const;
export const DEFAULT_IDLE_TTL_MS = 420_000;

export type AgentState = "queued" | "running" | "idle" | "parked" | "aborted";
export type JobState = "queued" | "running" | "completed" | "failed" | "aborted" | "unexecuted";
export type TurnState = "queued" | "running" | "completed" | "failed" | "aborted" | "interrupted";

export type FormalResultEvidenceStatus = "completed" | "partial" | "blocked" | "unverified" | "malformed";

export interface FormalResultEvidenceRecord {
  version: 1;
  eventId: string;
  eventSequence: number;
  agentId: string;
  jobId: string;
  turnId: string;
  changeId: string;
  packageId: string;
  roleId: string;
  canonicalStatus: FormalResultEvidenceStatus;
  outputPath: string;
  outputSha256: string;
  outputBytes: number;
  historyPath: string;
  historyPrefixSha256: string;
  historyPrefixBytes: number;
}

export interface AgentRecord {
  id: string;
  name: string;
  selector: string;
  state: AgentState;
  parentAgentId?: string;
  sessionPath?: string;
  currentTurnId?: string;
  currentJobId?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface JobRecord {
  id: string;
  agentId: string;
  state: JobState;
  createdAt: string;
  updatedAt: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface TurnRecord {
  id: string;
  agentId: string;
  jobId?: string;
  state: TurnState;
  createdAt: string;
  updatedAt: string;
  outcome?: string;
  metadata?: Record<string, unknown>;
}

export interface MailboxRecord {
  agentId: string;
  messages: Array<Record<string, unknown>>;
}

export interface CoordinatorState {
  schemaVersion: typeof COORDINATOR_SCHEMA_VERSION;
  parentId: string;
  lastSequence: number;
  appliedEventIds: string[];
  agents: Record<string, AgentRecord>;
  releasedAgents: Record<string, AgentRecord>;
  jobs: Record<string, JobRecord>;
  turns: Record<string, TurnRecord>;
  mailboxes: Record<string, MailboxRecord>;
  deliveries: Record<string, Record<string, unknown>>;
  models: Record<string, Record<string, unknown>>;
  workspaces: Record<string, Record<string, unknown>>;
  workspaceLeases: Record<string, Record<string, unknown>>;
  messages: Record<string, Record<string, unknown>>;
  formalResultEvidence: Record<string, FormalResultEvidenceRecord>;
}

export type CoordinatorEventKind =
  | "agent.created"
  | "agent.state"
  | "agent.session"
  | "agent.released"
  | "job.created"
  | "job.state"
  | "turn.created"
  | "turn.state"
  | "turn.audit"
  | "formal.result.evidence"
  | "formal.message.prepared"
  | "mailbox.put"
  | "message.put"
  | "delivery.put"
  | "model.put"
  | "model.clear"
  | "workspace.lease"
  | "workspace.put";

export interface CoordinatorEvent {
  schemaVersion: typeof COORDINATOR_SCHEMA_VERSION;
  eventId: string;
  sequence: number;
  timestamp: string;
  parentId: string;
  kind: CoordinatorEventKind;
  agentId?: string;
  jobId?: string;
  turnId?: string;
  deliveryId?: string;
  messageId?: string;
  payload: Record<string, unknown>;
}

export interface CoordinatorEventInput {
  kind: CoordinatorEventKind;
  agentId?: string;
  jobId?: string;
  turnId?: string;
  deliveryId?: string;
  messageId?: string;
  payload: Record<string, unknown>;
}

export interface CoordinatorSnapshot {
  schemaVersion: typeof COORDINATOR_SCHEMA_VERSION;
  parentId: string;
  checkpointSequence: number;
  createdAt: string;
  state: CoordinatorState;
}

export interface ReplayDiagnostics {
  toleratedFinalPartialLine: boolean;
  ignoredBytes: number;
  snapshotLoaded: boolean;
}

export interface ReplayResult {
  state: CoordinatorState;
  events: CoordinatorEvent[];
  diagnostics: ReplayDiagnostics;
}

export interface SidecarLayout {
  parentSessionPath: string;
  root: string;
  coordinatorPath: string;
  snapshotPath: string;
  agentsDir: string;
  patchesDir: string;
  resultsDir: string;
  workspacesPath: string;
}
