# Subagent Task Packet

Use only when delegation meets `direct-vs-delegated-work.md`. Keep packets small enough to read in one pass.

```text
Goal:
Scope:
WT-001 context ref: <context_id, evidence_version, freshness, mode> | N/A
Allowed actions:
Expected result:
Stop when:
```

## Rules

- `Goal` names one bounded outcome.
- `Scope` names the files, repository, cwd, or evidence sources.
- `Allowed actions` says read-only or lists exact editable files and approved commands.
- `Expected result` asks for compact evidence, artifacts, or a command result.
- `Stop when` names missing permission, conflicting rules, scope expansion, or unavailable evidence.
- The packet creates one fresh Task context for one bounded assignment. Never pass or resume an old `task_id` for follow-up, clarification, continuation, repair, recheck, or additional work.
- A terminal, failed, empty, blocked, or partial session is not automatically retried. ROSE handles the bounded gap directly or reports the blocker.
- The same `subagent_type` may receive a later fresh packet only after a fresh trigger-and-benefit decision independently justifies the assignment or changed evidence; the new Task omits every prior `task_id`.
- A packet narrows runtime authority; it never grants a tool, path, edit, command, network call, or delegation permission.
- Every non-ROSE subagent remains non-delegating.
- ROSE retains lifecycle, approval, integration, reconciliation, and final-verdict ownership.
- For an approved A33 attached repository, `Scope` names exactly one declared repository/cwd and the packet references exactly one current `WT-001` context. The compact reference contains only context id, evidence version, freshness, and mode.
- Never copy, rebind, or reinterpret WT-001 host/source/target identity, keys, paths, Git state, approval, operation class, risk, delta, command/cwd, or containment facts. A duplicate is non-authoritative and blocks dispatch.
- Target rules are re-read at dispatch. They may narrow the packet but never broaden it; same-level conflicts block. User-visible artifacts remain in the owning target repository.
