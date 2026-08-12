# Formal Task Board

- Protocol: `aili-task-board/v1`
- Scope: `formal lifecycle only`
- Runtime mapping: `adapter-owned`

The Board is the current package-state, ownership, dependency, join, evidence, inspection, and disposition projection for one formal change. `core/protocols/package-envelope.schema.json` owns the shared package/result/evidence semantics and `core/protocols/aili-task-board.v1.schema.json` owns this formal extension; this Markdown reference maps them into Board fields. It does not replace accepted scope, create a user decision, grant implementation or operation authority, or replace fresh verification.

## Creation and placement

Create a Board only after one stable formal task identity exists and the change is decomposed into evidence-producing or executable packages. Pre-identity ordinary IDEATE work has no Board.

- OpenSpec: persist one Board across applicable phases at `openspec/changes/<change-id>/formal-task-board.md`.
- Non-OpenSpec: use an existing adapter-mapped repository-local Board path or obtain one explicit repository-local placement decision.
- Keep accepted task definitions and scope in `tasks.md`.
- Keep current package state in the Board.
- Keep chronological bounded events in the append-only `progress.txt` ledger.
- Keep runtime-private Agent, Job, Turn, Session, selector, or URI mappings in adapter-owned journals or sidecars. Such values cannot be the Board's only completion evidence.

When the Board header advances phase, retained packages keep the phase in which they were created. Do not create a new Board per phase.

## Board header

```markdown
- Protocol: `aili-task-board/v1`
- Task kind: `formal`
- Task identity: `<stable-change-id>`
- Goal: `<bounded goal>`
- Phase: `IDEATE | DEFINE | BUILD | SHIP`
- Board status: `active | blocked | done | cancelled`
- Accepted contract: `<portable refs | pending>`
- Accepted verification: `<portable ref | pending>`
- Decision owner: `ROSE`
- Verification owner: `ROSE`
```

## Package contract

Every package has all of these fields:

```markdown
- [ ] <package-id> — <title>
  - Phase: `IDEATE | DEFINE | BUILD | SHIP`
  - Package kind: `evidence | task-execution`
  - Source refs: `<typed portable refs>`
  - Accepted task IDs: `<task-id[, task-id...]> | none`
  - Status: `pending | ready | running | returned | done | blocked | cancelled`
  - Owner: `ROSE | agent:<canonical-role-id>`
  - Dispatch: `required | waived | forbidden`
  - Dispatch reason: `<reason | N/A>`
  - No-dispatch reason: `<reason | N/A>`
  - Execution: `direct | sync | async`
  - Join: `N/A | immediate | <stable-join-id>`
  - Depends on: `<package-ids | none>`
  - Decision gate: `<state | N/A>`
  - Final test-plan gate: `<state | N/A>`
  - Implementation authorization: `absent | granted | expired | revoked | N/A`
  - Operation permissions: `<state | N/A>`
  - Scope: `<bounded scope>`
  - Forbidden scope: `<bounded exclusions>`
  - Expected result: `<result>`
  - Expected evidence: `<prospective portable evidence>`
  - Acceptance: `<package-level completion criteria>`
  - Dispatch evidence: `pending | <portable evidence id>`
  - Result evidence: `pending | <portable evidence id>`
  - Evidence: `pending | <portable anchors>`
  - ROSE disposition: `pending | accepted | partially-accepted | rejected | superseded | needs-follow-up`
  - Blocker: `none | <blocker>`
  - Next action: `<next action>`
```

`Acceptance` means package-level completion criteria only. It never means final-test-plan acceptance, acceptance of a user decision, implementation authorization, or operation approval. Record a non-applicable gate as `N/A`; never represent it as granted.

The checkbox is checked if and only if `Status: done`.

## Package kinds and source references

`Source refs` use typed portable identifiers that the receiving workflow can resolve:

- `requirement:<id>`
- `decision:<id>`
- `risk:<id>`
- `artifact:<repository-local-path-or-stable-id>`
- `verification:<id-or-command-record>`
- `task:<accepted-task-id>`

An `evidence` package references one or more stable requirement, decision, risk, artifact, or verification identifiers and sets `Accepted task IDs: none`. It may exist before accepted tasks are defined and may target one unresolved decision as its expected result. That target decision is not a readiness prerequisite; its input evidence and prerequisite decisions still are.

A `task-execution` package references one or more accepted `tasks.md` task IDs. Every accepted task ID belongs to exactly one current task-execution package. One package may aggregate multiple task IDs only when one owner, dependency boundary, join, independently completable scope, and acceptance/evidence boundary fits them all. If different canonical owners, independent joins, or independently completable scopes are needed, split the task into separate accepted `tasks.md` rows during DEFINE before readiness. Missing or duplicate current task ownership blocks Board validity. A Board package cannot introduce or widen accepted scope.

