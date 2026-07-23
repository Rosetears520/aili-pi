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

type AgentHeading = {
  label: "Agent" | "Agents";
  summary: string;
};

const MAX_AGENT_NAME_LENGTH = 48;
const MAX_AGENT_SUMMARY_LENGTH = 120;

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
            const upstream = renderCall(args, theme);
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
      // Pi has supported execute(params, ...) and execute(id, params, ...).
      // Delegate both shapes back to the upstream implementation unchanged
      // except for mandatory child extensions on `action: run`.
      const paramsIndex = args.length > 1 && args[1] !== undefined ? 1 : 0;
      const protectedArgs = [...args];
      protectedArgs[paramsIndex] = protectSubagentParams(protectedArgs[paramsIndex]);
      return await execute(...protectedArgs);
    },
  };
}

/**
 * Registers the upstream `subagent` tool unchanged in name, schema, execution,
 * and lifecycle behavior. AILI adds a bounded requested-Agent heading and
 * injects non-removable credential protection while each child loads the
 * ambient AILI permission-mode extension exactly once.
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
