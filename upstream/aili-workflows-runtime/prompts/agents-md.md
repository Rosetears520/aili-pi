---
description: "AILI command: /agents-md"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/agents-md.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: 95b0393086b8ade5e092da67a6b7a3007483a0d324de3965f313d14bfa779c2e; do not edit directly -->

# /agents-md

User input: `$ARGUMENTS`

Purpose: Create, update, or validate a project-local `AGENTS.md` from the shared project template without inferring repository facts or overwriting user content silently.

Required behavior:
- Resolve whether the request is `init`, managed-block `update`, or `check`; inspect the current project rules and shared template before acting.
- Generate project-local rules through the canonical `scripts/agents_md.py` workflow. Keep reusable global rules in the global template and project facts, commands, artifact locations, and local exceptions in the project file.
- For an existing target, require the requested managed-block or backup-overwrite strategy before changing user-authored content.
- Validate the resulting project `AGENTS.md` with the repository's supported checker when requested or when the command changed it.

Hard stops:
- Do not infer project facts, add global policy to a project file, or treat generated output as an acceptance, verification, or lifecycle verdict.
- Do not overwrite, delete, move, or symlink an existing project `AGENTS.md` without the required explicit strategy and applicable approval.
- Do not initialize CodeGraph, install tools, or alter external configuration as a side effect; those are separate operations.

Output contract:
- Requested action, target project, template/source path, and overwrite strategy when applicable.
- Files changed or validated, checker result or exact limitation, and any unresolved project-fact inputs.
- Explicit statement that the command is a Utility Command and does not change lifecycle state.
