---
description: "AILI command: /define"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/define.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: 6e43fb74dd1b0027ee1e2b4041c9a8ca1b3922973b89aefbabbe5c879ad27d65; do not edit directly -->

# /define

User input:
`$ARGUMENTS`

Invoke `aili-delivery-flow` in DEFINE mode.

Required behavior:
- Produce or align the complete implementation-readiness contract before BUILD.

Hard stops:
- Do not implement; unresolved material decisions or decision-shaping research, invalid/incoherent artifacts, or missing explicit final `test-plan.md` acceptance block BUILD readiness.

Output contract:
- Mode and backend, artifact status, readiness exactly `READY | BLOCKED`, named `Unverified` residuals separately, and the next gate.
