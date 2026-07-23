---
name: local-review-gate
description: Run the explicit `/local-review` command or an equivalent user-requested standalone local audit over a diff, ref, PR, or OpenSpec change; do not trigger automatically from BUILD/SHIP, implementation completion, merge wording, or ordinary review-adjacent work.
---

# Local Review Gate

## Purpose

Use this skill when the user invokes `/local-review` or explicitly requests the same standalone report-first local audit before repair or PR submission.

This skill is the workflow authority for the AILI-owned local review gate. It is not OpenCode's built-in `/review`, it does not replace `/ship`, and neither its report nor a subagent PASS is lifecycle acceptance or SHIP, release, merge, archive, or closeout evidence.

## Non-Negotiable Boundaries

- Do not override, replace, or depend on OpenCode's built-in `/review` command.
- Do not claim release-ready, archive-ready, merge-ready, or SHIP-ready status; `/local-review` verdicts apply only to the reviewed target and evidence scope.
- Do not use a `/local-review` result as lifecycle acceptance or SHIP/release/merge/archive evidence.
- Do not push, create PRs, comment on GitHub, approve/request changes, merge, tag, publish, delete, reset, clean, or mutate remote state.
- PR mode may run only the exact GitHub CLI allowlist `gh pr view`, `gh pr diff`, and `gh pr list --head`; do not run `gh api`, `gh pr checkout`, `gh pr comment`, `gh pr review`, `gh pr merge`, `gh pr create`, `gh repo clone`, or equivalent push, merge, comment, review, checkout, clone, or remote-mutating commands.
- Do not perform repair until after a categorized report exists and `--repair` or an explicit user/current-contract approval authorizes repair.
- Any delegated review context remains read-only and terminal. After an explicit `--repair`/current-contract authorization, ROSE may repair directly or use one independently justified fresh edit assignment; one affected recheck is sufficient and no old context is resumed.
- Do not hide skipped checks, unavailable tools, stale evidence, partial context, or `Unverified` items.

## Upstream Provenance and Adaptation

Before copying or adapting upstream review material, read `references/upstream-provenance.md` and preserve its active/deferred source split. Active behavior references for this gate are:

- `references/ecc-code-review-adaptation.md`: local/PR target selection, full-file review, validation, report artifact, verdict mapping, and read-only PR-mode boundaries.
- `references/review-repair-lane-adaptation.md`: ECC-derived review/repair lane triggers, build-fix loop discipline, and separate repair ownership.
- `references/orchestration-adaptation.md`: bounded capability selection, blocking/advisory split, evidence reconciliation, and main-agent-only integration/verdict rules; upstream fan-out language is non-authoritative where it conflicts with trigger-gated routing.
- `references/addyosmani-code-review-rubric.md`: five-axis review rubric, `Critical`/`Important`/`Suggestion`, spec/task-first reading, concrete fixes, and uncertainty/proof gates.
- `references/codex-github-compatibility.md`: behavior-only Codex/GitHub compatibility for AGENTS rules, PR focus instructions, high-priority findings, and local review/fix parity without cloud mutation.
- `references/graphify-local-review.md`: existing-output-only adapter for optional architecture context from the official global Graphify skill. This gate neither owns nor launches Graphify and adds no install, registration, project execution, hook/plugin, scheduler, lifecycle gate, or completion authority.

- Active derivative-reference sources: primary ECC `affaan-m/ECC` and `addyosmani/agent-skills`.
- Behavior-only guidance: official Codex review docs; do not copy Codex documentation text.
- Deferred or non-primary candidates: Kodelyth ECC, Elaine mirror/candidate, and `cminn10/ecc2cursor` unless a later scoped provenance review activates them.
- Preserve MIT license/provenance for copied/adapted ECC or addyosmani material, including source URL, source path, copied/adapted scope, and adaptation rationale.
- Replace Claude/ECC-specific tool, path, command, permission, and runtime assumptions with OpenCode/AILI-safe equivalents before activation.
- Keep long copied/adapted material in references where possible, and use precise triggers and near-miss boundaries to avoid over-triggering.
- Do not activate `.claude` paths, Claude-only tools, ECC-only command names, `ccg-workflow`, Codex/Gemini runtime dependencies, public `multi-*` commands, or unsafe remote mutation defaults.

