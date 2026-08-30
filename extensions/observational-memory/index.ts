import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MEMPALACE_VERSION, mapMemPalaceScope, type MemPalaceScopeMapping } from "../../src/runtime/mempalace.js";
import { sessionOwnedMcpInvokerFor } from "../../src/runtime/mcp.js";
import {
  AUTOMATIC_MEMORY_TOOLS,
  AutomaticMemoryRuntime,
  DelegatingMemPalacePort,
  ParentPiManagedMemoryObserver,
  PiEntryAncestryLaneTracker,
  SessionMemPalacePort,
  StandingMemoryAuthority,
  type AutomaticMemoryRuntimeOptions,
  type ManagedMemoryObserver,
  type MemPalacePort,
} from "../../src/runtime/observational-memory/index.js";

const MEMORY_SERVER = "mempalace";
const MAIN_AGENT_ID = "main";
const ALL_KINDS = ["preference", "reusable-solution", "project-decision", "recovery-point"] as const;

export interface MemPalaceVersionEvidence { accepted: string; installed?: string; }
export const DEFAULT_MEMPALACE_VERSION_EVIDENCE: Readonly<MemPalaceVersionEvidence> = Object.freeze({ accepted: MEMPALACE_VERSION });
export function exactMemPalaceVersionCompatible(evidence: MemPalaceVersionEvidence): boolean {
  return evidence.accepted === MEMPALACE_VERSION && evidence.installed === evidence.accepted;
}

const execFileAsync = promisify(execFile);
const VERSION_PROBE_TIMEOUT_MS = 3_000;
const VERSION_PROBE_MAX_BUFFER = 4_096;
async function resolveInstalledMemPalaceVersion(): Promise<string> {
  const { stdout } = await execFileAsync("mempalace", ["--version"], {
    encoding: "utf8",
    timeout: VERSION_PROBE_TIMEOUT_MS,
    maxBuffer: VERSION_PROBE_MAX_BUFFER,
    windowsHide: true,
  });
  return String(stdout).trim();
}
function parseExactMemPalaceVersion(output: string): string | undefined {
  const match = /^(?:mempalace(?:,? version)?\s+)?(\d+\.\d+\.\d+)$/i.exec(output.trim());
  return match?.[1] === MEMPALACE_VERSION ? match[1] : undefined;
}

export interface ObservationalMemoryExtensionOptions extends AutomaticMemoryRuntimeOptions {
  observer?: ManagedMemoryObserver;
  port?: MemPalacePort;
  authority?: StandingMemoryAuthority;
  providerVersionEvidence?: MemPalaceVersionEvidence;
  resolveProviderVersion?: () => Promise<string>;
}

function messageText(message: { content?: unknown }): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content.flatMap((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string" ? [(part as { text: string }).text] : []).join("\n");
}
function activeAuthority(authority: StandingMemoryAuthority): boolean { const policy = authority.snapshot(); return Boolean(policy && !policy.revokedAt); }
const outcomeChinese: Readonly<Record<string, string>> = Object.freeze({
  "not-attempted": "未尝试", disabled: "已关闭", "no-candidate": "无候选", "observer-failed": "观察失败",
  "standing-policy-revoked": "授权已撤销", "unarmed-no-live-port": "未授权", "provider-operation-threw": "调用失败",
  "empty-query": "无查询", accepted: "已接收",
});
function chineseOutcome(value: string): string {
  const known = outcomeChinese[value];
  if (known) return known;
  const settled = /^settled:(\d+)$/.exec(value); if (settled) return `已完成:${settled[1]}`;
  const success = /^success:(\d+):([a-f0-9]{1,12})$/.exec(value); if (success) return `成功:${success[1]}:${success[2]}`;
  const failure = /^(recall|checkpoint|reconcile)-(denied|unavailable|auth-required|cancelled|invalid-provider-response|ambiguous)$/.exec(value);
  if (failure) return `${failure[1] === "recall" ? "召回" : failure[1] === "checkpoint" ? "检查点" : "去重"}:${failureChinese(failure[2])}`;
  return "已记录";
}
function failureChinese(value: string): string {
  return ({ denied: "被拒绝", unavailable: "不可用", "auth-required": "需认证", cancelled: "已取消", "invalid-provider-response": "响应无效", ambiguous: "结果不明" } as Record<string, string>)[value] ?? "未知";
}
function providerErrorChinese(value: string | undefined): string {
  if (!value) return "无";
  const match = /^(recall|checkpoint|reconcile):(denied|unavailable|auth-required|cancelled|invalid-provider-response|ambiguous)$/.exec(value);
  return match ? `${match[1] === "recall" ? "召回" : match[1] === "checkpoint" ? "检查点" : "去重"}:${failureChinese(match[2])}` : "未知";
}
function verificationReceipt(event: any): string | undefined {
  if (event?.isError) return undefined;
  const tool = typeof event?.toolName === "string" ? event.toolName.toLocaleLowerCase("en-US") : "";
  if (!new Set(["bash", "shell", "exec"]).has(tool) || /(?:aili-memory-|mcp|memory[_-](?:search|write|add|checkpoint))/i.test(tool)) return undefined;
  const input = event?.input ?? event?.args;
  const command = input && typeof input === "object" && typeof input.command === "string" ? input.command : "";
  if (!/\b(?:vitest|tsc|eslint)\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|typecheck|lint|check)\b/i.test(command) || /(?:aili-memory-|\bmcp\b|mempalace)/i.test(command)) return undefined;
  let output = "";
  try { output = typeof event.result === "string" ? event.result : JSON.stringify(event.result) ?? ""; } catch { return undefined; }
  return JSON.stringify({ schema: "aili.verification-receipt/v1", tool, success: true, outputHash: createHash("sha256").update(output).digest("hex") });
}

