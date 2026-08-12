import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { relative, resolve, sep, isAbsolute } from "node:path";
import type { CoordinatorJournal } from "./storage.js";
import {
  assertSafeAgentId,
  ensureSidecarLayout,
  replayCoordinator,
  sidecarLayoutForParent,
  validateExactChildSessionPath,
} from "./storage.js";
import type { AgentRecord, FormalResultEvidenceRecord, SidecarLayout } from "./types.js";
import type { NormalizedTaskSettlement } from "./task-coordinator.js";
import { parseCanonicalFormalResult } from "./task-coordinator.js";
import { assertNoCredentialMaterial } from "./permission.js";

export const PARENT_PREVIEW_CHAR_LIMIT = 5_000;
export const BUILTIN_PARENT_DELETE_GAP = "official Pi 0.84.1 built-in Ctrl+D/archive does not cascade AILI sidecars; use confirmed AILI deletion or reconciliation";

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

function ownedAgent(state: ReturnType<CoordinatorJournal["getState"]>, agentId: string): AgentRecord {
  const agent = state.agents[agentId] ?? state.releasedAgents[agentId];
  if (!agent) throw new Error(`${agentId}: Agent is not owned by this parent`);
  return agent;
}

export function agentOutputPath(layout: SidecarLayout, agentId: string): string {
  assertSafeAgentId(agentId);
  const path = resolve(layout.agentsDir, `${agentId}.md`);
  if (!isInside(resolve(layout.agentsDir), path)) throw new Error(`${agentId}: output path escapes agents directory`);
  return path;
}

