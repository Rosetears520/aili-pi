---
description: "AILI command: /ship"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/ship.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: 1cd016b5661b0f65760694c7a7b058c9541182567ede9244011bc98914ca270a; do not edit directly -->

# /ship

User input:
`$ARGUMENTS`

Invoke `aili-delivery-flow` in SHIP mode.

Required behavior:
- Enter the same canonical SHIP loop as equivalent natural-language intent. Reconcile the implemented target directly and select only the evidence, review, repair, packaging, or release check required by the exact closeout claim.

Hard stops:
- Do not start a review swarm, broad matrix, or repair cycle merely because SHIP was requested. Fresh SHIP intent and current implementation evidence are required; exact high-risk/Git/release operations retain separate approval.

Output contract:
- Mode/target, closeout path when applicable, verdict, blocking or `Unverified` evidence, approvals needed, and next action.
