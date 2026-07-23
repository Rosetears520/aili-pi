# Questionnaire Policy

`requirements-grilling` is the sole requirements-refinement authority. `interview.md` is its one OpenSpec artifact. The phrases `change-interviewer`, `grill-me`, and `batch-grill-me` are compatibility routing only and own no second skill, prompt, command, artifact, state, manifest entry, or readiness authority.

## When Required

- Requirements can be implemented in incompatible ways.
- Product, safety, data, or UX decisions are missing.
- Scope boundaries or forbidden files are unclear.
- Acceptance criteria cannot be verified from existing artifacts.

## When Not Required

- The task is a small local edit with clear acceptance criteria.
- A current spec already answers the blocking questions.
- Current evidence fully resolves every material dimension.

## Gate

DEFINE writes `openspec/changes/<change-id>/interview.md` through `requirements-grilling` when a material clarification exists. Ask the smallest decision-changing question by default. Use one bounded static Packet Mode artifact only when several independent blockers are already known and presenting them together reduces user effort. Use Frontier Batch Mode only when the user explicitly asks for batch grilling or to receive all currently dependency-ready questions together; never infer it from blocker count. Every question names the subject/decision, target, why now, risk/trade-off, options, evidence-backed recommendation or uncertainty, denial effect, and writeback target. Do not ask for facts current code/spec/test/config or the one applicable approved source lookup already establishes.

Write accepted chat/UI/custom answers to `interview.md`, then re-read disk before classification or readiness. Ambiguous, contradictory, incomplete, untestable, out-of-scope, or evidence-conflicting answers remain `Open Question`/`Unverified` and trigger a focused follow-up rather than guessed writeback. A custom answer is evaluated against the same evidence and materiality rules as a listed option; it is never forced into the nearest option.

Classify every confirmed correction, new requirement, artifact/design/task/test change, accepted finding, or implementation feedback as `covered`, `material-question`, `material-delta`, `ordinary-steering`, or `Unverified`. A `material-delta` writes/re-reads only affected artifacts and direct dependents, reruns required validation, and stales final-test-plan acceptance only when its acceptance or required verification changes. Never ask whether to save an in-scope delta, guess identity, expand permission, bypass high-risk approval, or start BUILD.

BUILD readiness requires coherent required artifacts, no unresolved material decision or decision-shaping source gap, required validation, and explicit final `test-plan.md` acceptance. Select only the source class needed for the exact gap; do not require local, official, prior-art, security, and alternatives lanes as a bundle. Named non-material runtime residuals may remain `Unverified` under their fail-closed gates. Test-plan acceptance is the sole lifecycle-level pre-BUILD user gate; material/coherence/validation/permission/destructive/high-risk gates remain separate.

## Explicit Frontier Batch Mode

Frontier Batch Mode is user-invoked only. Explicit phrases such as “batch grill me”, “批量拷问”, or “ask every currently answerable decision together” select it. A request that merely contains several blockers does not.

- Resolve change identity and non-OpenSpec placement before the first batch. Keep permission, approval, destructive, external-access, dependency, schema/auth/security, commit/push/merge/release, and exact-operation questions separate and single; no batch answer grants or implies authority.
- Model the selected material scope as a decision tree. The current frontier is the complete set of material user decisions whose prerequisite decisions and required evidence are settled. Ask that frontier in one numbered packet, with no generic coverage questions. If only one material decision is ready, ask it as one question.
- A question that depends on another question still open in the current round belongs to a later round. Do not guess the prerequisite answer merely to enlarge the frontier.
- Finding facts remains the agent's job. ROSE runs the proactive delegation scan; `requirements-grilling` may return `need-evidence` with the affected dependency but must not dispatch, and only questions downstream of missing evidence wait. If an existing Task trigger is met, ROSE dispatches a fresh single-use Task with no old `task_id`; direct inspection is the no-trigger/blocked fallback and unrelated frontier questions remain eligible.
- Accept partial answers. Persist confirmed answers and dispositions to the one `interview.md` or agreed target, re-read disk, keep unanswered or invalid answers unresolved, and recompute the frontier from current evidence before the next round.
- The session ends only when the frontier is empty and the user explicitly confirms shared understanding. That confirmation is not requirements readiness by itself and never substitutes for validation, final `test-plan.md` acceptance, permission, or exact-operation approval.

## Default Interaction

- Persist an OpenSpec `interview.md` only when clarification decisions need a durable record; do not manufacture a packet when current evidence resolves all material dimensions.
- Follow-up unresolved readiness questions are chat-first by default: ask concise blocking questions in chat, not by requiring the user to manually fill `interview.md`.
- Chat answers are not readiness evidence until ROSE writes them back into `interview.md` or the agreed questionnaire artifact.
- Direct file editing is supported when the user chooses it; after any direct edit, disk content wins after re-read and reconciliation.
- Before answer classification, readiness, BUILD gating, or local review evidence use, ROSE must re-read the artifact from disk after any AI write-back or user edit.

## Artifact Freshness

Disk wins for user-editable questionnaire artifacts such as `interview.md`, but freshness is event-directed rather than a blanket continuation gate.

Before using, merging, validating, or overwriting a questionnaire artifact, ROSE must:

1. Re-read the artifact after ROSE writes it and after a user edit, hook, conflict, or resume checkpoint makes it relevant.
2. Inspect scoped working-tree/diff evidence only when needed to distinguish current user edits or merge conflicts.
3. Treat on-disk content as the source of truth and refresh only direct dependents.
4. Never claim “no changes detected” without current disk evidence.

## Coverage proportional to the decision

Cover only dimensions capable of changing this change's implementation or acceptance. Record each applicable item as confirmed, needs question, open question, or `Unverified`; do not create a full generic coverage matrix for an already coherent bounded change.

`requirements-grilling` owns its direct consistency check and then stops. It must not invoke `strategy-stress-test`, `test-document-generator`, planning, TDD, review, or security. It may return one named material loophole or downstream artifact need to ROSE; ROSE selects the next canonical loop only if the current user intent or concrete gap warrants it. No interview readiness state creates another approval gate.
