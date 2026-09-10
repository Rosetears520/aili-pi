---
description: "AILI command: /build"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/build.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: a2b9dd7b843132739b581e980785b3a0800115a5f4bf4e816dc87f608a1981c2; do not edit directly -->

# /build

User input:
`$ARGUMENTS`

Invoke `aili-delivery-flow` in BUILD mode.

Required behavior:
- Derive and execute the complete accepted scoped queue, keep concise free-form continuity in orchestrator-owned `progress.txt` without Markdown parsing or replay gates, then let ROSE run one minimal changed-scope completion check and stop at `IMPLEMENTED_TARGETED_VERIFIED`.

Hard stops:
- Do not edit without one accepted ready target and required gates; emit `BUILD_MATERIAL_DISCOVERY` and stop before work whose scope, architecture, dependency, public contract, permissions, acceptance, or verification strategy changed.
- Do not infer package, A33 add/remove, commit, push, merge, release, CI-repair, or SHIP approval.

Output contract:
- Mode and target, package and changed-file status, evidence or blocker, `Unverified` items, stop outcome, and next action.