## Target Resolver

Resolve and report the target before reviewing or accepting findings. Direct ROSE inspection is the default; no review lane is required merely because this command was invoked.

| Input | Required resolution |
|---|---|
| no args | staged, unstaged, and untracked local changes; report absent categories too |
| `--base <branch>` | current branch, selected base, merge-base, diff range, and any local staged/unstaged/untracked overlay |
| `--commit <sha>` | commit identity, parent/range, touched files, and unavailable commit metadata |
| `--pr <url\|number>` | read-only PR metadata/diff only through the exact GitHub CLI allowlist `gh pr view`, `gh pr diff`, and `gh pr list --head` when available; no `gh api`, checkout, clone, comment, review, merge, create, push, or equivalent remote mutation |
| `--change <id\|path>` or OpenSpec path | proposal, design, tasks, specs, interview, test-plan, context, progress, drift log or legacy implementation notes, review report, final diff, and verification evidence |
| `--focus <text>` or adversarial wording | target plus focus lane emphasis such as security, tests, data loss, performance, spec drift, or adversarial review |
| `--repair` | only after a categorized report exists; convert approved findings into scoped repair packages and require re-review |

For OpenSpec `--change <id|path>` targets, resolve the conventional artifact paths directly instead of relying only on broad glob/search output. Local `openspec/` directories may be git-ignored or omitted from snapshot-style indexes, so the target resolver must attempt exact reads or file listings for `proposal.md`, `design.md`, `tasks.md`, `interview.md`, `test-plan.md`, `context.md`, `progress.txt`, `review-report.md`, `drift-log.md`, legacy `implementation-notes.html`, and `specs/**/spec.md` before marking the artifact absent. If a broad search finds no OpenSpec files but exact reads/listing show the change exists, treat the broad search as insufficient evidence rather than as absence.

If target, base, PR identity, OpenSpec change id, report path, permission, or required evidence source is ambiguous and cannot be safely inferred, return `BLOCKED` with the exact missing decision.

## Full-Context Evidence Policy

Diff-only review is insufficient for high-confidence findings.

Before reporting a definite critical, security, data-loss, compatibility, correctness, or test adequacy finding, require:

- full inspection of changed files and relevant untracked files;
- related tests, fixtures, config, docs, AGENTS files, manifests, schemas, or protocol docs that constrain behavior;
- callers, consumers, peer patterns, or downstream output paths when the claim depends on integration behavior;
- command or artifact evidence for verification claims, or an explicit skipped reason with risk.

When full context cannot be inspected within scope, label the affected claim `Unverified`, downgrade confidence, and prevent a `PASS` verdict unless the item is immaterial or explicitly accepted as risk.

## Report Artifact Contract

For non-trivial targets, create or update a repository-local Markdown report before repair starts.

- OpenSpec default: `openspec/changes/<change-id>/review-report.md`.
- Non-OpenSpec target: ask once for a repository-local report path, or offer chat-only review only when the user explicitly accepts the persistence limitation as `Unverified`.
- Do not store or print secrets, tokens, private keys, cookies, raw logs, full transcripts, full file dumps, or private data in reports; use redacted path:line/type evidence instead.

The report must record:

- target, base/ref, merge-base, commit, PR metadata, or change id;
- timestamp and current worktree/dirty-path classification when relevant;
- source artifacts reviewed and source artifacts missing;
- files/artifacts inspected in full, sampled, or skipped;
- review lanes and checks run, skipped, stale, or unavailable;
- categorized findings with severity, category, source lane, evidence anchor, affected file/artifact, required action, repair owner, repairability, current status, and re-review requirement;
- previous findings, resolved/deferred/accepted-risk/out-of-scope items, and re-review history;
- final verdict and named residual `Unverified` items.

