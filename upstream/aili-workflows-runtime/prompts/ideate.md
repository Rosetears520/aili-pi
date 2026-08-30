---
description: "AILI command: /ideate"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/ideate.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: e7d5c65b43cadf73f4927480afbac12f080c9387af15e08fcaad037b4c6eb1b5; do not edit directly -->

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
