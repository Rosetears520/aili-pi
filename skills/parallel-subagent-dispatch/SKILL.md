---
name: parallel-subagent-dispatch
description: Proactively dispatch fresh subagents when the user requests them, a specialist capability is required, repository exploration would materially pollute context, or independent work units have clear wall-clock or context benefit; use direct ROSE work only when no trigger applies or delegation is concretely blocked.
license: MIT
---

# Parallel Subagent Dispatch

## Goal

Dispatch early when an ordinary trigger is met or a ready formal Agent-owned package requires its exact owner, without turning ordinary work into orchestration overhead. ROSE retains integration and final-verdict ownership.

## Reference

Use `references/agent-selection-matrix.md` as the single shared `aili-agent-selection/v1` source for assignment-shape classification and canonical role selection. Adapters own the mapping from a canonical Role ID to a runtime selector.

## Trigger

Use the `subagent.dispatch` capability only when at least one condition is true:

- the user explicitly asks for a subagent;
- a required capability belongs to a specialist;
- broad search or noisy output would materially pollute ROSE context;
- at least two independent units can run concurrently with clear benefit.

Run this proactive delegation scan at the start of each non-trivial intent and again when changed evidence creates a new work split. When any trigger is true, dispatch before duplicating the assignment directly unless overlap, dependency, permission, ownership, or negative-benefit evidence blocks it. Otherwise work directly. Do not delegate a single straightforward task merely because a subagent exists.

Every dispatch operation must pass this benefit decision independently. A prior failure, partial result, empty result, or desire to continue is not by itself a reason to dispatch another operation.

For ordinary work, first classify the assignment shape and required capability, then select the narrowest matching canonical role from the matrix. Complexity, file count, and lifecycle phase alone neither require dispatch nor justify a broader role. A ready formal Agent-owned package is different: its declared canonical role is exact and does not pass through a new ordinary benefit decision.

## Parallelism

- Default to at most two concurrent subagents; this is not a hard cap. ROSE may select a larger bounded fan-out when every lane is independent and non-overlapping, has concrete benefit and a suitable owner, and participates in an explicit join plan.
- Launch ready independent lanes together in the same Task message when the current adapter maps `subagent.dispatch` to Task; otherwise use its equivalent single dispatch batch rather than serializing them.
- Parallel units must not edit the same files or depend on each other's output.
- If work overlaps or has a dependency, run it sequentially or keep it direct.
- Do not automatically add review, test, security, or coverage agents after implementation.

## Work-package lifecycle

- One bounded work package has one declared canonical role, assignment, scope, forbidden scope, permission boundary, acceptance boundary, write scope, expected result, expected evidence, and terminal disposition.
- An adapter may realize a package with a fresh one-shot task or a persistent Agent identity. A persistent adapter may continue only while every package-defining field remains unchanged.
- A new requirement or package, expanded scope, material correction, different role or permissions, different write scope, changed acceptance boundary, or different verification claim requires a new dispatch or job.
- The current OpenCode Task adapter remains one-shot: each Task context is fresh and terminal, and an old `task_id` is never resumed. This adapter behavior is not a universal shared-session requirement.
- Do not automatically retry after a failed, empty, blocked, or partial result; ROSE handles the bounded gap directly or reports the blocker.
- Subagents never nest or delegate. ROSE retains lifecycle, approval, integration, reconciliation, and final-verdict ownership.

## Canonical packet protocol

Use `.agents/skills/aili-delivery-flow/references/protocols/subagent-task-packet.md` as the single source for exact packet fields and rules. Do not restate or maintain a local field schema in this skill.

Keep each packet bounded to the independently justified assignment. A packet narrows scope; it never expands effective permissions. Every subagent remains non-delegating.

For a formal package, copy its Package ID and exact canonical Role ID into the packet. `general` is not a canonical specialist and cannot own a formal package.

For A33, a packet/result carries one compact `WT-001` reference for one declared repository/cwd. It never duplicates or rebinds root, key, identity, Git, approval, operation, risk, delta, rule, command/cwd, or containment authority. Target rules are re-read at dispatch, can only narrow, and same-level conflicts block. Artifacts stay with the owning target repository.

## Canonical result protocol

Use `.agents/skills/aili-delivery-flow/references/protocols/subagent-result.md` as the single source for exact terminal result and finding fields. Do not restate or maintain a local result schema in this skill.

ROSE checks the canonical result evidence, resolves conflicts, and owns the lifecycle, integration, and final decision. Missing or empty evidence is not completion and does not authorize resume or an automatic fresh-session retry.

## Stop

Do not dispatch when permission, scope, ownership, or independence is unclear. Ask the user only when the missing answer changes the task or authorization.