All review/test/security/coverage/convergence lane results embedded or referenced by the report must use the exact canonical finding/result envelope in `aili-delivery-flow/references/protocols/subagent-result.md`. A worker proposes `fix`, `refute-with-counter-evidence`, `accept-named-risk`, or `Unverified-block`; ROSE owns final disposition. Do not reconcile by majority vote, lane count, or averaged confidence, and do not treat a worker verdict as final authority.

### Conditional arbitration artifact

- Create or update exactly `openspec/changes/<change-id>/review-arbitration.md` only when a finding is disputed, blocking, cross-session, or materially inconsistent.
- Preserve stable finding ID, competing claims, evidence and counter-evidence, proposed dispositions, ROSE disposition and rationale, decision owner, status, required recheck, freshness, and residual `Unverified` items.
- A credible material minority finding stays open until fixed/rechecked, refuted with counter-evidence, accepted as a named risk by the authorized owner, or blocked as `Unverified`.
- Do not create the artifact for routine uncontested findings and do not pre-create an empty instance.

## Verdict Vocabulary

Use only these local-review verdicts:

- `BLOCKED`: target, permissions, evidence, report placement, or required decision is missing.
- `NEEDS_FIXES`: actionable blocking or important findings remain.
- `NEEDS_REVIEW`: human/product decision or conflicting evidence is required.
- `PASS_WITH_UNVERIFIED`: no blocking findings remain, but named skipped or unverifiable items remain.
- `PASS`: no blocking findings for the audited target and evidence scope, with fresh evidence and no material `Unverified` items.
- `REPAIRING`: approved repair packages are being executed by separate edit/repair or edit/test lanes.
- `REREVIEW_REQUIRED`: fixes were made or prior findings remain unresolved and need fresh review.

`PASS` never means release-ready or SHIP-ready.

For large or harness-sensitive `/local-review --change <id|path>` targets, `NEEDS_FIXES` and `BLOCKED` block BUILD continuation. `PASS_WITH_UNVERIFIED` may continue only after the user accepts each named `Unverified` item; otherwise return `NEEDS_REVIEW` or `BLOCKED` with the missing acceptance.

## Review Capability Selection

Select one primary review question and run the proactive delegation scan. Add at most one auxiliary capability when the user requests it or a concrete evidence gap triggers it; direct review is the no-trigger/blocked fallback. Default concurrency is at most two but is not a hard cap. Larger bounded read-only fan-out requires independent non-overlapping contexts, concrete benefit, suitable owners, and an explicit join plan. Do not run a review/test/security/coverage/convergence set without trigger evidence.

- target/context lane: target identity, diff/base/PR/change scope, dirty paths, and report placement;
- `code-reviewer`: correctness, maintainability, architecture, performance, and context adequacy;
- `test-engineer` or `test-coverage-reviewer`: verification story, test quality, and uncovered paths;
- `security-auditor`: auth, permissions, secrets, shell/installers, network, dependencies, storage, or data-loss risk;
- `pr-test-analyzer`: branch/PR-like diffs, changed-test review, CI-log interpretation, and focused command matrix;
- `ai-regression-scout`: prompts, agents, skills, routing, fixtures, model/tool routing, or generated-output changes;
- `silent-failure-reviewer`: stale evidence, skipped gates, misleading reports, swallowed errors, and false PASS risk;
- `convergence-reviewer`: formal OpenSpec, multi-phase, harness-sensitive, or evidence-heavy work where source artifacts must be compared to tasks, diff, progress, review, and verification evidence;
- browser/E2E lanes only when the changed surface and artifact placement justify them;
- open-source/provenance lanes only when public/package/provenance exposure is in scope.

Any selected auxiliary packet must include target identity, accepted scope, source artifacts, diff/files, evidence already run, artifact placement rules, forbidden remote mutation, skipped-capability constraints, and expected terminal status. It is read-only, single-use, non-delegating, and must not repair its own findings or be resumed.

