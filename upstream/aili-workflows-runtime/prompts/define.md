---
description: "AILI command: /define"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/define.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: 5fb8e724eeaafe406a06ea87863baaeb8c2c21e1ef0e14cbf300b043cc4fa9f9; do not edit directly -->

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
