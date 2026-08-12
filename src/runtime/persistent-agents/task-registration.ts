import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

interface TaskToolInfo {
  name: string;
  description: string;
  parameters: unknown;
  promptGuidelines?: readonly string[];
  sourceInfo?: TaskSourceInfo;
}

interface TaskSourceInfo {
  path: string;
  source: string;
  scope: string;
  origin: string;
  baseDir?: string;
}

interface SourceInfoBinding extends TaskSourceInfo {
  identity: TaskSourceInfo;
}

interface CanonicalTaskReservation {
  definition: ToolDefinition;
  parameters: unknown;
  promptGuidelines: ToolDefinition["promptGuidelines"];
  sourceInfo?: SourceInfoBinding;
}

const reservations = new WeakMap<object, CanonicalTaskReservation>();

function currentTask(pi: ExtensionAPI): { available: boolean; tool?: TaskToolInfo } {
  try {
    return {
      available: true,
      tool: (pi.getAllTools() as TaskToolInfo[]).find((candidate) => candidate.name === "task"),
    };
  } catch {
    // Pi intentionally does not bind discovery methods until extension loading
    // completes. Event-time verification below remains the fail-closed gate.
    return { available: false };
  }
}

function hasCanonicalDefinitionIdentity(tool: TaskToolInfo | undefined, reservation: CanonicalTaskReservation): boolean {
  if (!tool) return false;
  return tool.description === reservation.definition.description
    && tool.parameters === reservation.parameters
    && tool.promptGuidelines === reservation.promptGuidelines;
}

function validSourceInfo(sourceInfo: TaskSourceInfo | undefined): sourceInfo is TaskSourceInfo {
  return Boolean(sourceInfo)
    && typeof sourceInfo?.path === "string"
    && sourceInfo.path.length > 0
    && typeof sourceInfo.source === "string"
    && sourceInfo.source.length > 0
    && sourceInfo.source !== "builtin"
    && sourceInfo.source !== "sdk"
    && sourceInfo.source !== "mcp"
    && typeof sourceInfo.scope === "string"
    && sourceInfo.scope.length > 0
    && typeof sourceInfo.origin === "string"
    && sourceInfo.origin.length > 0
    && (sourceInfo.baseDir === undefined || typeof sourceInfo.baseDir === "string");
}

function bindSourceInfo(reservation: CanonicalTaskReservation, sourceInfo: TaskSourceInfo | undefined): boolean {
  if (!validSourceInfo(sourceInfo)) return false;
  if (reservation.sourceInfo) return matchesSourceInfo(sourceInfo, reservation.sourceInfo);
  reservation.sourceInfo = {
    identity: sourceInfo,
    path: sourceInfo.path,
    source: sourceInfo.source,
    scope: sourceInfo.scope,
    origin: sourceInfo.origin,
    baseDir: sourceInfo.baseDir,
  };
  return true;
}

function matchesSourceInfo(sourceInfo: TaskSourceInfo | undefined, binding: SourceInfoBinding): boolean {
  return sourceInfo === binding.identity
    && sourceInfo.path === binding.path
    && sourceInfo.source === binding.source
    && sourceInfo.scope === binding.scope
    && sourceInfo.origin === binding.origin
    && sourceInfo.baseDir === binding.baseDir;
}

function canonicalOwnerSourceInfo(pi: ExtensionAPI): TaskSourceInfo | undefined {
  try {
    return pi.getCommands().find((command) => command.name === "aili-agent-model")?.sourceInfo as TaskSourceInfo | undefined;
  } catch {
    return undefined;
  }
}

function isReservedDefinition(tool: TaskToolInfo | undefined, reservation: CanonicalTaskReservation): boolean {
  return hasCanonicalDefinitionIdentity(tool, reservation)
    && Boolean(reservation.sourceInfo)
    && matchesSourceInfo(tool?.sourceInfo, reservation.sourceInfo!);
}

/**
 * Register the sole top-level AILI task definition and reserve its exact
 * in-process definition and loader-owned source identity. Pi 0.84.1 exposes
 * the winning definition's schema/guideline references and immutable sourceInfo
 * through getAllTools(), so event-time policy can distinguish this registration
 * from same-name extension, SDK, or MCP tools.
 */
export function registerCanonicalAiliTaskTool(pi: ExtensionAPI, definition: ToolDefinition): void {
  if (definition.name !== "task") throw new Error("canonical AILI task reservation requires exact tool name task");
  if (reservations.has(pi as object)) throw new Error("canonical AILI task is already reserved on this Extension API");

  const before = currentTask(pi);
  if (before.available && before.tool) {
    throw new Error("task tool collision exists before canonical AILI task registration");
  }

  pi.registerTool(definition);
  const reservation: CanonicalTaskReservation = {
    definition,
    parameters: definition.parameters,
    promptGuidelines: definition.promptGuidelines,
  };
  reservations.set(pi as object, reservation);

  const after = currentTask(pi);
  if (after.available && (!hasCanonicalDefinitionIdentity(after.tool, reservation) || !bindSourceInfo(reservation, after.tool?.sourceInfo))) {
    reservations.delete(pi as object);
    throw new Error("canonical AILI task did not win registration");
  }
}

/** True only for the active, exact canonical AILI-owned winning task. */
export function isCanonicalAiliTaskActive(pi: ExtensionAPI): boolean {
  const reservation = reservations.get(pi as object);
  if (!reservation) return false;
  try {
    if (!pi.getActiveTools().includes("task")) return false;
    const tool = currentTask(pi).tool;
    if (!reservation.sourceInfo) {
      const ownerSourceInfo = canonicalOwnerSourceInfo(pi);
      if (!hasCanonicalDefinitionIdentity(tool, reservation)
        || tool?.sourceInfo !== ownerSourceInfo
        || !bindSourceInfo(reservation, ownerSourceInfo)) return false;
    }
    return isReservedDefinition(tool, reservation);
  } catch {
    return false;
  }
}
