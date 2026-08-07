import { digest, extractText, isRecord, type SessionLikeEntry } from "./contracts.js";
import type {
  FrozenQualityFactV1,
  FrozenQualitySourceV1,
  QualityFactClass,
  QualityFactStatus,
  QualityIdentityContextV1,
} from "./quality.js";
import type { V3SemanticBlock } from "./v3.js";

export const QUALITY_SOURCE_EXTRACTOR_VERSION = "aili-quality-source-v1" as const;
const MAX_FACTS = 256;
const MAX_FACT_TEXT = 16_000;
const MAX_ANCHOR = 512;

export interface FreezeMessageQualitySourceInput {
  entries: readonly SessionLikeEntry[];
  orderedEntryIds: readonly string[];
  orderedRefs: readonly string[];
  catalogId: string;
  sourceDigest: string;
  branchLeafId: string;
  epochId: string;
}

export interface QualityIdentityInput {
  entries: readonly SessionLikeEntry[];
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  sessionPath?: string;
}

export interface FreezeBlockQualitySourceInput {
  children: readonly { blockRef: string; block: V3SemanticBlock }[];
  catalogId: string;
  sourceDigest: string;
  canonicalSessionPathDigest: string;
  branchLeafId: string;
  epochId: string;
}

/**
 * Freezes the exact already-selected message source. The result is runtime-only:
 * source text and anchors must never be copied into a Session transaction.
 */
export function freezeMessageQualitySource(input: FreezeMessageQualitySourceInput): FrozenQualitySourceV1 {
  const byId = new Map(input.entries.map((entry) => [entry.id, entry]));
  const facts: FrozenQualityFactV1[] = [];
  const seen = new Set<string>();
  for (const entryId of input.orderedEntryIds) {
    const entry = byId.get(entryId);
    if (!entry || entry.type !== "message" || !isRecord(entry.message)) continue;
    const durableRefs = [{
      kind: "message" as const,
      branchLeafId: input.branchLeafId,
      epochId: input.epochId,
      entryId,
    }];
    const eligibility = sourceEligibility(entry.message);
    const protocol = protocolDescriptor(entry.message);
    if (protocol) {
      appendFact(facts, seen, {
        class: "protocol-provenance",
        durableRefs,
        text: protocol.text,
        anchors: [protocol.anchor],
        current: true,
        releaseRelevant: false,
        status: protocol.status,
        eligibility,
      });
    }
    const text = extractText(entry.message.content);
    for (const fragment of factFragments(text)) {
      const classified = classifyFact(fragment);
      appendFact(facts, seen, {
        ...classified,
        durableRefs,
        text: fragment.slice(0, MAX_FACT_TEXT),
        anchors: [factAnchor(fragment)],
        eligibility,
      });
      if (facts.length >= MAX_FACTS) break;
    }
    if (facts.length >= MAX_FACTS) break;
  }
  return {
    version: 1,
    catalogId: input.catalogId,
    sourceKind: "messages",
    orderedRefs: [...input.orderedRefs],
    sourceDigest: input.sourceDigest,
    facts,
  };
}

/** Freezes accepted child summaries for T2/T3 quality evaluation only. */
export function freezeBlockQualitySource(input: FreezeBlockQualitySourceInput): FrozenQualitySourceV1 {
  const facts: FrozenQualityFactV1[] = [];
  const seen = new Set<string>();
  for (const { block } of input.children) {
    const durableRefs: FrozenQualityFactV1["durableRefs"] = [
      {
        kind: "message",
        branchLeafId: input.branchLeafId,
        epochId: input.epochId,
        entryId: block.anchorEntryId,
      },
      {
        kind: "history",
        canonicalSessionPathDigest: input.canonicalSessionPathDigest,
        branchLeafId: input.branchLeafId,
        entryId: block.anchorEntryId,
      },
    ];
    for (const fragment of factFragments(block.summary)) {
      const classified = classifyFact(fragment);
      appendFact(facts, seen, {
        ...classified,
        durableRefs,
        text: fragment.slice(0, MAX_FACT_TEXT),
        anchors: [factAnchor(fragment)],
        eligibility: "eligible",
      });
      if (facts.length >= MAX_FACTS) break;
    }
    if (facts.length >= MAX_FACTS) break;
  }
  return {
    version: 1,
    catalogId: input.catalogId,
    sourceKind: "blocks",
    orderedRefs: input.children.map(({ blockRef }) => blockRef),
    sourceDigest: input.sourceDigest,
    facts,
  };
}

export function buildQualityIdentityContext(input: QualityIdentityInput): QualityIdentityContextV1 {
  const messageEntryIds = input.entries.filter((entry) => entry.type === "message").map((entry) => entry.id);
  return {
    version: 1,
    sessionId: input.sessionId,
    branchLeafId: input.branchLeafId,
    epochId: input.epochId,
    canonicalSessionPathDigest: digest(input.sessionPath ?? `session:${input.sessionId}`),
    agentIds: collectIdentityValues(input.entries, ["agentId"]),
    jobIds: collectIdentityValues(input.entries, ["jobId", "taskId"]),
    turnEntryIds: collectTurnIds(input.entries),
    messageEntryIds,
    historyEntryIds: input.entries.map((entry) => entry.id),
  };
}

