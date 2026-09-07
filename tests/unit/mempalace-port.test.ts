import { describe, expect, it } from "vitest";
import { DEFAULT_MEMPALACE_VERSION_EVIDENCE, exactMemPalaceVersionCompatible } from "../../extensions/observational-memory/index.js";
import { MEMPALACE_PATH, type MemPalaceScopeMapping } from "../../src/runtime/mempalace.js";
import {
  DelegatingMemPalacePort,
  FakeSessionMcpInvoker,
  SessionMemPalacePort,
  StandingMemoryAuthority,
  canonicalCandidateFingerprint,
  classifyRecalledMemory,
  type AutomaticMemoryCandidate,
  type AutomaticMemoryPolicy,
  type DurableMemoryRecord,
  type MemoryApplicability,
  type MemoryKind,
} from "../../src/runtime/observational-memory/index.js";

const mapping: MemPalaceScopeMapping = { palace: MEMPALACE_PATH, projectIdentity: "project-id", wing: "project-project-id", shared: "shared", diary: "agent-project-id" };
function policy(overrides: Partial<AutomaticMemoryPolicy> = {}): AutomaticMemoryPolicy {
  return { schemaVersion: 1, id: "policy", palace: MEMPALACE_PATH, trustedProject: mapping.projectIdentity, server: "memory", operations: ["search", "checkpoint"], tools: ["mempalace_search", "mempalace_check_duplicate", "mempalace_add_drawer", "mempalace_diary_write"], eligibleKinds: ["preference", "reusable-solution", "project-decision", "recovery-point"], ...overrides };
}
function candidate(kind: MemoryKind = "project-decision", supersedes?: string): AutomaticMemoryCandidate {
  const applicability: MemoryApplicability = kind === "preference" ? "global-preference" : kind;
  const base = { schemaVersion: 1 as const, id: `candidate-${kind}`, kind, applicability, content: `stable ${kind}`, confidence: 0.9, support: (kind === "preference" ? "explicit" : kind === "reusable-solution" ? "verified" : "accepted") as "explicit" | "accepted" | "verified", sourceIds: ["source-1"], sourceEntryIds: ["entry-1"], sourceProject: "/trusted/project", sourceCutoff: { schemaVersion: 1 as const, sessionId: "session", branchId: "main", fromEntryId: "1", coversUpToId: "2", sourceCount: 2, estimatedTokens: 20, contentHash: "a".repeat(64) }, ...(supersedes ? { supersedes } : {}) };
  return { ...base, fingerprint: canonicalCandidateFingerprint(base) };
}
function port(invoker: FakeSessionMcpInvoker, authority = new StandingMemoryAuthority(policy()), supportsSupersede = false) { return new SessionMemPalacePort({ invoker, authority, mapping, server: "memory", agentId: "agent", sessionId: "session", supportsSupersede, providerVersion: "3.9.0" }); }

