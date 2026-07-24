import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, type Component, Text } from "@earendil-works/pi-tui";
import { validateRoleProfiles } from "./roles.js";

const CREDENTIAL_GUARD_EXTENSION = fileURLToPath(new URL("./credential-guard.ts", import.meta.url));
// Keep one explicit extension so upstream does not pass --no-extensions:
// the child then loads the same ambient AILI Package, including its single
// pi-permission-modes registration, without registering that extension twice.
const REQUIRED_CHILD_EXTENSIONS = [CREDENTIAL_GUARD_EXTENSION] as const;

type UnknownRecord = Record<string, unknown>;
type RenderTheme = {
  fg(style: string, text: string): string;
  bold(text: string): string;
};
type GenericTool = {
  name?: unknown;
  execute?: (...args: unknown[]) => unknown;
  renderCall?: (args: unknown, theme: RenderTheme) => Component;
  [key: string]: unknown;
};

type SubagentCompatibilityPlan =
  | { kind: "forward"; params: unknown }
  | { kind: "reject"; requestedBackend: "inline" | "auto"; error: string };

type AgentHeading = {
  label: "Agent" | "Agents";
  summary: string;
};

const MAX_AGENT_NAME_LENGTH = 48;
const MAX_AGENT_SUMMARY_LENGTH = 120;
const INLINE_COMPATIBILITY_ERROR =
  "inline backend is incompatible with Pi 0.81.1 and @agwab/pi-subagent 0.4.8; use backend \"headless\"";
