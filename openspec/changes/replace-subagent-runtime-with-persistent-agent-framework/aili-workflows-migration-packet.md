# `aili-workflows` persistent-Agent migration packet

## Authority and target

This packet is repository-local planning evidence only. It does **not** authorize attachment to or writes in the independently governed canonical `aili-workflows` repository. Before applying it, obtain exact repository/path/revision/write approval, read that repository's current rules, and create or update its owning change contract.

Expected baseline for comparison: `aili-workflows` commit `7eb35f357ad489f5841ee10dac1e44549c1bdb76`. Re-discover current files and hashes after attachment; do not assume the local `skills/` snapshot or `.worktrees/aili-workflows/` is a writable upstream checkout.

## Accepted semantic delta

Replace adapter-specific assumptions that every delegated context is necessarily fresh, terminal, non-resumable, and unable to spawn with capability-neutral semantics:

- A `task` creates a new stable Agent identity.
- Follow-up on that identity uses `hub send`; it does not create a second concurrent turn.
- An idle Agent may park and later revive with its retained official Pi transcript.
- A running/queued task interrupted by process loss is not replayed automatically.
- Specialized roles remain non-spawning; `general` may synchronously spawn an allowed non-self specialized role below the depth ceiling.
- Fresh one-shot delegation remains a valid caller choice, not a universal backend invariant.
- Failed/empty work still does not authorize automatic retry; ROSE owns reconciliation and final decisions.
- Tool/capability wording should remain backend-neutral where OpenCode and Pi differ.

Do not change user intent, trigger thresholds, ROSE ownership, evidence requirements, permission/approval boundaries, review authority, or no-automatic-retry rules merely to adopt stable Agent identity.

## Exact discovery candidates from the pinned Pi snapshot

Reinspect at least these canonical paths and their references/assets:

1. `parallel-subagent-dispatch/SKILL.md`
   - Description and opening contract say “fresh subagents” / “fresh single-use contexts”.
   - `## Single-use sessions` forbids every old-task follow-up.
   - Replace with a choice between new Agent creation and stable-ID follow-up; retain benefit gating and no automatic retry.
2. `aili-delivery-flow/SKILL.md`
   - Delegation scan and Task wording assume fresh contexts.
   - Route creation through `task`; route accepted follow-up through `hub send`; keep BUILD/DEFINE authority unchanged.
3. `aili-delivery-flow/references/questionnaire-policy.md`
   - “fresh single-use Task with no old task_id” should distinguish evidence-lane creation from follow-up on an already-owned persistent Agent.
4. `aili-delivery-flow/references/protocols/implementation-package.md`
   - Replace universal “never resumed through an old task_id” with stable Agent ID and explicit new-vs-follow-up selection.
5. `aili-delivery-flow/references/protocols/review-report.md`
6. `aili-delivery-flow/references/protocols/subagent-result.md`
   - Preserve terminal result authority and no automatic retry; replace backend-specific `task_id` prohibition with “do not continue unless ROSE explicitly chooses the same stable Agent and changed evidence warrants a new turn”.
7. `local-review-gate/SKILL.md`
8. `local-review-gate/references/orchestration-adaptation.md`
   - Keep auxiliary review lanes read-only and non-repairing; persistence must not turn one lane into an automatic review loop.
9. `requirements-grilling/SKILL.md`
10. `harness-optimization-audit/SKILL.md`
11. `code-review-quality-gates/SKILL.md`
   - Remove universal fresh/single-use backend claims while retaining trigger gates and role authority.

Search the current canonical tree for: `single-use`, `fresh`, `never resume`, `old task_id`, `non-delegating`, `no recursion`, `subagent.dispatch`, and hard concurrency-two language. Classify each occurrence as domain semantics (retain), caller policy (rewrite carefully), or obsolete adapter behavior (remove/move to adapter docs).

## Capability/adapter contract

Canonical skill text should request capabilities, not assume one concrete tool schema:

- Agent creation: `agent.task.create`
- Stable follow-up/lifecycle/message/output: `agent.hub`
- Existing portable dispatch intent may retain `subagent.dispatch` only as a compatibility umbrella until all backends publish equivalent mapping.
- Pi adapter maps these to `task` and `hub`.
- OpenCode adapter may map the same intent to fresh one-shot tasks where persistence is unavailable, reporting that limitation rather than pretending park/revive.

The canonical capability registry must define owner, required/optional class, side effects, missing behavior, and verification. Do not rename capability IDs in only one repository without a coordinated compatibility update.

## Required regression cases

- New task allocates a new Agent even when a readable name repeats.
- Explicit follow-up targets a stable Agent ID and never creates a concurrent turn under it.
- Persistent identity does not grant broader tools, project trust, filesystem scope, or approval.
- Specialized review/test roles still cannot recursively delegate.
- General delegation is non-self, bounded by depth, and synchronous when nested.
- Interrupted/unexecuted work is visible and never auto-replayed.
- A failed or empty Agent result does not trigger an automatic retry loop.
- Review/report roles still cannot issue final acceptance, merge, release, or integration authority.
- Backends without persistence report the missing capability and use a fresh-context fallback only when the caller contract permits it.

## Expected upstream delivery

Return:

1. exact attached repository path, baseline/current revision, and rules read;
2. changed canonical files and hashes;
3. per-occurrence disposition (retain/rewrite/adapter-only);
4. capability manifest changes and both Pi/OpenCode adapter mapping;
5. focused regression commands/results;
6. unresolved backend gaps;
7. confirmation that no unrelated skill semantics changed;
8. a new pinned revision for `aili-pi` snapshot synchronization.

After that upstream change is independently accepted, `aili-pi` must update its lock/snapshot through the normal exact dependency/cross-repository gate; it must not hand-edit the embedded canonical skill bodies.