describe("Parent-owned MemPalace port", () => {
  it("fails closed before lazy binding and requires exact provider version evidence", async () => {
    const delegate = new DelegatingMemPalacePort();
    await expect(delegate.search({ query: "decision", maximumResults: 4, kinds: ["project-decision"] })).resolves.toMatchObject({ status: "unavailable" });
    expect(DEFAULT_MEMPALACE_VERSION_EVIDENCE).toEqual({ accepted: "3.9.0" });
    expect(exactMemPalaceVersionCompatible({ accepted: "3.9.0", installed: "3.7.0" })).toBe(false);
    expect(exactMemPalaceVersionCompatible({ accepted: "3.9.0", installed: "3.9.0" })).toBe(true);
  });

  it("uses only the injected session invocation seam and exact bounded operations", async () => {
    const item = candidate("preference");
    const invoker = new FakeSessionMcpInvoker("connected", ({ tool }) => {
      if (tool === "mempalace_search") return { query: "typescript preference", filters: {}, total_before_filter: 0, results: [] };
      if (tool === "mempalace_check_duplicate") return { is_duplicate: false, matches: [] };
      if (tool === "mempalace_add_drawer") return { success: true, drawer_id: "provider-1", reason: "created" };
      return { success: true, entry_id: "diary-1" };
    });
    await expect(port(invoker).search({ query: "typescript preference", maximumResults: 5, kinds: ["preference"] })).resolves.toMatchObject({ status: "success", value: { records: [] } });
    await expect(port(invoker).checkpoint([item])).resolves.toMatchObject({ status: "success", value: { receipts: [{ candidateId: item.id, outcome: "committed", providerIds: ["provider-1"] }], diaryProviderId: "diary-1" } });
    expect(invoker.calls.map((call) => call.tool)).toEqual(["mempalace_search", "mempalace_check_duplicate", "mempalace_add_drawer", "mempalace_diary_write"]);
    expect(invoker.calls[0]?.args).toEqual({ query: "typescript preference", limit: 5 });
    expect(invoker.calls[2]?.args).toMatchObject({ wing: mapping.wing, room: "preferences", added_by: "agent" });
    const probe = JSON.parse(String(invoker.calls[1]?.args.content));
    expect(probe).toEqual({ applicability: "global-preference", content: item.content, kind: "preference", schema: "aili.observational-memory-semantic/v1" });
    expect(String(invoker.calls[1]?.args.content)).not.toContain("sourceSession");
    expect(JSON.parse(String(invoker.calls[2]?.args.content))).toMatchObject({ schema: "aili.observational-memory/v1", fingerprint: item.fingerprint, applicability: "global-preference", sourceProject: expect.stringMatching(/^project-[a-f0-9]{24}$/), projectIdentity: mapping.projectIdentity });
    expect(String(invoker.calls[2]?.args.content)).not.toContain("/trusted/project");
    const diaryEntry = String(invoker.calls[3]?.args.entry);
    expect(diaryEntry).toContain("[preference] stable preference");
    expect(diaryEntry.length).toBeLessThanOrEqual(2_048);
    expect(diaryEntry).not.toContain("source-1");
  });

  it("fails closed for revoked, mismatched, unavailable, auth-required and cancelled operations", async () => {
    const invoker = new FakeSessionMcpInvoker(); const authority = new StandingMemoryAuthority(policy()); const subject = port(invoker, authority);
    const withoutVersionEvidence = new SessionMemPalacePort({ invoker, authority, mapping, server: "memory", agentId: "agent", sessionId: "session" });
    const mismatchedVersion = new SessionMemPalacePort({ invoker, authority, mapping, server: "memory", agentId: "agent", sessionId: "session", providerVersion: "3.7.0" });
    await expect(withoutVersionEvidence.search({ query: "decision", maximumResults: 4, kinds: ["project-decision"] })).resolves.toMatchObject({ status: "unavailable", reason: expect.stringContaining("not been evidenced") });
    await expect(mismatchedVersion.search({ query: "decision", maximumResults: 4, kinds: ["project-decision"] })).resolves.toMatchObject({ status: "unavailable" });
    authority.revoke("2026-08-28T00:00:00.000Z");
    await expect(subject.search({ query: "decision", maximumResults: 4, kinds: ["project-decision"] })).resolves.toMatchObject({ status: "denied" });
    expect(invoker.calls).toHaveLength(0);
    const unavailable = new FakeSessionMcpInvoker("failed");
    await expect(port(unavailable).checkpoint([candidate()])).resolves.toMatchObject({ status: "unavailable" });
    unavailable.setServerState("needs-auth");
    await expect(port(unavailable).checkpoint([candidate()])).resolves.toMatchObject({ status: "auth-required" });
    const controller = new AbortController(); controller.abort();
    await expect(port(new FakeSessionMcpInvoker()).checkpoint([candidate()], controller.signal)).resolves.toMatchObject({ status: "cancelled" });
  });

  it("reconciles exact fingerprints and never blindly retries ambiguous completion", async () => {
    const item = candidate("reusable-solution");
    let duplicateChecks = 0;
    const invoker = new FakeSessionMcpInvoker("connected", ({ tool }) => {
      if (tool === "mempalace_check_duplicate") return ++duplicateChecks === 1
        ? { is_duplicate: false, matches: [] }
        : { is_duplicate: true, matches: [{ id: "existing" }] };
      if (tool === "mempalace_add_drawer") return { success: false, reason: "connection lost after dispatch" };
      return { query: item.fingerprint, filters: {}, total_before_filter: 0, results: [] };
    });
    await expect(port(invoker).checkpoint([item])).resolves.toMatchObject({ status: "ambiguous" });
    expect(invoker.calls.map((call) => call.tool)).toEqual(["mempalace_check_duplicate", "mempalace_add_drawer"]);
    await expect(port(invoker).reconcileDuplicate(item)).resolves.toEqual({ status: "success", value: { duplicate: true, providerIds: ["existing"] } });
  });

  it("uses only evidenced non-destructive supersede links", async () => {
    const item = candidate("project-decision", "provider-prior"); const invoker = new FakeSessionMcpInvoker();
    await expect(port(invoker).checkpoint([item])).resolves.toMatchObject({ status: "denied" });
    expect(invoker.calls).toHaveLength(0);
    const supported = new FakeSessionMcpInvoker("connected", ({ tool }) => tool === "mempalace_check_duplicate"
      ? { is_duplicate: false, matches: [] }
      : tool === "mempalace_add_drawer" ? { success: true, drawer_id: "new", reason: "created" } : { success: true, entry_id: "diary" });
    await port(supported, new StandingMemoryAuthority(policy()), true).checkpoint([item]);
    expect(JSON.parse(String(supported.calls[1]?.args.content))).toMatchObject({ supersedes: "provider-prior", status: "active" });
  });

  it("treats vector-disabled duplicate checks as unavailable and recognizes exact idempotent replay", async () => {
    const item = candidate();
    const disabled = new FakeSessionMcpInvoker("connected", () => ({ is_duplicate: false, matches: [], vector_disabled: true, reason: "vectors unavailable" }));
    await expect(port(disabled).checkpoint([item])).resolves.toMatchObject({ status: "unavailable", reason: expect.stringContaining("vectors are disabled") });
    expect(disabled.calls).toHaveLength(1);

    const replay = new FakeSessionMcpInvoker("connected", ({ tool }) => tool === "mempalace_check_duplicate"
      ? { is_duplicate: false, matches: [] }
      : tool === "mempalace_add_drawer" ? { success: true, reason: "already_exists", drawer_id: "stable-existing" } : { success: true, entry_id: "diary" });
    await expect(port(replay).checkpoint([item])).resolves.toMatchObject({ status: "success", value: { receipts: [{ outcome: "duplicate", providerIds: ["stable-existing"] }] } });
  });

  it("deduplicates reusable global semantics across projects while retaining project-scoped identity", () => {
    for (const kind of ["preference", "reusable-solution"] as const) {
      const first = candidate(kind);
      expect(canonicalCandidateFingerprint({ ...first, sourceProject: "/another/project" })).toBe(first.fingerprint);
    }
    for (const kind of ["project-decision", "recovery-point"] as const) {
      const first = candidate(kind);
      expect(canonicalCandidateFingerprint({ ...first, sourceProject: "/another/project" })).not.toBe(first.fingerprint);
    }
  });

  it("preserves global source scope and never applies a foreign project decision as authority", () => {
    const base: DurableMemoryRecord = { id: "memory", fingerprint: "b".repeat(64), kind: "project-decision", applicability: "project-decision", content: "use architecture A", sourceProject: "/other/project", projectIdentity: "other", sourceAgent: "agent", sourceSession: "session", confidence: 0.9, status: "active" };
    expect(classifyRecalledMemory(base, mapping.projectIdentity, "session")).toBe("reference-only");
    expect(classifyRecalledMemory({ ...base, kind: "preference", applicability: "global-preference" }, mapping.projectIdentity, "new-session")).toBe("applicable");
    expect(classifyRecalledMemory({ ...base, kind: "recovery-point", applicability: "recovery-point", projectIdentity: mapping.projectIdentity }, mapping.projectIdentity, "other-session")).toBe("reference-only");
  });
});