const MIXED_PARALLEL_COMPATIBILITY_ERROR =
  "auto backend cannot safely combine visible tasks with ordinary non-visible, non-sandboxed tasks on Pi 0.81.1 and @agwab/pi-subagent 0.4.8; split the fan-out or choose one explicit compatible backend";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateDisplayText(value: string, maxLength: number): string {
  const characters = [...value];
  return characters.length <= maxLength
    ? value
    : `${characters.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}

function requestedAgentName(value: unknown): string {
  if (typeof value !== "string") return "agentless";
  const normalized = stripVTControlCharacters(value)
    .replace(/[\r\n\t\f\v]+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized
    ? truncateDisplayText(normalized, MAX_AGENT_NAME_LENGTH)
    : "agentless";
}

function requestedAgentHeading(params: unknown): AgentHeading | undefined {
  if (!isRecord(params)) return undefined;
  const action = typeof params.action === "string" ? params.action : "run";
  if (action !== "run") return undefined;

  const tasks = Array.isArray(params.tasks) ? params.tasks : undefined;
  const isParallel = tasks !== undefined;
  const names = tasks
    ? tasks.map((task: unknown) => requestedAgentName(isRecord(task) ? task.agent : undefined))
    : [requestedAgentName(params.agent)];
  if (names.length === 0) names.push("agentless");

  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const summary = [...counts]
    .map(([name, count]) => count > 1 ? `${name} ×${count}` : name)
    .join(", ");
  return {
    label: isParallel ? "Agents" : "Agent",
    summary: truncateDisplayText(summary, MAX_AGENT_SUMMARY_LENGTH),
  };
}

function withRequiredExtensions(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (value.extensions !== undefined && !Array.isArray(value.extensions)) return value;
  const extensions = Array.isArray(value.extensions) ? value.extensions : [];
  if (extensions.some((extension) => typeof extension !== "string")) return value;
  return {
    ...value,
    extensions: [...new Set([...REQUIRED_CHILD_EXTENSIONS, ...extensions])],
  };
}

function sandboxRequested(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

function taskSelector(
  task: UnknownRecord,
  parent: UnknownRecord,
): { visible: boolean; sandboxed: boolean; plain: boolean } {
  const visible = task.visible === undefined ? parent.visible === true : task.visible === true;
  const sandbox = Object.hasOwn(task, "sandbox") ? task.sandbox : parent.sandbox;
  const sandboxed = sandboxRequested(sandbox);
  return { visible, sandboxed, plain: !visible && !sandboxed };
}

/**
 * Select a Pi-0.81.1-compatible backend without changing compatible explicit,
 * visible, sandboxed, or lifecycle requests. Parallel auto calls are evaluated
 * per task because task-level visible/sandbox values override their parent.
 */
export function normalizeSubagentCompatibility(params: unknown): SubagentCompatibilityPlan {
  if (!isRecord(params) || (params.action !== undefined && params.action !== "run")) {
    return { kind: "forward", params };
  }

  if (params.backend === "inline") {
    return { kind: "reject", requestedBackend: "inline", error: INLINE_COMPATIBILITY_ERROR };
  }
  if (params.backend !== undefined && params.backend !== "auto") return { kind: "forward", params };

  if (Array.isArray(params.tasks)) {
    if (params.tasks.length === 0 || params.tasks.some((task) => !isRecord(task))) {
      return { kind: "forward", params };
    }
    const selectors = params.tasks.map((task) => taskSelector(task as UnknownRecord, params));
    const hasPlain = selectors.some((selector) => selector.plain);
    const hasVisible = selectors.some((selector) => selector.visible);
    if (hasPlain && hasVisible) {
      return { kind: "reject", requestedBackend: "auto", error: MIXED_PARALLEL_COMPATIBILITY_ERROR };
    }
    if (hasPlain) return { kind: "forward", params: { ...params, backend: "headless" } };
    return { kind: "forward", params };
  }

  if (params.visible === true || sandboxRequested(params.sandbox)) return { kind: "forward", params };
  return { kind: "forward", params: { ...params, backend: "headless" } };
}

function compatibilityFailure(plan: Extract<SubagentCompatibilityPlan, { kind: "reject" }>): UnknownRecord {
  const payload = {
    tool: "subagent",
    ...(plan.requestedBackend === "inline" ? { backend: "inline" } : {}),
    requestedBackend: plan.requestedBackend,
    status: "failed",
    failureKind: "validation",
    error: plan.error,
  };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: { compatibility: payload },
    isError: true,
  };
}

/**
 * Adds the immutable child credential guard to every run path while preserving
 * the ambient AILI permission-mode extension and all caller options.
 * Lifecycle actions never spawn a child, so their arguments remain byte-for-
 * byte upstream inputs.
 */
export function protectSubagentParams(params: unknown): unknown {
  if (!isRecord(params) || (params.action !== undefined && params.action !== "run")) return params;
  const guarded = withRequiredExtensions(params);
  if (!isRecord(guarded) || !Array.isArray(guarded.tasks)) return guarded;
  return {
    ...guarded,
    tasks: guarded.tasks.map((task) => withRequiredExtensions(task)),
  };
}

export function wrapSubagentTool(tool: GenericTool): GenericTool {
  if (tool.name !== "subagent" || typeof tool.execute !== "function") return tool;
  const execute = tool.execute;
  const renderCall = tool.renderCall;
  return {
    ...tool,
    ...(typeof renderCall === "function"
      ? {
          renderCall(args: unknown, theme: RenderTheme): Component {
            const plan = normalizeSubagentCompatibility(args);
            const effectiveArgs = plan.kind === "forward" ? plan.params : args;
            const upstream = renderCall(effectiveArgs, theme);
            const heading = requestedAgentHeading(args);
            if (!heading) return upstream;
            const container = new Container();
            container.addChild(new Text(
              `${theme.fg("muted", `${heading.label}:`)} ${theme.fg("accent", heading.summary)}`,
              0,
              0,
            ));
            container.addChild(upstream);
            return container;
          },
        }
      : {}),
    async execute(...args: unknown[]) {
      // Current Pi uses execute(id, params, ...); older direct fixtures may call
      // execute(params). Detect the object position rather than mistaking a
      // signal/callback for params.
      const paramsIndex = isRecord(args[0]) || args.length === 1 ? 0 : 1;
      const plan = normalizeSubagentCompatibility(args[paramsIndex]);
      if (plan.kind === "reject") return compatibilityFailure(plan);
      const protectedArgs = [...args];
      protectedArgs[paramsIndex] = protectSubagentParams(plan.params);
      return await execute(...protectedArgs);
    },
  };
}

/**
 * Registers the upstream `subagent` name, schema, lifecycle, and worker engine.
 * AILI wraps backend selection for the pinned SDK compatibility window, adds a
 * bounded requested-Agent heading, and injects non-removable credential
 * protection while each child loads permission modes exactly once.
 */
export async function registerSubagent(pi: ExtensionAPI): Promise<void> {
  let genericToolRegistered = false;
  const proxy = new Proxy(pi, {
    get(target, property, receiver) {
      if (property === "registerTool") {
        return (tool: GenericTool) => {
          if (tool?.name === "subagent") genericToolRegistered = true;
          return target.registerTool(wrapSubagentTool(tool) as never);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ExtensionAPI;
  const moduleName: string = "@agwab/pi-subagent";
  const loaded = await import(moduleName) as { default?: unknown };
  if (typeof loaded.default !== "function") throw new Error("pinned @agwab/pi-subagent does not expose an Extension default export");
  await (loaded.default as (api: ExtensionAPI) => void | Promise<void>)(proxy);
  if (!genericToolRegistered) throw new Error("pinned @agwab/pi-subagent did not register the subagent tool");
}

export async function subagentDiagnostics(): Promise<{ status: "UNVERIFIED" | "ERROR"; evidence: string }> {
  const errors = await validateRoleProfiles();
  return errors.length === 0
    ? { status: "UNVERIFIED", evidence: "tool=subagent; profiles=19 packaged; global ~/.pi/agent/agents/aili installation is required only to select aili.<role> agents" }
    : { status: "ERROR", evidence: errors.slice(0, 4).join("; ") };
}
