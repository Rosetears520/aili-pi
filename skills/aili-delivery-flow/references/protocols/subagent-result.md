# Subagent Result

This is the one canonical terminal result and finding envelope for delegated review, test, security, coverage, convergence, evaluator, and focused-recheck lanes. Return only what ROSE needs to decide the next action; the Task context closes after this result or failure.

```text
CANONICAL RESULT:
result_id:
trace_id:
lane:
owner:
status: completed | partial | blocked | unverified
confidence: HIGH | MED | LOW | VERY LOW | UNKNOWN
worktree_context_ref: <context_id, evidence_version, freshness, mode> | N/A
declared_repository:
cwd:
target_rules_ref:
artifact_destination:
inspected_scope:
checks:
freshness:
skipped_checks:
soft_boundary_limitations:
blockers:
unverified:
findings:
convergence_links:
review_arbitration_ref: openspec/changes/<change-id>/review-arbitration.md | N/A
```

Each finding has exactly:

```text
finding_id:
source:
claim:
severity:
evidence_anchors:
affected_requirement:
proposed_disposition: fix | refute-with-counter-evidence | accept-named-risk | Unverified-block
required_action:
verification:
```

P6 compatibility markers remain aliases, not a second envelope: `STATUS: completed | partial | blocked | unverified`, `WT-001 context ref`, `EVIDENCE:`, and `BLOCKERS:` map to `status`, `worktree_context_ref`, finding/evidence anchors, and `blockers` above.

## Rules

- Evidence must support the reported status.
- Keep raw logs, broad dumps, and full files out of the result.
- Mark unsupported claims `Unverified`.
- A no-finding result uses `findings: []` and still reports inspected scope, checks, freshness, skipped checks, blockers, and `Unverified` items.
- Do not issue the final PASS, acceptance, release, or integration decision.
- Never resume the result's old `task_id` for follow-up, clarification, continuation, repair, recheck, or additional work.
- A failed, empty, blocked, or partial result does not authorize an automatic fresh-session retry. ROSE handles the bounded gap directly or reports the blocker.
- A later use of the same `subagent_type` is allowed only through a fresh Task with no prior `task_id` after a fresh trigger-and-benefit decision independently justifies changed evidence or a new assignment.
- No result grants permission for another operation, external access, Git integration, cleanup, lifecycle transition, approval, integration decision, or nested delegation; ROSE owns reconciliation and the final verdict.
- An A33 result references the same one current WT-001 context as its task and names exactly one packet-declared repository/cwd, the applicable target-rules reference, and an owning-repository artifact destination. It records the shared-trust soft-boundary limitation and performs no broad host scan.
- The repository/cwd fields repeat only the packet's ownership declaration; they do not create identity or command authority. The result never duplicates or rebinds roots, keys, identity, Git state, approvals, operation class/risk, deltas, rule bodies, verification command/cwd, or containment facts.
- A changed, stale, missing, mixed-mode, or duplicate WT reference blocks acceptance and returns to ROSE for reconciliation.
- `review_arbitration_ref` is non-`N/A` only for a disputed, blocking, cross-session, or materially inconsistent finding. ROSE, not a worker, creates or updates that artifact and owns final disposition without voting or confidence averaging.
