/** Wire-level vocabulary for Herdr's raw socket API (protocol 20, verified
 *  live in audit/environment-verification.md). Framing is newline-delimited
 *  JSON: requests carry {id, method, params}; responses {id, result} or
 *  {id, error:{code,message}}; subscription events arrive as {event, data}
 *  frames without an id. */

export const SUPPORTED_HERDR_PROTOCOL = 20 as const;

export interface HerdrRequest {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
}

export type HerdrResponse =
  | { id: string | number; result: unknown }
  | { id: string | number; error: { code: string; message: string } };

export interface HerdrSubscriptionEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Raised for socket-level failures (unreachable daemon, disconnects). */
export class HerdrUnavailableError extends Error {
  constructor(message: string, readonly code = "herdr-unavailable") {
    super(`${code}: ${message}`);
    this.name = "HerdrUnavailableError";
  }
}

/** Raised when the daemon speaks, but says no (protocol error responses,
 *  version mismatches, unexpected result shapes). */
export class HerdrProtocolError extends Error {
  constructor(message: string, readonly herdrCode?: string) {
    super(herdrCode ? `herdr ${herdrCode}: ${message}` : `herdr: ${message}`);
    this.name = "HerdrProtocolError";
  }
}

/** Metadata token keys are constrained to [A-Za-z0-9_-]{1,32} (no dots), so
 *  the AILI identity fields use snake_case here rather than the dotted
 *  aili.* names used in the design prose. */
export const HERDR_METADATA_SOURCE = "aili";

export interface HerdrIdentityMetadata {
  parent_session_id: string;
  agent_id: string;
  run_id: string;
  backend: string;
  schema: number;
}

export function herdrIdentityTokens(identity: HerdrIdentityMetadata): Record<string, string> {
  return {
    aili_schema: String(identity.schema),
    aili_parent_session_id: identity.parent_session_id.slice(0, 32),
    aili_agent_id: identity.agent_id.slice(0, 32),
    aili_run_id: identity.run_id.slice(0, 32),
    aili_backend: identity.backend.slice(0, 32),
  };
}

/** Loose snapshot projections — only the fields AILI consumes. */
export interface HerdrPaneSnapshot {
  pane_id: string;
  workspace_id?: string;
  tab_id?: string;
  agent?: string | null;
  agent_status?: string;
  agent_session?: { source?: string; value?: string } | null;
  cwd?: string | null;
  tokens?: Record<string, string>;
}

export interface HerdrSnapshot {
  protocol?: number;
  workspaces?: Array<Record<string, unknown>>;
  tabs?: Array<Record<string, unknown>>;
  panes?: HerdrPaneSnapshot[];
}

export function projectSnapshot(result: unknown): HerdrSnapshot {
  if (!result || typeof result !== "object") throw new HerdrProtocolError("session.snapshot returned a non-object result");
  const wrapped = result as { snapshot?: unknown };
  const raw = (wrapped.snapshot ?? result) as Record<string, unknown>;
  return raw as HerdrSnapshot;
}

/** Event kinds AILI subscribes to for surface observation. They are advisory
 * for Pi children (whose bridge settles turns). Direct external CUI runs use
 * bounded targeted snapshots after agent.prompt as their lifecycle evidence.
 *  Only kinds whose subscription entry needs just {type} are listed —
 *  pane-scoped kinds (pane.agent_status_changed, pane.scroll_changed,
 *  pane.output_matched) additionally require pane_id and arrive with
 *  per-surface subscriptions in later phases. */
export const HERDR_OBSERVED_EVENT_KINDS: readonly string[] = [
  "workspace.metadata_updated",
  "workspace.created",
  "workspace.closed",
  "tab.created",
  "tab.closed",
  "pane.created",
  "pane.closed",
  "pane.exited",
  "pane.moved",
  "pane.agent_detected",
  "layout.updated",
];
