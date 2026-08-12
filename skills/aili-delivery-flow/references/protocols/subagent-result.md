# Subagent Result

`core/protocols/package-envelope.schema.json` owns the canonical terminal result, verification-evidence, and convergence-link semantics. This Markdown reference renders that result and finding envelope for delegated review, test, security, coverage, convergence, evaluator, and focused-recheck lanes. Return only what ROSE needs to decide the next action; the Task context closes after this result or failure.

```text
CANONICAL RESULT:
result_id:
trace_id:
lane:
owner:
package_id:
role_id:
status: completed | partial | blocked | unverified
confidence: HIGH | MED | LOW | VERY LOW | UNKNOWN
worktree_context_ref: <context_id, evidence_version, freshness, mode> | N/A
declared_repository:
cwd:
target_rules_ref:
artifact_destination:
inspected_scope:
summary:
evidence:
changed_files:
verification:
checks:
freshness:
skipped_checks:
soft_boundary_limitations:
blockers:
risks:
unverified:
continuation_recommendation: same-package | new-package | none
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
- `package_id` and `role_id` must match the task packet. `general` is not valid for formal ownership.
- `evidence`, `changed_files`, and `verification` use portable references that ROSE can inspect; an opaque runtime ID cannot be the only completion evidence.
- `continuation_recommendation` is advisory. `same-package` is valid only when all package-defining fields remain unchanged; `new-package` identifies a boundary and does not authorize dispatch or scope expansion.
- Keep raw logs, broad dumps, and full files out of the result.
- Mark unsupported claims `Unverified`.
- A no-finding result uses `findings: []` and still reports inspected scope, checks, freshness, skipped checks, blockers, and `Unverified` items.
- Do not issue the final PASS, acceptance, release, or integration decision.
- The current OpenCode Task adapter never resumes the result's old `task_id`; any later Task dispatch is fresh and independently justified. A persistent adapter may continue only unchanged same-package work under its own runtime mapping.
- A failed, empty, blocked, or partial result does not authorize an automatic retry, continuation, or new dispatch. ROSE handles and dispositions the bounded gap.
- No result grants permission for another operation, external access, Git integration, cleanup, lifecycle transition, approval, integration decision, or nested delegation; ROSE owns reconciliation and the final verdict.
- An A33 result references the same one current WT-001 context as its task and names exactly one packet-declared repository/cwd, the applicable target-rules reference, and an owning-repository artifact destination. It records the shared-trust soft-boundary limitation and performs no broad host scan.
- The repository/cwd fields repeat only the packet's ownership declaration; they do not create identity or command authority. The result never duplicates or rebinds roots, keys, identity, Git state, approvals, operation class/risk, deltas, rule bodies, verification command/cwd, or containment facts.
- A changed, stale, missing, mixed-mode, or duplicate WT reference blocks acceptance and returns to ROSE for reconciliation.
- `review_arbitration_ref` is non-`N/A` only for a disputed, blocking, cross-session, or materially inconsistent finding. ROSE, not a worker, creates or updates that artifact and owns final disposition without voting or confidence averaging.
