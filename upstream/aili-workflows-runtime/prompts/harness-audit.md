---
description: "AILI command: /harness-audit"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/harness-audit.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: 34f30e9f467c48910659695b147674e748fa28a3a6d15a75f263d77bef9d965a; do not edit directly -->

# /harness-audit

User input: `$ARGUMENTS`

Purpose: Run one bounded, report-first audit of a named harness routing, context-cost, review fan-out, parallelism, trigger-noise, false-success, or evidence-loss concern.

Required behavior:
- Resolve the target surface, question, available evidence, and report destination before assessing the harness.
- Inspect only evidence relevant to the named concern and distinguish observed behavior, missing evidence, and proposed improvements.
- Return evidence-grounded findings, risks, and candidates for a separately approved harness change; preserve the current canonical owner and operation gates.

Hard stops:
- Do not edit harness controls, invoke another process loop, dispatch a review swarm, or turn the audit into a lifecycle transition.
- Do not treat an audit finding as implementation authorization, acceptance, verification, or a final verdict.
- Do not write a durable report without an existing repository-local path or an explicit placement decision.

Output contract:
- Target, evidence scope, inspected sources, and explicit evidence limits.
- Findings grouped by routing, cost, evidence, or safety impact, with candidate follow-up owners.
- Report path or chat-only result, plus `Unverified` items and the next decision needed.
