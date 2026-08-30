---
description: "AILI command: /handoff"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/handoff.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: 1f647bc520b3e99459d6a077fdaf3d94cc0bfc48f45453ae70f32a4b86ab64c3; do not edit directly -->

# /handoff

User input: `$ARGUMENTS`

Purpose: Create, list, or resume an explicit repository-local handoff without creating a lifecycle phase or independent completion authority.

Required behavior:
- Act only for an explicit CREATE, LIST, or RESUME request, or an accepted lifecycle contract that names the handoff point.
- For CREATE, resolve the repository-local destination before writing. Use `openspec/changes/<change-id>/handoffs/` for a named OpenSpec change; otherwise ask once for the task-root handoff location.
- Preserve a redacted, immutable, reference-first snapshot. Record only the state, source paths, decisions, remaining work, evidence references, and revalidation needs required to resume safely.
- For LIST or RESUME, read existing handoff material without treating it as current truth. RESUME must revalidate the current root, worktree, contract, permissions, and affected evidence before continuing.

Hard stops:
- Do not create a handoff because of context pressure, compression, elapsed time, phase completion, a timer, or a hook.
- Do not persist secrets, raw logs, full transcripts, private data, credentials, or an unredacted session export.
- Do not treat a handoff as acceptance, authorization, Git truth, verification, completion evidence, or permission to resume an old runtime task.
- Do not archive, prune, migrate, rotate, or modify an existing finalized handoff without separately authorized scope.

Output contract:
- Requested action and resolved repository-local path, or the exact ambiguity/blocker.
- Snapshot or selected handoff references, redaction limits, and state that must be revalidated.
- Explicit statement that the handoff is non-authoritative and does not change lifecycle state.
