# Subagent Task Packet

Use only when delegation meets `direct-vs-delegated-work.md`. `core/protocols/package-envelope.schema.json` owns the shared package semantics; this Markdown reference is a compact packet rendering and must not redefine them. Keep packets small enough to read in one pass.

```text
Package ID:
Role ID:
Assignment:
Scope:
Forbidden scope:
WT-001 context ref: <context_id, evidence_version, freshness, mode> | N/A
Allowed actions:
Expected result:
Expected evidence:
Execution: sync | async
Join: immediate | <stable-join-id> | N/A
Continuation: same-package | new-package
Stop when:
```

## Rules

- `Package ID` names one bounded work-package identity.
- `Role ID` is the selected canonical role. Formal Agent-owned work uses the exact Board owner; `general` is invalid.
- `Assignment` names one bounded outcome.
- `Scope` names the files, repository, cwd, or evidence sources.
- `Forbidden scope` names explicit exclusions and operations the package must not perform.
- `Allowed actions` says read-only or lists exact editable files and approved commands.
- `Expected result` asks for compact evidence, artifacts, or a command result.
- `Expected evidence` states the portable evidence contract needed for ROSE's later inspection and disposition.
- `Execution` is `sync` when a later decision or package depends on the result. `async` requires independent inputs, non-overlapping scope, and a stable `Join` ID.
- `Continuation` classifies whether the work is unchanged same-package work or requires a new package. It does not authorize reuse or dispatch.
- `Stop when` names missing permission, conflicting rules, scope expansion, or unavailable evidence.
- An adapter may realize a package with a fresh one-shot task or a persistent Agent identity. Persistent same-package continuation requires unchanged role, assignment, scope, forbidden scope, permissions, acceptance boundary, write scope, expected result, and expected evidence.
- The current OpenCode Task adapter creates one fresh terminal context for each dispatch and never passes or resumes an old `task_id`. This is adapter behavior, not a universal persistent-session prohibition.
- A new requirement or package, expanded scope, material correction, different role or permissions, different write scope, changed acceptance boundary, or different verification claim requires a new dispatch or job.
- A terminal, failed, empty, blocked, or partial session is not automatically retried. ROSE handles the bounded gap directly or reports the blocker.
- Under the current OpenCode Task adapter, the same `subagent_type` may receive a later fresh packet only when a fresh ordinary specialist-preferred decision or a ready formal exact-owner package independently justifies it; the new Task omits every prior `task_id`.
- A packet narrows runtime authority; it never grants a tool, path, edit, command, network call, or delegation permission.
- Every non-ROSE subagent remains non-delegating.
- ROSE retains lifecycle, approval, integration, reconciliation, and final-verdict ownership.
- For an approved A33 attached repository, `Scope` names exactly one declared repository/cwd and the packet references exactly one current `WT-001` context. The compact reference contains only context id, evidence version, freshness, and mode.
- Never copy, rebind, or reinterpret WT-001 host/source/target identity, keys, paths, Git state, approval, operation class, risk, delta, command/cwd, or containment facts. A duplicate is non-authoritative and blocks dispatch.
- Target rules are re-read at dispatch. They may narrow the packet but never broaden it; same-level conflicts block. User-visible artifacts remain in the owning target repository.
