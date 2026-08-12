---
description: "AILI command: /ideate"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/ideate.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: 808247f006607fc0469cd7db779f473473a26c9f28107606014461acdaa2dfb3; do not edit directly -->

# /ideate

User input:
`$ARGUMENTS`

Invoke `aili-delivery-flow` in IDEATE mode.

Required behavior:
- Explore unclear ideas, compare options, and surface uncertainty before any change is defined or built.

Hard stops:
- Do not write production implementation; route any hard formal or material trigger through the canonical DEFINE gate.

Output contract:
- Mode, concise options and trade-offs, assumptions or `Unverified` items, and the recommended next action.
