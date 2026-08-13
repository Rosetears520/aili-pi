import type {
  RuntimeSnapshotV1,
  WorkbenchCatalogV1,
  WorkbenchProjectV1,
  WorkbenchSessionV1,
} from "./contracts.js";
import type { AcceptedRuntimeState } from "./runtime-projection.js";
import { projectWorkbenchRuntime, runtimeStatusView } from "./runtime-projection.js";

export type WorkbenchAction =
  | "new-session"
  | "send"
  | "queue-next"
  | "steer"
  | "compact"
  | "branch"
  | "fork"
  | "rename-session"
  | "delete-session"
  | "select-model"
  | "select-thinking"
  | "toggle-skill"
  | "plugin-action"
  | "worktree-add"
  | "worktree-switch"
  | "worktree-remove"
  | "worktree-prune"
  | "worktree-configure"
  | "agent-continue"
  | "media-send";

export interface ActionContract {
  readonly action: WorkbenchAction;
  readonly capability: string;
  readonly commandType: string;
  readonly label: string;
  readonly effect: string;
  readonly busyOnly?: boolean;
  readonly idleOnly?: boolean;
}

export const ACTION_CONTRACTS: Readonly<Record<WorkbenchAction, ActionContract>> = Object.freeze({
  "new-session": Object.freeze({ action: "new-session", capability: "session.create", commandType: "create", label: "New session", effect: "Create lazily through the admitted official Pi runtime" }),
  send: Object.freeze({ action: "send", capability: "pi.send", commandType: "send", label: "Send", effect: "Start a new model turn", idleOnly: true }),
  "queue-next": Object.freeze({ action: "queue-next", capability: "pi.follow_up", commandType: "follow_up", label: "Queue Next", effect: "Run after the current turn settles", busyOnly: true }),
  steer: Object.freeze({ action: "steer", capability: "pi.steer", commandType: "steer", label: "Steer", effect: "Inject guidance into the active turn", busyOnly: true }),
  compact: Object.freeze({ action: "compact", capability: "pi.compact", commandType: "compact", label: "Compact", effect: "Compact the current session context" }),
  branch: Object.freeze({ action: "branch", capability: "pi.branch", commandType: "branch", label: "Branch", effect: "Move the active leaf within this session JSONL" }),
  fork: Object.freeze({ action: "fork", capability: "pi.fork", commandType: "fork", label: "Fork", effect: "Create an independent session file" }),
  "rename-session": Object.freeze({ action: "rename-session", capability: "session.rename", commandType: "rename", label: "Rename", effect: "Rename the selected persisted session" }),
  "delete-session": Object.freeze({ action: "delete-session", capability: "session.safe_delete", commandType: "safe_delete", label: "Delete safely", effect: "Delete only after the Runtime safe-delete preflight" }),
  "select-model": Object.freeze({ action: "select-model", capability: "pi.model", commandType: "select_model", label: "Model", effect: "Select through the provider/context owner" }),
  "select-thinking": Object.freeze({ action: "select-thinking", capability: "pi.thinking", commandType: "select_thinking", label: "Thinking", effect: "Set Pi thinking level" }),
  "toggle-skill": Object.freeze({ action: "toggle-skill", capability: "skills.configure", commandType: "toggle_skill", label: "Skill visibility", effect: "Configure through the allowed-root gateway" }),
  "plugin-action": Object.freeze({ action: "plugin-action", capability: "plugins.configure", commandType: "plugin_action", label: "Plugin action", effect: "Configure through the allowed-root gateway" }),
  "worktree-add": Object.freeze({ action: "worktree-add", capability: "worktree.mutate", commandType: "add", label: "Add Worktree", effect: "Create after repository preflight" }),
  "worktree-switch": Object.freeze({ action: "worktree-switch", capability: "worktree.mutate", commandType: "switch", label: "Switch Worktree", effect: "Switch through explicit session transition" }),
  "worktree-remove": Object.freeze({ action: "worktree-remove", capability: "worktree.mutate", commandType: "remove", label: "Remove safely", effect: "Remove without force or branch deletion" }),
  "worktree-prune": Object.freeze({ action: "worktree-prune", capability: "worktree.mutate", commandType: "prune", label: "Prune metadata", effect: "Prune stale metadata after exact revalidation" }),
  "worktree-configure": Object.freeze({ action: "worktree-configure", capability: "worktree.mutate", commandType: "configure", label: "Configure Worktree root", effect: "Configure an allowed canonical root" }),
  "agent-continue": Object.freeze({ action: "agent-continue", capability: "agent.continue", commandType: "continue", label: "Continue Agent", effect: "Continue only when the Agent owner explicitly authorizes it" }),
  "media-send": Object.freeze({ action: "media-send", capability: "media.send", commandType: "send_images", label: "Send media", effect: "Convert validated images to official Pi image content" }),
});

