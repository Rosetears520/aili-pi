export interface AtomicObservation {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  agentId: string;
  branchId: string;
  parentObservationId?: string;
  eventId: string;
  summary: string;
  confidence: number;
  createdAt: string;
  supersedes?: string;
}

export interface MemoryCandidate {
  observationId: string;
  scope: "diary" | "shared";
  summary: string;
  confidence: number;
  sourceEventIds: readonly string[];
}

export interface MemoryRecallProjection {
  ids: readonly string[];
  text: string;
  omitted: number;
  hash: string;
}
