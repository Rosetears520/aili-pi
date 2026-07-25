import {
  createAgentSession,
  DefaultResourceLoader,
  SettingsManager,
  type AgentSession,
  type CreateAgentSessionOptions,
  type ExtensionAPI,
  type ExtensionFactory,
  type InlineExtension,
  type SessionManager,
} from "@earendil-works/pi-coding-agent";
import { bashMentionsCredentialPath, isProtectedChildPath } from "../credential-guard.js";
import { findCredentialMaterial } from "./permission.js";
import type { ChildPromptAssembly, EffectiveToolPolicy } from "./policy.js";

export type ChildPermissionAction = "allow" | "ask" | "deny";

export interface ChildApprovalPacket {
  agentId: string;
  jobId?: string;
  toolName: string;
  summary: string;
}

export interface ChildApprovalBridgeOptions {
  agentId: string;
  jobId?: string;
  cwd: string;
  decide: (toolName: string, input: Record<string, unknown>) => ChildPermissionAction | Promise<ChildPermissionAction>;
  requestApproval: (packet: ChildApprovalPacket) => "allow" | "deny" | Promise<"allow" | "deny">;
}

const FILE_TOOLS = new Set(["read", "write", "edit", "ls", "grep", "find"]);

function redactedSummary(toolName: string, input: Record<string, unknown>): string {
  if (FILE_TOOLS.has(toolName) && typeof input.path === "string") return `${toolName} ${input.path}`.slice(0, 500);
  if (toolName === "bash" && typeof input.command === "string") {
    const command = input.command
      .replace(/\b(authorization:\s*bearer|bearer)\s+\S+/gi, "$1 <redacted>")
      .replace(/\b(token|secret|password|passwd|api[_-]?key|private[_-]?key)=\S+/gi, "$1=<redacted>")
      .replace(/\s+/g, " ")
      .trim();
    return `bash ${command}`.slice(0, 500);
  }
  return `${toolName} request`;
}

async function credentialDenial(cwd: string, toolName: string, input: Record<string, unknown>): Promise<string | undefined> {
  if (FILE_TOOLS.has(toolName) && typeof input.path === "string" && await isProtectedChildPath(cwd, input.path)) {
    return "AILI child denied credential/auth/private-key path access before approval";
  }
  if (toolName === "bash" && typeof input.command === "string" && bashMentionsCredentialPath(input.command)) {
    return "AILI child denied credential/auth/private-key path access in bash before approval";
  }
  const generic = await findCredentialMaterial(input, cwd);
  if (generic) return `AILI child denied credential/auth/private-key material before approval (${generic.reason})`;
  return undefined;
}

export function createChildApprovalBridge(options: ChildApprovalBridgeOptions): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.on("tool_call", async (event) => {
      const input = (event.input && typeof event.input === "object" ? event.input : {}) as Record<string, unknown>;
      const hardDenial = await credentialDenial(options.cwd, event.toolName, input);
      if (hardDenial) return { block: true, reason: hardDenial };
      let action: ChildPermissionAction;
      try {
        action = await options.decide(event.toolName, input);
      } catch {
        return { block: true, reason: "AILI child permission classification failed closed" };
      }
      if (action === "deny") return { block: true, reason: "AILI child permission policy denied this tool call" };
      if (action === "allow") return undefined;
      try {
        const decision = await options.requestApproval({
          agentId: options.agentId,
          jobId: options.jobId,
          toolName: event.toolName,
          summary: redactedSummary(event.toolName, input),
        });
        return decision === "allow" ? undefined : { block: true, reason: "AILI parent approval denied or dismissed" };
      } catch {
        return { block: true, reason: "AILI parent approval bridge unavailable" };
      }
    });
  };
}

export interface ChildResourceLoaderOptions {
  cwd: string;
  agentDir: string;
  projectTrusted: boolean;
  systemPrompt: string;
  childExtensions?: Array<{ name: string; factory: ExtensionFactory }>;
  topLevelExtensionNames?: string[];
}

export async function createChildResourceLoader(options: ChildResourceLoaderOptions): Promise<{
  loader: DefaultResourceLoader;
  settingsManager: SettingsManager;
}> {
  const forbidden = new Set(options.topLevelExtensionNames ?? ["aili-top-coordinator", "aili-runtime"]);
  const extensions: InlineExtension[] = [];
  for (const extension of options.childExtensions ?? []) {
    if (forbidden.has(extension.name)) throw new Error(`${extension.name}: top-level Extension cannot be loaded in a child Agent`);
    if (extensions.some((candidate) => candidate.name === extension.name)) throw new Error(`${extension.name}: duplicate child Extension`);
    extensions.push({ name: extension.name, factory: extension.factory, hidden: true });
  }
  const settingsManager = SettingsManager.inMemory({}, { projectTrusted: options.projectTrusted });
  const loader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: options.systemPrompt,
    extensionFactories: extensions,
    extensionsOverride: (base) => ({
      ...base,
      extensions: base.extensions.filter((extension) => ![...forbidden].some((name) => extension.path === `<inline:${name}>` || extension.path.endsWith(`/${name}`))),
    }),
  });
  await loader.reload();
  const errors = loader.getExtensions().errors;
  if (errors.length > 0) throw new Error(`child resource loader failed: ${errors.map((error) => error.error).join("; ")}`);
  return { loader, settingsManager };
}

export interface CreatePersistentChildSessionOptions {
  cwd: string;
  agentDir: string;
  projectTrusted: boolean;
  sessionManager: SessionManager;
  prompt: ChildPromptAssembly;
  policy: EffectiveToolPolicy;
  childExtensions?: Array<{ name: string; factory: ExtensionFactory }>;
  topLevelExtensionNames?: string[];
  model?: CreateAgentSessionOptions["model"];
  thinkingLevel?: CreateAgentSessionOptions["thinkingLevel"];
}

export interface PersistentChildSessionRuntime {
  session: AgentSession;
  initialMessage: string;
  dispose(): Promise<void>;
}

export async function createPersistentChildSession(options: CreatePersistentChildSessionOptions): Promise<PersistentChildSessionRuntime> {
  const { loader, settingsManager } = await createChildResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    projectTrusted: options.projectTrusted,
    systemPrompt: options.prompt.systemPrompt,
    childExtensions: options.childExtensions,
    topLevelExtensionNames: options.topLevelExtensionNames,
  });
  const created = await createAgentSession({
    cwd: options.cwd,
    agentDir: options.agentDir,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    resourceLoader: loader,
    settingsManager,
    sessionManager: options.sessionManager,
    tools: options.policy.effectiveTools,
    customTools: options.policy.customTools,
  });
  const active = created.session.getActiveToolNames();
  const missing = options.policy.effectiveTools.filter((name) => !active.includes(name));
  if (missing.length > 0) {
    created.session.dispose();
    throw new Error(`child runtime could not activate approved tools: ${missing.join(", ")}`);
  }
  return {
    session: created.session,
    initialMessage: options.prompt.initialMessage,
    async dispose() {
      created.session.dispose();
    },
  };
}
