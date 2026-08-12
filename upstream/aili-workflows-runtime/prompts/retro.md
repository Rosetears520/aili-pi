---
description: "AILI command: /retro"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/retro.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: dd6464633670de9c57189b47d9891d4f3030d50993f1c6d1ad30ed55546947dd; do not edit directly -->

# /retro

User input: `$ARGUMENTS`

Purpose: Produce one report-first retrospective from explicitly supplied or approved sanitized evidence.

Required behavior:
- Resolve the retrospective question, evidence set, privacy constraints, and repository-local report placement before any durable write.
- Separate observed outcomes, contributing factors, limitations, and candidate follow-up from unsupported explanations.
- Return improvement candidates to the appropriate existing owner; preserve normal approval, lifecycle, and verification gates for any later change.

Hard stops:
- Do not claim access to global history, hidden sessions, or unavailable evidence.
- Do not persist raw sessions, logs, transcripts, secrets, credentials, private data, or protected-source copies.
- Do not edit protected harness surfaces or treat the retrospective as acceptance, authorization, a lifecycle transition, or a final verdict.

Output contract:
- Question, accepted evidence sources, omissions, privacy limits, and report path or chat-only waiver.
- Observed outcomes, contributing factors, limitations, and bounded candidate follow-up.
- Explicit `Unverified` items and the decision or approval required before any follow-up change.