export async function persistFullAgentOutput(layout: SidecarLayout, agentId: string, fullOutput: string): Promise<string> {
  await assertNoCredentialMaterial(fullOutput, "Agent output artifact");
  const outputPath = agentOutputPath(layout, agentId);
  try {
    const stat = await lstat(outputPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${agentId}: output target is not a real file`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await atomicWrite(outputPath, fullOutput);
  return outputPath;
}

const EVIDENCE_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function formalResultOutputPath(layout: SidecarLayout, agentId: string, jobId: string, turnId: string): string {
  for (const value of [agentId, jobId, turnId]) {
    if (!EVIDENCE_COMPONENT.test(value) || value.includes("..")) throw new Error("unsafe formal result evidence identity");
  }
  const path = resolve(layout.resultsDir, `${agentId}--${jobId}--${turnId}.result`);
  if (!isInside(resolve(layout.resultsDir), path)) throw new Error("formal result evidence path escapes its owned directory");
  return path;
}

function formalIdentity(record: { metadata?: Record<string, unknown> } | undefined): {
  changeId: string;
  packageId: string;
  roleId: string;
} {
  const protection = record?.metadata?.formalProtection as { changeId?: unknown } | undefined;
  const continuation = record?.metadata?.formalContinuationIdentity as { packageId?: unknown; canonicalRole?: unknown } | undefined;
  if (typeof protection?.changeId !== "string" || typeof continuation?.packageId !== "string" || typeof continuation.canonicalRole !== "string") {
    throw new Error("formal result evidence requires exact durable continuation identity");
  }
  return { changeId: protection.changeId, packageId: continuation.packageId, roleId: continuation.canonicalRole };
}

export async function persistFormalResultEvidence(
  layout: SidecarLayout,
  journal: CoordinatorJournal,
  settlement: NormalizedTaskSettlement,
  fullOutput: string,
): Promise<FormalResultEvidenceRecord> {
  if (!settlement.formalResultStatus) throw new Error("formal settlement has no classified result status");
  const state = journal.getState();
  const agent = state.agents[settlement.agentId];
  const job = state.jobs[settlement.jobId];
  const turn = state.turns[settlement.turnId];
  if (!agent || agent.state !== "running" || !job || job.state !== "running" || !turn || turn.state !== "running"
    || job.agentId !== agent.id || turn.agentId !== agent.id || turn.jobId !== job.id) {
    throw new Error("formal result evidence requires the exact running Agent/job/turn");
  }
  const identity = formalIdentity(job);
  if (identity.roleId !== settlement.selector || agent.selector !== settlement.selector
    || JSON.stringify(job.metadata?.formalContinuationIdentity) !== JSON.stringify(agent.metadata?.formalContinuationIdentity)
    || JSON.stringify(job.metadata?.formalContinuationIdentity) !== JSON.stringify(turn.metadata?.formalContinuationIdentity)
    || JSON.stringify(job.metadata?.formalProtection) !== JSON.stringify(agent.metadata?.formalProtection)
    || JSON.stringify(job.metadata?.formalProtection) !== JSON.stringify(turn.metadata?.formalProtection)) {
    throw new Error("formal result evidence identity drifted before settlement");
  }
  if (!agent.sessionPath) throw new Error("formal result evidence requires an exact child history path");
  const historyPath = await validateExactChildSessionPath(layout, agent.sessionPath);
  const historyBytes = await readFile(historyPath);
  const outputBytes = Buffer.from(fullOutput, "utf8");
  await assertNoCredentialMaterial(fullOutput, "formal result evidence");
  const outputPath = formalResultOutputPath(layout, agent.id, job.id, turn.id);
  const handle = await open(outputPath, "wx", 0o600);
  try {
    await handle.writeFile(outputBytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const record = {
    version: 1 as const,
    eventId: "pending",
    eventSequence: 0,
    agentId: agent.id,
    jobId: job.id,
    turnId: turn.id,
    changeId: identity.changeId,
    packageId: identity.packageId,
    roleId: identity.roleId,
    canonicalStatus: settlement.formalResultStatus,
    outputPath,
    outputSha256: sha256(outputBytes),
    outputBytes: outputBytes.byteLength,
    historyPath,
    historyPrefixSha256: sha256(historyBytes),
    historyPrefixBytes: historyBytes.byteLength,
  };
  await journal.append({
    kind: "formal.result.evidence",
    agentId: agent.id,
    jobId: job.id,
    turnId: turn.id,
    payload: { record },
  });
  return journal.getState().formalResultEvidence[job.id]!;
}

export async function verifyFormalResultEvidence(
  layout: SidecarLayout,
  state: ReturnType<CoordinatorJournal["getState"]>,
  record: FormalResultEvidenceRecord,
): Promise<void> {
  const agent = state.agents[record.agentId] ?? state.releasedAgents[record.agentId];
  const job = state.jobs[record.jobId];
  const turn = state.turns[record.turnId];
  if (!agent || !job || !turn || job.agentId !== agent.id || turn.agentId !== agent.id || turn.jobId !== job.id
    || state.formalResultEvidence[record.jobId]?.eventId !== record.eventId
    || state.appliedEventIds[record.eventSequence - 1] !== record.eventId) {
    throw new Error("formal result evidence Journal identity is stale");
  }
  const identity = formalIdentity(job);
  if (identity.changeId !== record.changeId || identity.packageId !== record.packageId || identity.roleId !== record.roleId
    || agent.selector !== record.roleId) throw new Error("formal result evidence continuation identity is stale");
  const expectedOutputPath = formalResultOutputPath(layout, record.agentId, record.jobId, record.turnId);
  if (record.outputPath !== expectedOutputPath || record.historyPath !== agent.sessionPath) {
    throw new Error("formal result evidence path identity is stale");
  }
  const outputStat = await lstat(record.outputPath);
  if (outputStat.isSymbolicLink() || !outputStat.isFile()) throw new Error("formal result output snapshot is not a real file");
  const output = await readFile(record.outputPath);
  if (output.byteLength !== record.outputBytes || sha256(output) !== record.outputSha256) {
    throw new Error("formal result output snapshot changed after settlement");
  }
  const parsed = parseCanonicalFormalResult(output.toString("utf8"), { packageId: record.packageId, roleId: record.roleId });
  if (record.canonicalStatus === "malformed" ? parsed.ok : !parsed.ok || parsed.value.status !== record.canonicalStatus) {
    throw new Error("formal result snapshot classification no longer matches its bytes");
  }
  const historyPath = await validateExactChildSessionPath(layout, record.historyPath);
  const history = await readFile(historyPath);
  if (history.byteLength < record.historyPrefixBytes
    || sha256(history.subarray(0, record.historyPrefixBytes)) !== record.historyPrefixSha256) {
    throw new Error("formal result history settlement prefix changed");
  }
}

export interface BoundedTextResult {
  content: string;
  offset: number;
  limit: number;
  total: number;
  returned: number;
  truncated: boolean;
  source: string;
  diagnostic?: string;
}

function boundedLines(lines: string[], offset: number, limit: number, source: string, diagnostic?: string): BoundedTextResult {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("offset must be a non-negative integer");
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("limit must be a positive integer");
  const selected = lines.slice(offset, offset + limit);
  return {
    content: selected.join("\n"),
    offset,
    limit,
    total: lines.length,
    returned: selected.length,
    truncated: offset > 0 || offset + selected.length < lines.length,
    source,
    diagnostic,
  };
}

export function parseAgentReference(reference: string): { kind: "output" | "history"; agentId: string } {
  const match = reference.match(/^(agent|history):\/\/([^/?#]+)$/);
  if (!match) throw new Error(`invalid Agent reference: ${reference}`);
  const agentId = decodeURIComponent(match[2]!);
  assertSafeAgentId(agentId);
  return { kind: match[1] === "agent" ? "output" : "history", agentId };
}

export async function readAgentOutput(layout: SidecarLayout, journal: CoordinatorJournal, agentId: string, offset = 0, limit = 500): Promise<BoundedTextResult> {
  ownedAgent(journal.getState(), agentId);
  const outputPath = agentOutputPath(layout, agentId);
  const content = await readFile(outputPath, "utf8");
  await assertNoCredentialMaterial(content, "Agent output read");
  return boundedLines(content.length === 0 ? [] : content.split("\n"), offset, limit, outputPath);
}

function entryText(entry: Record<string, unknown>): string {
  if (entry.type === "session") return `[session] ${String(entry.id ?? "")}`.trim();
  if (entry.type === "custom_message") return `[custom:${String(entry.customType ?? "unknown")}] ${String(entry.content ?? "")}`.trim();
  if (entry.type === "message" && entry.message && typeof entry.message === "object") {
    const message = entry.message as Record<string, unknown>;
    const role = String(message.role ?? "message");
    const content = message.content;
    if (typeof content === "string") return `[${role}] ${content}`;
    if (Array.isArray(content)) {
      const parts = content.map((part) => {
        if (!part || typeof part !== "object") return "";
        const item = part as Record<string, unknown>;
        if (typeof item.text === "string") return item.text;
        if (typeof item.name === "string") return `[tool:${item.name}]`;
        return `[${String(item.type ?? "content")}]`;
      }).filter(Boolean);
      return `[${role}] ${parts.join(" ")}`;
    }
    return `[${role}]`;
  }
  return `[${String(entry.type ?? "entry")}]`;
}

export async function readAgentHistory(layout: SidecarLayout, journal: CoordinatorJournal, agentId: string, offset = 0, limit = 500): Promise<BoundedTextResult> {
  const agent = ownedAgent(journal.getState(), agentId);
  if (!agent.sessionPath) throw new Error(`${agentId}: no child Session JSONL is registered`);
  const sessionPath = await validateExactChildSessionPath(layout, agent.sessionPath);
  const content = await readFile(sessionPath, "utf8");
  const rawLines = content.split("\n");
  if (rawLines.at(-1) === "") rawLines.pop();
  const rendered: string[] = [];
  let diagnostic: string | undefined;
  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index]!;
    try {
      rendered.push(entryText(JSON.parse(line) as Record<string, unknown>));
    } catch (error) {
      if (index === rawLines.length - 1 && !content.endsWith("\n")) {
        diagnostic = `ignored final partial child JSONL line (${Buffer.byteLength(line)} bytes)`;
        break;
      }
      throw new Error(`${agentId}: child history corruption at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await assertNoCredentialMaterial(rendered, "Agent history read");
  return boundedLines(rendered, offset, limit, sessionPath, diagnostic);
}

export interface ParentResultMessage {
  customType: "aili.agent-result";
  content: string;
  display: true;
  details: {
    deliveryId: string;
    agentId: string;
    jobId: string;
    turnId: string;
    status: string;
    selector: string;
    effectiveMode: "async";
    requestedModel?: string;
    effectiveModel?: string;
    modelLayer?: string;
    thinking?: string;
    outputRef: string;
    historyRef: string;
    previewTruncated: boolean;
  };
}

export interface ParentDeliveryAdapter {
  scanDeliveryIds(): Promise<Set<string>>;
  send(message: ParentResultMessage): Promise<"sent" | "unavailable">;
}

export function scanDeliveryIdsFromParentEntries(entries: unknown[]): Set<string> {
  const found = new Set<string>();
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const candidates = [entry, entry.message].filter((candidate): candidate is Record<string, unknown> => Boolean(candidate && typeof candidate === "object"));
    for (const candidate of candidates) {
      const customType = candidate.customType ?? entry.customType;
      const details = (candidate.details ?? entry.details) as Record<string, unknown> | undefined;
      if (customType === "aili.agent-result" && typeof details?.deliveryId === "string") found.add(details.deliveryId);
    }
  }
  return found;
}

function preview(fullOutput: string): { content: string; truncated: boolean } {
  if (fullOutput.length <= PARENT_PREVIEW_CHAR_LIMIT) return { content: fullOutput, truncated: false };
  return { content: fullOutput.slice(-PARENT_PREVIEW_CHAR_LIMIT), truncated: true };
}

export class AsyncDeliveryService {
  private readonly deliveryTails = new Map<string, Promise<void>>();

  constructor(
    private readonly layout: SidecarLayout,
    private readonly journal: CoordinatorJournal,
    private readonly parent: ParentDeliveryAdapter,
  ) {}

  async complete(settlement: NormalizedTaskSettlement, fullOutput: string): Promise<{ deliveryId?: string; status: "skipped-sync" | "pending" | "delivered"; deduplicated?: boolean }> {
    if (!settlement.deliveryRequired || !settlement.async) return { status: "skipped-sync" };
    const deliveryId = `delivery-${settlement.jobId}`;
    return await this.withDeliveryLock(deliveryId, async () => await this.completeLocked(settlement, fullOutput, deliveryId));
  }

  private async completeLocked(settlement: NormalizedTaskSettlement, fullOutput: string, deliveryId: string): Promise<{ deliveryId: string; status: "pending" | "delivered"; deduplicated?: boolean }> {
    const state = this.journal.getState();
    const agent = ownedAgent(state, settlement.agentId);
    const existing = state.deliveries[deliveryId];
    if (existing) {
      if (existing.agentId !== settlement.agentId || existing.jobId !== settlement.jobId) throw new Error(`${deliveryId}: conflicting retry ownership`);
      if (existing.status === "delivered") return { deliveryId, status: "delivered", deduplicated: true };
      return await this.deliver(deliveryId);
    }
    if (!agent.sessionPath) throw new Error(`${settlement.agentId}: child session path must exist before async delivery`);
    await persistFullAgentOutput(this.layout, settlement.agentId, fullOutput);
    await validateExactChildSessionPath(this.layout, agent.sessionPath);
    const outputPreview = preview(fullOutput);
    await this.journal.append({
        kind: "delivery.put",
        agentId: settlement.agentId,
        jobId: settlement.jobId,
        turnId: settlement.turnId,
        deliveryId,
        payload: {
          status: "pending",
          deliveryId,
          agentId: settlement.agentId,
          jobId: settlement.jobId,
          turnId: settlement.turnId,
          resultStatus: settlement.status,
          selector: settlement.selector,
          effectiveMode: settlement.effectiveMode,
          requestedModel: settlement.model.requested,
          effectiveModel: settlement.model.provider && settlement.model.model
            ? `${settlement.model.provider}/${settlement.model.model}`
            : undefined,
          modelLayer: settlement.model.layer,
          thinking: settlement.model.thinking,
          outputRef: settlement.outputRef,
          historyRef: settlement.historyRef,
          preview: outputPreview.content,
          previewTruncated: outputPreview.truncated,
        },
      });
    return await this.deliver(deliveryId);
  }

  async recoverPending(): Promise<Array<{ deliveryId: string; status: "pending" | "delivered"; deduplicated?: boolean }>> {
    const ids = Object.entries(this.journal.getState().deliveries)
      .filter(([, delivery]) => delivery.status === "pending")
      .map(([id]) => id);
    const results = [];
    for (const id of ids) results.push(await this.withDeliveryLock(id, async () => await this.deliver(id)));
    return results;
  }

  private async withDeliveryLock<T>(deliveryId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.deliveryTails.get(deliveryId) ?? Promise.resolve();
    const current = previous.then(operation);
    const tail = current.then(() => undefined, () => undefined);
    this.deliveryTails.set(deliveryId, tail);
    try {
      return await current;
    } finally {
      if (this.deliveryTails.get(deliveryId) === tail) this.deliveryTails.delete(deliveryId);
    }
  }

  private async deliver(deliveryId: string): Promise<{ deliveryId: string; status: "pending" | "delivered"; deduplicated?: boolean }> {
    const delivery = this.journal.getState().deliveries[deliveryId];
    if (!delivery) throw new Error(`${deliveryId}: unknown delivery`);
    if (delivery.status === "delivered") return { deliveryId, status: "delivered", deduplicated: true };
    const existing = await this.parent.scanDeliveryIds();
    if (existing.has(deliveryId)) {
      await this.ack(deliveryId, delivery);
      return { deliveryId, status: "delivered", deduplicated: true };
    }
    const truncated = delivery.previewTruncated === true;
    const content = [
      `Agent ${delivery.agentId} job ${delivery.jobId} ${delivery.resultStatus}.`,
      truncated ? `[preview truncated to ${PARENT_PREVIEW_CHAR_LIMIT} characters; full output: ${delivery.outputRef}]` : `Full output: ${delivery.outputRef}`,
      String(delivery.preview ?? ""),
      `History: ${delivery.historyRef}`,
    ].join("\n");
    let sent: "sent" | "unavailable";
    try {
      sent = await this.parent.send({
        customType: "aili.agent-result",
        content,
        display: true,
        details: {
          deliveryId,
          agentId: String(delivery.agentId),
          jobId: String(delivery.jobId),
          turnId: String(delivery.turnId),
          status: String(delivery.resultStatus),
          selector: String(delivery.selector),
          effectiveMode: "async",
          ...(typeof delivery.requestedModel === "string" ? { requestedModel: delivery.requestedModel } : {}),
          ...(typeof delivery.effectiveModel === "string" ? { effectiveModel: delivery.effectiveModel } : {}),
          ...(typeof delivery.modelLayer === "string" ? { modelLayer: delivery.modelLayer } : {}),
          ...(typeof delivery.thinking === "string" ? { thinking: delivery.thinking } : {}),
          outputRef: String(delivery.outputRef),
          historyRef: String(delivery.historyRef),
          previewTruncated: truncated,
        },
      });
    } catch {
      return { deliveryId, status: "pending" };
    }
    if (sent === "unavailable") return { deliveryId, status: "pending" };
    await this.ack(deliveryId, delivery);
    return { deliveryId, status: "delivered" };
  }

  private async ack(deliveryId: string, delivery: Record<string, unknown>): Promise<void> {
    await this.journal.append({
      kind: "delivery.put",
      agentId: String(delivery.agentId),
      jobId: String(delivery.jobId),
      turnId: String(delivery.turnId),
      deliveryId,
      payload: { ...delivery, status: "delivered", deliveredAt: new Date().toISOString() },
    });
  }
}

export async function initializeEmptyForkSidecar(parentSessionPath: string, parentId: string): Promise<{ layout: SidecarLayout; diagnostic: string }> {
  const layout = await ensureSidecarLayout(parentSessionPath);
  const replay = await replayCoordinator(layout, parentId);
  if (replay.state.lastSequence !== 0 || Object.keys(replay.state.agents).length > 0 || Object.keys(replay.state.releasedAgents).length > 0) {
    throw new Error("fork sidecar is not empty; existing child artifacts are never copied, adopted, or reset");
  }
  return { layout, diagnostic: "fork registry initialized empty; no child artifacts copied" };
}

export async function inspectParentSidecar(parentSessionPath: string): Promise<{ status: "attached" | "orphaned" | "missing"; root: string; diagnostic: string }> {
  const layout = sidecarLayoutForParent(parentSessionPath);
  let parentExists = true;
  let rootExists = true;
  try { await lstat(parentSessionPath); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") parentExists = false; else throw error; }
  try { await lstat(layout.root); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") rootExists = false; else throw error; }
  if (!rootExists) return { status: "missing", root: layout.root, diagnostic: BUILTIN_PARENT_DELETE_GAP };
  return {
    status: parentExists ? "attached" : "orphaned",
    root: layout.root,
    diagnostic: parentExists ? BUILTIN_PARENT_DELETE_GAP : `orphaned sidecar preserved; ${BUILTIN_PARENT_DELETE_GAP}`,
  };
}

export async function confirmedDeleteParentAndSidecar(options: {
  parentSessionPath: string;
  parentId: string;
  confirmation: string;
}): Promise<{ deletedParent: boolean; deletedSidecar: boolean }> {
  if (options.confirmation !== `DELETE ${options.parentId}`) throw new Error("exact parent deletion confirmation is required");
  const layout = sidecarLayoutForParent(options.parentSessionPath);
  const rootStat = await lstat(layout.root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("owned sidecar root must be a real directory");
  const canonicalRoot = await realpath(layout.root);
  if (canonicalRoot !== resolve(layout.root)) throw new Error("owned sidecar canonical root mismatch");
  await replayCoordinator(layout, options.parentId);
  await rm(layout.root, { recursive: true, force: false });
  await rm(options.parentSessionPath, { force: false });
  return { deletedParent: true, deletedSidecar: true };
}