function appendFact(facts: FrozenQualityFactV1[], seen: Set<string>, fact: FrozenQualityFactV1): void {
  if (facts.length >= MAX_FACTS || fact.anchors.some((anchor) => anchor.length === 0)) return;
  const key = digest({ class: fact.class, refs: fact.durableRefs, text: fact.text });
  if (seen.has(key)) return;
  seen.add(key);
  facts.push(fact);
}

function factFragments(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split(/\n+|(?<=[.!?。！？；;])\s+/u)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_FACTS);
}

function classifyFact(text: string): Omit<FrozenQualityFactV1, "durableRefs" | "eligibility" | "text" | "anchors"> {
  const lower = text.toLocaleLowerCase("en-US");
  let factClass: QualityFactClass;
  let status: QualityFactStatus = "active";
  let current = true;
  if (matches(lower, ["error", "failed", "failure", "blocker", "blocked", "exception", "错误", "失败", "阻塞"])) {
    factClass = "failure-blocker"; status = "failed";
  } else if (matches(lower, ["todo", "pending", "next ", "unfinished", "unverified", "待办", "未完成", "下一步", "未验证"])) {
    factClass = "open-work"; status = lower.includes("unverified") || lower.includes("未验证") ? "unverified" : "open";
  } else if (matches(lower, ["must", "must not", "require", "constraint", "goal", "scope", "approval", "必须", "不得", "目标", "范围", "授权"])) {
    factClass = "goal-constraint";
  } else if (matches(lower, ["decided", "decision", "accepted", "rejected", "default", "invariant", "决定", "采用", "拒绝", "默认", "不变量"])) {
    factClass = "decision";
  } else if (matches(lower, ["test", "verify", "verified", "pass", "check", "测试", "验证", "通过", "检查"])) {
    factClass = "verification"; status = matches(lower, ["unverified", "未验证"]) ? "unverified" : "passed";
  } else if (looksLikeArtifact(text)) {
    factClass = "artifact-symbol";
  } else if (matches(lower, ["resolved", "superseded", "obsolete", "done", "已解决", "已完成", "被取代", "过时"])) {
    factClass = "resolved-detail"; status = "resolved"; current = false;
  } else {
    factClass = "resolved-detail"; status = "neutral"; current = false;
  }
  return {
    class: factClass,
    current,
    releaseRelevant: matches(lower, ["release", "publish", "package", "version", "ci", "发布", "版本", "上线"]),
    status,
  };
}

function factAnchor(text: string): string {
  const symbol = text.match(/`([^`\r\n]{1,256})`/u)?.[1]
    ?? text.match(/(?:[A-Za-z0-9_.-]+[\\/]){1,8}[A-Za-z0-9_.-]+/u)?.[0]
    ?? text.match(/\bv?\d+\.\d+(?:\.\d+)?\b/u)?.[0]
    ?? text.match(/\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+\b/u)?.[0];
  return (symbol ?? text).slice(0, MAX_ANCHOR);
}

function sourceEligibility(message: Record<string, unknown>): FrozenQualityFactV1["eligibility"] {
  const serialized = JSON.stringify(message.content ?? "");
  if (/\b(?:bearer\s+[a-z0-9._~+/=-]{8,}|akia[0-9a-z]{12,}|(?:api[_-]?key|password|passwd|secret|token)\s*[:=]\s*[^\s,;]{4,})/iu.test(serialized)) {
    return "credential";
  }
  if (containsBinaryPart(message.content)) return "binary";
  return "eligible";
}

function containsBinaryPart(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsBinaryPart);
  if (!isRecord(value)) return false;
  if (typeof value.type === "string" && /^(?:image|image_url|audio|video|file|binary)$/u.test(value.type)) return true;
  return Object.values(value).some(containsBinaryPart);
}

function protocolDescriptor(message: Record<string, unknown>): { text: string; anchor: string; status: QualityFactStatus } | undefined {
  const calls = [
    ...(Array.isArray(message.toolCalls) ? message.toolCalls : []),
    ...(Array.isArray(message.content) ? message.content.filter((part) => isRecord(part) && part.type === "toolCall") : []),
  ].filter(isRecord);
  if (calls.length > 0) {
    const names = calls.map((call) => typeof call.name === "string" ? call.name : "unknown-tool");
    return { text: `tool call ${names.join(",")}`, anchor: names[0]!, status: "active" };
  }
  if (message.role === "toolResult") {
    const name = typeof message.toolName === "string" ? message.toolName : "unknown-tool";
    return { text: `tool result ${name} ${message.isError === true ? "failed" : "completed"}`, anchor: name, status: message.isError === true ? "failed" : "passed" };
  }
  return undefined;
}

function collectIdentityValues(entries: readonly SessionLikeEntry[], keys: readonly string[]): string[] {
  const values = new Set<string>();
  for (const entry of entries) {
    const records = [entry.data, entry.details, entry.message].filter(isRecord);
    for (const record of records) for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0 && value.length <= 256) values.add(value);
    }
  }
  return [...values].sort();
}

function collectTurnIds(entries: readonly SessionLikeEntry[]): string[] {
  return entries.filter((entry) => entry.type === "message" && isRecord(entry.message) && entry.message.role === "user")
    .map((entry) => entry.id);
}

function looksLikeArtifact(value: string): boolean {
  return /`[^`]+`|(?:[A-Za-z0-9_.-]+[\\/]){1,8}[A-Za-z0-9_.-]+|\b(?:api|schema|version|class|function|interface|command)\b/iu.test(value);
}

function matches(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}
