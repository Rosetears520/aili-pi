# Implementation Packages

An implementation package is the unit that BUILD may execute.

BUILD may receive a package explicitly from the user or synthesize an ordered package queue from approved ready artifacts. A `/build` invocation against a single ready target is enough approval to synthesize this queue; missing manual package text is not a stop condition.

For formal work after stable identity and package decomposition, persist that queue in the change's single `aili-task-board/v1` Board described by `formal-task-board.md`. The Board is current execution and evidence state; `tasks.md` remains accepted scope and `progress.txt` remains append-only bounded events.

## Required Fields

- goal and acceptance criteria;
- allowed files or scoped likely edit surface;
- forbidden scope;
- source artifacts and evidence;
- traceability mapping from source requirement, decision, or risk to task/package, target files or artifacts, verification command or inspection, and expected evidence or `Unverified` status;
- parallelism decision only when the package contains at least two independent units with a clear wall-clock or context benefit;
- implementation owner selected through the specialist-preferred delegation scan, with direct ROSE work only for a named direct-work exception;
- expected claim-matched evidence; the canonical verification owner selects the actual smallest check;
- final inspection relevance, Task-trigger evidence, or the concrete no-dispatch reason;
- objective iteration budget and the optional one-recheck limit when a targeted repair is actually required;
- rollback or pause condition;
- context/progress ledger placement when applicable;
- whether commits are allowed;
- task-end branch/worktree hygiene expectation for non-trivial closeout;
- packaging target/platform and package command when the user requested a packaged deliverable.

## Rules

