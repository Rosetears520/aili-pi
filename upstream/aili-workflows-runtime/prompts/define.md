---
description: "AILI command: /define"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/define.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: 11334bd9a7beb27be97ce9ec1ab88bd46534c48278979d66493a37900a4d28ca; do not edit directly -->

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