export interface ComposerActionView {
  readonly primary: ActionContract;
  readonly secondary?: ActionContract;
  readonly disabledReason?: string;
}

export function composerActions(state: AcceptedRuntimeState): ComposerActionView {
  const projection = projectWorkbenchRuntime(state);
  const writable = runtimeStatusView(state).writable;
  const primary = projection.pi.activeRun ? ACTION_CONTRACTS["queue-next"] : ACTION_CONTRACTS.send;
  const secondary = projection.pi.activeRun ? ACTION_CONTRACTS.steer : undefined;
  const available = (action: ActionContract) => state.snapshot.capabilities[action.capability] === true;
  const disabledReason = !writable
    ? state.snapshot.writer.owner === "tui" ? "TUI owns this session; Web is a read-only observer" : "Web does not own the current writer lease"
    : !available(primary) ? `${primary.label} is not available for this runtime` : undefined;
  return Object.freeze({ primary, ...(secondary && available(secondary) ? { secondary } : {}), ...(disabledReason ? { disabledReason } : {}) });
}

export function actionAvailable(snapshot: RuntimeSnapshotV1, action: WorkbenchAction): boolean {
  const contract = ACTION_CONTRACTS[action];
  if (snapshot.capabilities[contract.capability] !== true) return false;
  const busy = snapshot.state === "running" || snapshot.writer.activeTurn;
  if (contract.busyOnly && !busy) return false;
  if (contract.idleOnly && busy) return false;
  return snapshot.writer.state === "owned" && snapshot.writer.owner === "web" && Boolean(snapshot.writer.generation);
}

export function groupSessionsByProject(catalog: WorkbenchCatalogV1): readonly WorkbenchProjectV1[] {
  return [...catalog.projects]
    .map((project) => Object.freeze({ ...project, sessions: Object.freeze([...project.sessions].sort(compareSessions)) }))
    .sort((left, right) => newest(right.sessions).localeCompare(newest(left.sessions)) || left.label.localeCompare(right.label));
}

export interface SessionTreeNodeV1 {
  readonly session: WorkbenchSessionV1;
  readonly children: readonly SessionTreeNodeV1[];
}

/** Adapted from Pi Web SessionSidebar's parent-session tree behavior. */
export function buildSessionTree(sessions: readonly WorkbenchSessionV1[]): readonly SessionTreeNodeV1[] {
  const nodes = new Map<string, MutableSessionTreeNode>();
  for (const session of sessions) nodes.set(session.handle, { session, children: [] });
  const roots: MutableSessionTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.session.parentHandle ? nodes.get(node.session.parentHandle) : undefined;
    if (parent && parent !== node && !createsCycle(nodes, node.session.handle, parent.session.handle)) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: MutableSessionTreeNode[]): void => {
    items.sort((left, right) => compareSessions(left.session, right.session));
    for (const item of items) sort(item.children);
  };
  sort(roots);
  return Object.freeze(roots.map(freezeTree));
}

export function branchForkExplanation(action: "branch" | "fork"): string {
  return action === "branch"
    ? "Branch changes the active leaf inside the current Pi JSONL session."
    : "Fork creates a new independent Pi session file from the selected point.";
}

/** Force removal is not representable by any action contract or argument. */
export function safeWorktreeRemovalArguments(worktreeHandle: string): Readonly<{ worktreeHandle: string }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(worktreeHandle)) throw new Error("invalid Worktree handle");
  return Object.freeze({ worktreeHandle });
}

function compareSessions(left: WorkbenchSessionV1, right: WorkbenchSessionV1): number { return right.modifiedAt.localeCompare(left.modifiedAt) || left.handle.localeCompare(right.handle); }
function newest(sessions: readonly WorkbenchSessionV1[]): string { return sessions.reduce((value, session) => session.modifiedAt > value ? session.modifiedAt : value, ""); }
interface MutableSessionTreeNode { session: WorkbenchSessionV1; children: MutableSessionTreeNode[]; }
function createsCycle(nodes: Map<string, MutableSessionTreeNode>, child: string, parent: string): boolean {
  const visited = new Set<string>([child]);
  let current: string | undefined = parent;
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = nodes.get(current)?.session.parentHandle;
  }
  return false;
}
function freezeTree(node: MutableSessionTreeNode): SessionTreeNodeV1 {
  return Object.freeze({ session: node.session, children: Object.freeze(node.children.map(freezeTree)) });
}
