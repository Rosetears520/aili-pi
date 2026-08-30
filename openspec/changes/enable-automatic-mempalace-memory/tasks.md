## 1. Contracts and Source Coverage

- [x] 1.1 Extend observation/candidate types with source cutoffs, memory kind/applicability, source project, expiry, supersedes, fingerprint, policy and receipt schemas; verify malformed, oversized, body-bearing receipt and incompatible-version tests fail closed.
- [x] 1.2 Implement bounded source-envelope capture and token accounting across user, assistant and relevant tool outcomes while excluding retry/memory-internal/raw-log events; verify exact coverage, overlap, branch, redaction and retention tests.

## 2. Hybrid Observer and Promotion Policy

- [x] 2.1 Implement token and high-value event scheduling through the managed-internal scheduler with coalescing, one initial observer concurrency and no public Agent/Herdr/spawn recursion; verify ordinary runs do not invoke the observer and qualifying triggers do.
- [x] 2.2 Implement schema-constrained observer extraction plus deterministic post-validation for preference, reusable solution, project decision and recovery point candidates; verify unsupported inference, sensitive/private content, ordinary chatter and self-observation are rejected.
- [x] 2.3 Replace pre-write in-memory promotion marking with candidate state and canonical fingerprints that commit only after provider settlement; verify exact duplicates, semantic duplicates, conflicts, supersedes, ambiguous completion and bounded retry/reconciliation.

## 3. Parent-owned MemPalace Port and Authority

- [x] 3.1 Add a typed Parent-owned MemPalace port for bounded search, checkpoint, duplicate reconciliation and supported supersede behavior using the existing session MCP lifecycle; verify fake-provider schemas, cancellation, unavailable/auth-required states and that no second MCP client or fallback store exists.
- [x] 3.2 Add a revocable standing policy bound to Palace, trusted project identity, exact server/tools and eligible memory classes; verify covered search/checkpoint operations require no per-candidate prompt while delete/import/mining/initialization/destructive replacement remain denied without separate authority.
- [x] 3.3 Map accepted candidates to one globally searchable Palace with global-preference, reusable-solution, project-decision and recovery-point applicability plus stable Agent diary organization; verify cross-project search preserves source and never applies a foreign project decision as current authority.

## 4. Pre-compaction Boundary and Recall

- [x] 4.1 Add a side-effect-only pre-compaction listener that drains the existing source cutoff and attempts one bounded checkpoint before returning; verify it returns no replacement compaction content and does not import, edit, call, suppress or reconfigure any compaction implementation, owner, threshold, route or output.
- [x] 4.2 Verify success, no-candidate, provider-unavailable, explicit provider-retry and ambiguous-settlement paths all allow the unchanged compaction lifecycle to continue and retain truthful observation/checkpoint status.
- [x] 4.3 Implement task/topic-scoped MemPalace recall with keyword-only query, separate context, sanitization, conflict/expiry suppression, cross-project applicability, deterministic dual token budgets and one injection per Agent run; verify current user/repository/contract/permission/evidence precedence.
- [x] 4.4 Implement bounded pending-ID, active-batch and active-task projection lifecycle; verify success/rejection/expiry/switch/shutdown release references, no body duplication, no disk cache/outbox and bounded degraded behavior at capacity.

## 5. Controls, Documentation and Integration

- [x] 5.1 Extend `/memory-auto` with default-on status, checkpoint, enable/disable and standing-policy revocation state; verify output exposes only bounded counts, cutoffs, IDs/hashes/cost/provider outcomes and no memory bodies.
- [x] 5.2 Update README, doctor/capabilities and migration notes to distinguish local observation, armed automatic external operations, logical applicability and unchanged compaction ownership; verify package/generated/capability/doctor checks.
- [x] 5.3 Run focused memory/MCP/context compatibility tests, typecheck, full repository tests and strict OpenSpec validation; record live MemPalace operations as `Unverified` unless separately authorized and executed against the target Palace.