export default function registerObservationalMemory(pi: ExtensionAPI, options: ObservationalMemoryExtensionOptions = {}): void {
  const authority = options.authority ?? new StandingMemoryAuthority();
  const delegatedPort = new DelegatingMemPalacePort();
  const parentObserver = options.observer ? undefined : new ParentPiManagedMemoryObserver();
  let evidence: Readonly<MemPalaceVersionEvidence> = Object.freeze({ ...(options.providerVersionEvidence ?? DEFAULT_MEMPALACE_VERSION_EVIDENCE) });
  const resolveProviderVersion = options.resolveProviderVersion ?? resolveInstalledMemPalaceVersion;
  const compatible = (): boolean => exactMemPalaceVersionCompatible(evidence);
  const memory = new AutomaticMemoryRuntime({
    ...options,
    observer: options.observer ?? parentObserver,
    port: options.port ?? delegatedPort,
    authorityArmed: () => activeAuthority(authority),
    providerVersionCompatible: compatible,
  });
  const branchLanes = new PiEntryAncestryLaneTracker();
  let mapping: MemPalaceScopeMapping | undefined;
  let sequence = 0;
  let projectionInjected = false;

  const branchId = (ctx: any): string => branchLanes.laneFor(ctx.sessionManager.getBranch(), ctx.sessionManager.getSessionId());
  const projectLabel = (ctx: any): string => mapping?.projectIdentity ?? `project-${createHash("sha256").update(String(ctx.cwd)).digest("hex").slice(0, 24)}`;
  const capture = (ctx: any, role: "user" | "assistant" | "tool-outcome", text: string, entryId?: string): void => {
    const value = text.trim(); if (!value) return;
    const id = entryId ?? `memory-source-${++sequence}`;
    memory.capture({ id: createHash("sha256").update(ctx.sessionManager.getSessionId()).update("\0").update(id).digest("hex").slice(0, 24), entryId: id, sessionId: ctx.sessionManager.getSessionId(), agentId: MAIN_AGENT_ID, branchId: branchId(ctx), sourceProject: projectLabel(ctx), role, text: value, createdAt: new Date().toISOString(), origin: "foreground" });
  };

  const bindProductionPort = (ctx: ExtensionContext, next: MemPalaceScopeMapping): void => {
    if (options.port) return;
    delegatedPort.bind(new SessionMemPalacePort({ invoker: sessionOwnedMcpInvokerFor(pi), authority, mapping: next, server: MEMORY_SERVER, agentId: MAIN_AGENT_ID, sessionId: ctx.sessionManager.getSessionId(), ...(compatible() && evidence.installed ? { providerVersion: evidence.installed } : {}) }));
  };
  const bindSession = async (ctx: ExtensionContext): Promise<void> => {
    delegatedPort.invalidate(); mapping = undefined; authority.revoke(); memory.revoke();
    evidence = Object.freeze({ accepted: MEMPALACE_VERSION });
    parentObserver?.bind(ctx);
    if (!ctx.isProjectTrusted()) return;
    try {
      const next = await mapMemPalaceScope({ root: ctx.cwd, trusted: true }, MAIN_AGENT_ID);
      mapping = next;
      memory.setSessionScope(next.projectIdentity, ctx.sessionManager.getSessionId());
    } catch { delegatedPort.invalidate(); mapping = undefined; }
  };

  pi.registerCommand("memory-auto", {
    description: "自动记忆：t/on 开启，f/off 关闭，s/status 状态；checkpoint 检查点，authorize 授权，revoke 撤销",
    handler: async (args, ctx) => {
      const requested = args.trim() || "status";
      const action = requested === "t" ? "on" : requested === "f" ? "off" : requested === "s" ? "status" : requested;
      if (action === "on") memory.setEnabled(true);
      else if (action === "off") memory.setEnabled(false);
      else if (action === "checkpoint") await memory.checkpoint(branchId(ctx));
      else if (action === "authorize") {
        if (ctx.mode !== "tui" || !ctx.hasUI || !ctx.isProjectTrusted() || !mapping) {
          authority.revoke(); memory.revoke();
          if (ctx.hasUI) ctx.ui.notify("持久记忆授权需要交互式可信项目会话。", "error");
          return;
        }
        authority.revoke(); memory.revoke();
        const approvedMapping = mapping;
        const approvedSessionId = ctx.sessionManager.getSessionId();
        const approved = await ctx.ui.confirm("授权自动持久记忆？", "仅限当前可信会话，允许既定 MemPalace 范围执行搜索和检查点；不含删除或任意写入。");
        if (!approved) { ctx.ui.notify("持久记忆未授权。", "warning"); return; }
        try {
          const installed = parseExactMemPalaceVersion(await resolveProviderVersion());
          if (!installed) throw new Error("incompatible MemPalace version");
          if (mapping !== approvedMapping || ctx.sessionManager.getSessionId() !== approvedSessionId || !ctx.isProjectTrusted()) throw new Error("session changed during version probe");
          evidence = Object.freeze({ accepted: MEMPALACE_VERSION, installed });
          bindProductionPort(ctx, approvedMapping);
        } catch {
          evidence = Object.freeze({ accepted: MEMPALACE_VERSION });
          delegatedPort.invalidate();
          ctx.ui.notify(`持久记忆未授权：MemPalace 版本必须为 ${MEMPALACE_VERSION}。`, "warning");
          return;
        }
        authority.arm({ schemaVersion: 1, id: createHash("sha256").update(approvedSessionId).update("\0").update(approvedMapping.projectIdentity).digest("hex").slice(0, 32), palace: approvedMapping.palace, trustedProject: approvedMapping.projectIdentity, server: MEMORY_SERVER, operations: ["search", "checkpoint"], tools: [...AUTOMATIC_MEMORY_TOOLS], eligibleKinds: [...ALL_KINDS] });
        memory.authorize();
      } else if (action === "revoke") { authority.revoke(); memory.revoke(); }
      else if (action !== "status") { if (ctx.hasUI) ctx.ui.notify("用法：/memory-auto t|f|s（完整命令见帮助）", "error"); return; }
      const status = memory.status();
      const provider = status.provider === "ready" ? "可用" : status.provider === "degraded" ? "异常" : "待验证";
      if (ctx.hasUI) ctx.ui.notify(`本地=${status.enabled ? "开" : "关"}；持久=${status.armed ? "已授权" : "未授权"}；版本=${status.versionCompatible ? "兼容" : "未验证"}；提供方=${provider}；原因=${providerErrorChinese(status.lastProviderError)}；待处理=${status.pendingCount}；活动=${status.activeWorkCount}；拒绝=${status.rejectedCount}；捕获=${chineseOutcome(status.lastCaptureStatus)}；截点=${status.lastCutoffHash?.slice(0, 12) ?? "无"}；检查点=${chineseOutcome(status.lastCheckpoint)}；召回=${chineseOutcome(status.lastRecall)}；操作=${status.cost.observerInvocations}/${status.cost.searchOperations}/${status.cost.checkpointOperations}；召回ID=${status.recalledIds.join(",") || "无"}`, status.provider === "degraded" || !status.versionCompatible ? "warning" : "info");
    },
  });

  // Awaited, side-effect-only barrier. Compaction ownership remains untouched.
  pi.on("session_before_compact", async (event, ctx): Promise<void> => {
    const entries = Array.isArray(event.branchEntries) ? event.branchEntries : [];
    const firstKept = event.preparation?.firstKeptEntryId;
    const keptIndex = typeof firstKept === "string" ? entries.findIndex((entry: any) => entry?.id === firstKept) : -1;
    const lastCompactedIndex = keptIndex >= 0 ? keptIndex - 1 : typeof firstKept === "string" ? entries.length - 1 : -1;
    const compactedEntryIds = entries.slice(0, lastCompactedIndex + 1).flatMap((entry: any) => typeof entry?.id === "string" ? [entry.id] : []);
    if (compactedEntryIds.length > 0) await memory.checkpoint(branchId(ctx), event.signal, compactedEntryIds);
    return undefined;
  });
  pi.on("message_end", (event, ctx) => { const message = event.message as any; if (message.role === "user") capture(ctx, "user", messageText(message), ctx.sessionManager.getLeafId() ?? undefined); else if (message.role === "assistant") capture(ctx, "assistant", messageText(message), ctx.sessionManager.getLeafId() ?? undefined); });
  pi.on("tool_execution_end", (event, ctx) => {
    const receipt = verificationReceipt(event);
    if (receipt) capture(ctx, "tool-outcome", receipt, event.toolCallId);
  });
  pi.on("before_agent_start", async (event, ctx) => {
    if (projectionInjected) return;
    const projection = await memory.recall(event.prompt, [], ctx.signal); if (!projection?.text) return;
    projectionInjected = true;
    return { message: { customType: "observational-memory-recall", content: `${projection.text}\n\n[historical-memory provenance hash=${projection.hash} durableIds=${projection.durableIds.join(",")} sessionIds=${projection.sessionIds.join(",")} omitted=${projection.omitted}; current instructions/repository/contracts/permissions/evidence take precedence]`, display: false } };
  });
  pi.on("agent_settled", () => { projectionInjected = false; });
  pi.on("session_start", async (_event, ctx) => { branchLanes.clear(); await bindSession(ctx); });
  pi.on("session_shutdown", () => { delegatedPort.invalidate(); parentObserver?.invalidate(); authority.revoke(); memory.shutdown(); branchLanes.clear(); mapping = undefined; sequence = 0; projectionInjected = false; });
}