- When no explicit package is supplied, synthesize packages from the highest-priority available artifacts: `tasks.md`, specs, design notes, `test-plan.md`, command arguments, and repository evidence.
- A formal package records Phase, `evidence | task-execution` kind, typed portable Source refs, and accepted task IDs or `none`. Pre-task IDEATE/DEFINE evidence and taskless BUILD/SHIP review evidence use stable requirement, decision, risk, artifact, or verification refs and claim no task ownership. Task execution uses accepted task IDs and cannot introduce unaccepted scope.
- Every accepted task ID belongs to exactly one current task-execution package; one package may aggregate multiple accepted task IDs only when owner, dependency, join, independently completable scope, acceptance, and evidence boundaries align. Split a task during DEFINE before readiness when different canonical owners, independent joins, or independently completable scopes are required. Missing or duplicate task ownership blocks the Board.
- Each synthesized package names goal and acceptance criteria, likely edit surface, forbidden scope, evidence source, traceability mapping, direct owner or justified auxiliary capability, expected evidence, rollback/pause conditions, ledger handling, and commit allowance. It does not create a package approval or mandatory package-local test.
- For formal changes, every package must map each covered requirement, decision, or risk to the package task, file/artifact boundary, and verification/evidence target. If any link cannot be established, label it `Open Question` before dispatch when a decision is missing, or `Unverified` when evidence cannot yet prove coverage.
- Package implementation targets complete accepted behavior inside the package scope. `Surgical` or scoped means no unrelated changes, not artificially tiny or partial patches.
- When two or more independent units have a clear wall-clock or context benefit, state the safe parallel split, dependencies, owners, and join point, then dispatch the eligible lanes. Otherwise work directly and serially without ceremony.
- Preserve already separated package or lane boundaries unless dependency, ownership overlap, verification coupling, high-risk gating, failed/missing evidence, or explicit current user direction justifies merging or serializing them. Keep the boundary visible even when execution becomes serial.
- A delegated package uses the compact packet contract: goal, scope, allowed actions, expected result, and stop condition. Permissions remain those of the selected Agent; packet text never grants tools.
- An A33 attached-target package names one approved target repository/cwd and references current `WT-001` evidence without duplicating or rebinding Git identity or operation approval. All managed subagents remain external-directory denied. A30 packet/overlay fields are historical compatibility notes, not current authority.
- Preserve dependency order. Prefer dynamic increments that can be implemented completely and remain independently traceable/reviewable; use verifiability, conflict-free ownership, and clean handoff as sizing boundaries rather than fixed file counts.
- Run the specialist-preferred delegation scan before ordinary package execution. A clear bounded non-trivial package with a matching available specialist and current effective permissions/capabilities dispatches unless overlapping ownership or concrete negative benefit blocks it. Direct work is limited to trivial work, contract clarification or splitting, no matching specialist, permission/capability failure, overlapping ownership, or concrete negative benefit. For a ready formal Agent-owned package, the exact canonical owner takes precedence over this ordinary scan; direct work requires a valid pre-recorded waiver. A formal ROSE-owned package remains direct. Default concurrency is at most two but is not a hard cap; larger bounded fan-out requires independent non-overlapping units, concrete benefit, suitable owners, and an explicit join plan. ROSE remains responsible for Board and progress writes, integration, inspection, disposition, verification selection, and final judgment.
- Keep packages independently reviewable where practical.
- Do not combine unrelated feature, harness, install, and documentation work unless explicitly approved.
- Every package finishes complete accepted behavior and a lightweight savepoint; optional package-local feedback does not substitute for final direct inspection. Package 1–12 naming is historical to `complete-aili-workflow-orchestration`, not a generic queue shape.
- Final quality starts with the proactive delegation scan: an eligible concrete gap dispatches its auxiliary capability, while no-trigger/blocked work remains direct. ROSE inspects the final diff and affected links, selects the smallest claim-matched check, and allows one targeted repair/recheck.
- If the user requested packaging, run the claim-matched checks before packaging, repair an in-scope failure once, run the package/build command as separate evidence, and report any remaining blocker. External publishing, signing, credentials, dependency changes, or destructive cleanup retain exact approvals.
- One-shot and persistent adapters implement the same package identity. Persistent continuation is same-package only while role, assignment, scope, forbidden scope, permissions, acceptance boundary, write scope, expected result, and expected evidence remain unchanged; otherwise use a new dispatch or job. The current OpenCode Task adapter remains one-shot and never resumes an old `task_id`.
- Workers return compact reports/evidence only. They do not write the Board or `progress.txt`, accept decisions, widen permissions, integrate other packages, delegate, or issue final PASS/FAIL/`Unverified` judgments. Their report must preserve the package traceability mapping by naming changed files/artifacts and verification evidence for each covered requirement, decision, or risk.
- `returned` means only that a readable Agent result exists. An evidence package reaches `done` only after its expected evidence and package Acceptance are satisfied; a task-execution package reaches `done` only after every owned task satisfies accepted behavior and evidence. Both require ROSE inspection, explicit disposition, integration of accepted portions, and fresh claim-matched verification. Terminal packages do not reopen.
- For non-trivial package closeout, inspect branch/status, classify dirty paths as task-scoped, unrelated/pre-existing, generated/ignored, scratch, or unknown, remove only safe task-owned non-user-visible scratch artifacts, and ask explicit approval before push, destructive clean/reset, branch deletion, worktree removal, OpenSpec archive, stashing unrelated changes, or deleting user-visible artifacts.
- Pause if the package requires new dependencies, lockfile changes, schema changes, public API/auth/security changes, forbidden files, broader scope than approved, signing/notarization credentials, external access/publishing, secret handling, destructive cleanup, or unsupported platform assumptions.

## Autonomous Queue Exit Criteria

Continue through the queue until one of these is true:

- The accepted scoped queue is completely implemented/savepointed and ROSE has completed the final inspection, including any trigger-eligible delegated evidence and one permitted targeted recheck;
- a stop condition requires explicit user approval;
- a package is blocked by missing target/readiness evidence, unverifiable accepted behavior, or exhausted canonical objective budgets;
- the target repository root cannot be canonicalized inside the current workspace or allowed external directories;
- the user interrupts or narrows the goal.