For A33, each lane names exactly one packet-declared repository/cwd, references one current WT-001 context, re-reads applicable target rules that may narrow but never broaden, and writes any user-visible report to the owning repository. It records inspected scope, freshness, skipped checks, and the shared-trust soft-boundary limitation; it performs no broad host scan and never duplicates or rebinds identity, keys, approvals, Git state, rule bodies, verification command/cwd, or containment facts.

Apply the adapted upstream evidence gates only to the selected question:

- inspect the relevant accepted artifacts and current implementation/test evidence before a definite finding;
- require `Critical`/`Important` findings to include exact evidence, concrete failure mode, why existing guards do not catch it, and a concrete fix;
- accept zero findings only when inspected scope, skipped checks, and confidence are recorded;
- treat an empty/status-less auxiliary result as missing evidence, not as permission to resume or dispatch an automatic retry;
- split reconciled findings into blocking and advisory buckets, with unverifiable high-risk findings blocking until checked or explicitly accepted.

## Convergence and Phase Checkpoints

For formal or multi-phase work, compare the accepted source artifacts, relevant savepoints, final diff/worktree state, and fresh claim-matched checks. If parallel work was actually used, reconcile its compact status, evidence, and blockers before continuing.

The active lifecycle owner remains outside `/local-review`: BUILD completion uses direct changed-scope/task-link inspection and the smallest relevant check, with one auxiliary capability only for a concrete gap and at most one targeted repair/recheck. `Package 12` is historical terminology for `complete-aili-workflow-orchestration`, not a generic review stage. A local-review report neither triggers nor satisfies lifecycle completion.

In the historical `complete-aili-workflow-orchestration` queue, Packages 1–11 record lightweight savepoints containing complete behavior scope, files changed, unresolved items, and next package. Generic queues use the same lightweight savepoint fields without inheriting that numbering. Optional commands or diff feedback are not package closure or independent quality gates.

## Anti-Pseudo-Completion Checks

Reject pseudo-completion when:

- prior findings are unresolved or not explicitly accepted/out-of-scope;
- verification output is stale, missing, partial, or not tied to the exact reviewed target;
- a lane reports success without anchors, inspected scope, lane status, and skipped-check reasons;
- tasks, specs, test-plan items, or accepted requirements lack implementation/evidence coverage;
- dirty paths are unknown or unrelated to the claimed scope;
- skipped checks lack a reason and risk;
- the report claims to replace PR review without target/base metadata, inspected files, checks, findings, and re-review evidence.

## Repair and Re-Review Loop

1. Resolve target and write/update the categorized report.
2. Classify findings before repair.
3. If repair is authorized, select one scoped repair package; ROSE works directly unless one fresh assignment independently passes the delegation gate.
4. Apply at most one targeted repair and rerun the smallest affected check once.
5. Reconcile the changed finding directly. Use a new read-only context only when changed evidence creates a separately justified capability gap; never resume the original context or launch an automatic review cycle.
6. Keep verdict `REREVIEW_REQUIRED` until the affected finding has fresh direct or independently justified evidence; report any remaining blocker instead of starting another round.

## Output Contract

```text
LOCAL REVIEW STATUS: BLOCKED | NEEDS_FIXES | NEEDS_REVIEW | PASS_WITH_UNVERIFIED | PASS | REPAIRING | REREVIEW_REQUIRED
CONFIDENCE: HIGH | MED | LOW | VERY LOW | UNKNOWN

TARGET:
- Mode:
- Scope/base/ref/commit/PR/change:
- Report path or chat-only waiver:

SOURCE ARTIFACTS:
- Reviewed:
- Missing/stale/unavailable:

LANES AND CHECKS:
- Ran:
- Skipped with reason/risk:
- Re-review required:

FINDINGS:
- [critical|high|medium|low|suggestion|unverified] category - evidence - required action - owner - status - re-review requirement

REPAIR PLAN:
- Authorized: yes | no
- Packages or N/A:

UNVERIFIED / ACCEPTED RISK:
- <item or N/A>

NEXT:
- <fix, re-review, user decision, or ship remains separate>
```
