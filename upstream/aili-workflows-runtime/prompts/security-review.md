---
description: "AILI command: /security-review"
argument-hint: "[request]"
---

<!-- GENERATED: aili-runtime-projections/v1; canonical_inputs: adapters/opencode/adapter.json, adapters/pi/adapter.json, core/commands/security-review.md, core/governance/decision-core.md, core/governance/operating-discipline.md, core/roles/roles.json, manifests/runtime-projections.json; input_sha256: ae250107962d32b1ae16a14a0e413008d2010e42ab9e29defbd61197928e8ecb; do not edit directly -->

# /security-review

User input: `$ARGUMENTS`

Purpose: Run a preview-first, report-only security review through the independent `security-auditor` role without granting scan, repair, acceptance, or completion authority.

Required behavior:
- Resolve and present the target, coverage, backend, output location, and source-transmission boundary before any scan.
- Without an explicit target, separate staged/unstaged tracked working-tree coverage from explicitly inventoried untracked paths; exclude ignored files and detected secrets from default selection.
- Preview separate scan units and obtain exact approval before an external backend receives source. Use the independent security specialist for the review and retain source-scan references when converging results.
- Write a durable report only on explicit request or at an already-defined formal path. Mark refused, failed, unavailable, or uncovered units incomplete and `Unverified`.

Hard stops:
- Do not scan, acquire a package, install a dependency, read or infer credentials, transmit source, or write a durable report without the separately required authority.
- Do not repair code, accept risk, or convert findings into a lifecycle, verification, release, or completion verdict.
- Do not store source-bearing backend output, secrets, credentials, or private scan artifacts in the scanned repository or its enclosing Git worktree.

Output contract:
- Resolved target, coverage units, backend/preflight state, output boundary, and exact approvals still required.
- Preview result or review findings with coverage, source-scan references, deduplication limits, and explicit incomplete portions.
- Report location only when authorized, plus `Unverified` items and the next required decision.