When accepted tasks become available after earlier evidence packages, create task-execution packages and connect them to the earlier portable Source refs. Do not rewrite earlier evidence packages as task execution.

## Readiness

Evaluate readiness by package kind, phase, and operation:

- Every package requires valid identity and fields, ready dependencies, bounded scope, the exact owner, input evidence, prerequisite decisions, and all applicable permissions.
- An evidence package may become ready while the decision it is intended to inform is unresolved. Record implementation authorization as `N/A` unless implementation is actually part of that package.
- A BUILD task-execution package additionally requires an accepted contract, a current accepted final test plan, explicit implementation authorization for the exact scope, and all applicable operation permissions.
- `Owner: agent:general` is invalid. Canonical phase affinities are recommendations, not permission allowlists; record the role-fit reason when the narrowest valid specialist is outside the common shortlist.

## State machines

```text
Agent-owned package:
pending → ready → running → returned → done

ROSE-owned direct package:
pending → ready → running → done
```

- `pending → ready`: dependencies and every applicable decision, acceptance, authorization, and permission gate are satisfied.
- `ready → running`: the exact owner starts, or a valid waiver for an Agent-owned package was recorded before direct execution.
- `running → returned`: a readable worker result exists; this is not completion.
- `returned → done`: ROSE read and inspected the result, recorded a disposition, integrated accepted portions, and completed the selected fresh claim-matched verification.
- A task-execution package cannot become `done` until every owned task satisfies its accepted behavior and evidence requirements.
- An evidence package cannot become `done` until its expected evidence and package Acceptance are satisfied and ROSE completes inspection, disposition, integration, and verification.
- Worker PASS, task-call completion, runtime status, a progress event, or a checkbox cannot establish `done`.
- Terminal `done` and `cancelled` packages never reopen. Changed or expanded scope uses a new package ID.

## Ownership, dispatch, and waiver

Ordinary delegation keeps its specialist-preferred decision and named direct-work exceptions. Formal ownership is different:

- A ready `Owner: agent:<canonical-role-id>` package creates an exact-owner dispatch obligation. A later ordinary negative-benefit judgment cannot change its role or make it direct.
- `Owner: ROSE` uses `Dispatch: forbidden` and `Execution: direct`.
- Split a package that mixes a material decision owned by ROSE with bounded Agent execution.

Direct ROSE execution of an Agent-owned package is legal only when a waiver is recorded before execution and names one of these reasons:

1. complete, bounded, verifiable user-supplied evidence makes Agent work redundant;
2. the exact role is unavailable and ROSE has equivalent capability, tools, and permission for the unchanged package;
3. concrete dispatch-cost evidence shows delegation would add no material evidence.

Not-ready dependencies, scope overlap, changed scope, invalid role, missing specialist-only capability, cancellation, or supersession are not waivers. A post-hoc waiver is invalid.

## Sync, async, and joins

Use `sync` when a later decision or package depends on the result. Use `async` only for independent inputs, non-overlapping scope, and work whose result is not immediately required. Every async package declares a stable join ID.

A dependent package or phase verdict waits until every required joined result is terminal, read, inspected, dispositioned, and connected to required portable evidence. Dispatch without result consumption is incomplete work.

## Worker and adapter boundaries

Workers return package-bound evidence. They do not edit the Board or `progress.txt`, accept user decisions, widen permissions, integrate other packages, dispatch nested workers, or publish the final verdict. ROSE owns Board and progress writes, result inspection, disposition, integration, verification selection, and lifecycle verdicts.

Adapters may realize the same package with a fresh one-shot task or a persistent Agent identity. Persistent continuation is legal only while role, assignment, scope, forbidden scope, permissions, acceptance boundary, write scope, expected result, and expected evidence remain unchanged. A new requirement or package, expanded scope, material correction, different role or permissions, different write scope, changed acceptance boundary, or different verification claim requires a new dispatch or job.

## Progress events

`progress.txt` is an append-only bounded event ledger, not a second Board. Its portable event vocabulary is:

```text
BOARD_CREATED
READY
DISPATCHED
WAIVED
RETURNED
INSPECTED
JOINED
DONE
BLOCKED
UNBLOCKED
CANCELLED
RECONCILED
```

An event records only package ID, state transition, portable evidence ID, disposition, blocker, and next action. Runtime-private identifiers remain adapter-owned. A progress entry that duplicates the complete package contract is invalid.
