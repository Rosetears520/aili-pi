# Tasks: Absorb Pi Runtime Integrations and Agent Controls

## 1. Lock and import upstream sources

- [ ] 1.1 Record a source/distribution matrix for `pi-notify`, `pi-file-context`, `pi-tui-kit`, `pi-codex-fast`, Graphify and `pi-tool-display`: immutable revision or exact package integrity, license/disposition, inventory, adaptation/reference boundary, NOTICE/provenance/SBOM treatment and verification.
  - Verify: provenance generation, exact source/dependency inventory and negative assertions. `pi-codex-fast` remains reference-only unless an independently licensed source disposition is established.
- [ ] 1.2 Import `pi-notify` into an AILI-owned boundary and integrate it through the sole extension entry with non-fatal error behavior.
  - Verify: unit tests for OSC, tmux, Windows/WSL PowerShell launch failure, and agent-end integration.
- [ ] 1.3 Import `pi-file-context` into an AILI-owned boundary, retain its bounded TUI/Git selection behavior, and expose it through an adapter seam suitable for later Context Core extraction.
  - Verify: selected upstream behavior tests plus AILI extension-load tests.
- [ ] 1.3-R3 Repair the absorbed file-context TUI adapter to cover upstream content search, preview, multi-range/hunk selection and Git provenance behavior omitted by the initial partial result.
  - Verify: focused file-context behavior tests and extension-load test.

## 2. Correct Persistent Agent inheritance and authorization

- [ ] 2.1 Add a model override request authorization boundary before allocation; require fresh UI confirmation for model-originated requests that differ from direct-parent resolved identity.
- [ ] 2.2 Reorder resolution so user-owned instance/project/global overrides precede direct-parent inheritance, which precedes profile/runtime fallback; expose resolved model source evidence.
- [ ] 2.3 Carry a frozen direct-parent `{canonical, thinking, speedTier, source}` snapshot through nested `TaskAncestry`, acceptance/audit/settlement and revival; preserve readable legacy journal layers and ensure child `createAgentSession` uses exact inherited thinking.
- [ ] 2.4 Add explicit compatible thinking validation without silent downgrade/model switch.
- [ ] 2.5 Add Fast/Priority runtime state, supported-Codex provider payload adaptation, inheritance, status/query/toggle behavior, and bounded request evidence.
  - Verify: deny/no-UI/confirmed one-shot scenarios, profile precedence, nested inheritance, thinking compatibility, and provider payload test matrix.

## 3. Observe concurrency and retain Formal Board gates

- [ ] 3.1 Add bounded scheduler timing observation and persistent evidence for scheduled/start/first-activity/completion events, cancellation/missing-first-activity semantics and content-free journal retention.
- [ ] 3.2 Add a deterministic three-agent overlap test/probe without changing top-level scheduling or nested sync behavior.
- [ ] 3.3 Add root-cause diagnostics and dispatch-level zero-side-effect coverage for formal `EXISTING_PAIR_INVALID` outcomes, including no Agent/job/turn journal event, no scheduler enqueue and no workspace lease.
  - Verify: focused scheduler, task coordinator, and formal root tests.

## 4. Extend existing MCP composition

- [ ] 4.1 Add Graphify to the existing MCP server inventory using its upstream multi-project `project_path` support and adapter session cwd, not a generated second config; use preflight-gated `keep-alive`, per-server failure isolation, no duplicate registration and bounded cleanup.
- [ ] 4.2 Implement CodeGraph exact-`1.5.0` PATH-versus-pinned-npx resolution and Doctor evidence.
- [ ] 4.3 Add core MCP routing guidance without flattening all tools or mandating redundant query chains.
- [ ] 4.4 Add redacted local Context7 placeholder/env configuration support; no tracked secret.
  - Verify: parent/Worker config/cwd/lifecycle/doctor/routing tests and separately-gated MCP startup/reconnect/shutdown probes.

## 5. Normalize native Footer

- [ ] 5.1 Render actual model plus thinking level and live refresh on model/thinking changes.
- [ ] 5.2 Normalize only recognized compact Codex 5h quota text with specified grammar; omit unknown/malformed/non-Codex input without modifying quota semantics.
- [ ] 5.3 Read active permission mode from the permission runtime's published `perm` status and order `Permission Mode · MCP · time` on line two.
- [ ] 5.4 Preserve deterministic narrow layout and lifecycle disposal.
  - Verify: footer layout/lifecycle/runtime tests for all requested examples, switches, and narrow widths.

## 6. Future-only artifacts and closeout evidence

- [ ] 6.1 Add Future OpenSpec requirements for Agent Inspector and Context Core without implementation.
- [ ] 6.2 Record `pi-tool-display` as reference-only.
- [ ] 6.3 Update README, persistent-agent documentation, Notices, SBOM/provenance and Doctor as supported by completed work.
- [ ] 6.4 Run focused tests, typecheck, generated/provenance/package validation, strict OpenSpec validation, and separately-gated live probes; inspect the scoped diff.

## 7. SHIP repair and release preparation

- [ ] 7.1 Repair release-blocking Fast reachability, MCP test isolation/inventory expectations, file-context hunk selection, scheduler interval observations, and malformed Codex quota rejection.
- [ ] 7.2 Update public package version references to `0.2.4`, and reconcile provenance, NOTICE, SBOM and candidate package evidence for the adopted/reference-only integrations.
  - Verify: affected focused tests, typecheck, provenance validation, candidate `npm pack --dry-run --ignore-scripts`, strict OpenSpec validation and scoped diff inspection.

## Non-goals

No legacy subagent, nested parallel scheduler change, Formal Board bypass, Web Inspector implementation, full Web UI, Super-MCP, `fast-gpt-*`, Git mutation, publish, or release.
