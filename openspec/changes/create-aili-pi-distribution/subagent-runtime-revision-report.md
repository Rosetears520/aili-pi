# Harness Change Report: generic Pi subagent and Pi-native AGENTS synchronization

## Summary

- Trace ID: `generic-subagent-and-pi-native-agents-sync-2026-07-24`
- Date: 2026-07-24
- Reporter: user request, classified by ROSE
- Status: approved for DEFINE write-back; implementation remains blocked until the revised final `test-plan.md` is accepted

## Required Fields

- Observed failure or rationale: The current `aili_task` contract rejects external child paths and exposes only two fresh, terminal, role-bound runs. The user needs the complete pinned `@agwab/pi-subagent` lifecycle and a Pi-native synchronization of the cross-project mechanisms in `aili-workflows/templates/opencode-global-AGENTS.md`.
- Evidence anchors:
  - `src/runtime/subagents.ts:310-385`: current AILI wrapper rejects resume/chain/background/worktree, enforces project-only paths and two active processes, and forces headless/shared/no-sandbox execution.
  - `node_modules/@agwab/pi-subagent/docs/usage.md`: pinned upstream API supports run/status/logs/wait/interrupt/mark-background/reconcile, async, worktree, sandbox, external `cwd`, and bounded parallel fan-out.
  - `node_modules/pi-permission-modes/README.md`: protected paths apply to file tools and parsed bash paths; sandboxed modes can deny configured secret reads.
  - `https://github.com/Rosetears520/aili-workflows/blob/7eb35f357ad489f5841ee10dac1e44549c1bdb76/templates/opencode-global-AGENTS.md`: user-selected upstream template, SHA-256 `45b2c81650433c64e6316f078d1cdb11779cf3a0309eabdbd3fd64d616f3f2c0`.
- Primary affected component: subagent-config / tool-policy.
- Secondary components: system-rules, global resource template, capability registry, doctor, README, role profiles, tests, provenance.
- Root cause hypothesis: The current adapter intentionally narrowed upstream capabilities for the former v1 contract. It therefore cannot support external inspection, durable task lifecycle, or broad independent fan-out.
- Proposed change: Replace public `aili_task` with an AILI-owned `subagent` wrapper exposing the full pinned upstream public schema while retaining a non-removable credential-path policy and delegated `pi-permission-modes` approval behavior. Keep `aili.<role>` profiles as optional global prebuilt agents. Synchronize universal AGENTS mechanisms into a pinned Pi-native adapter, omitting OpenCode-only control planes.
- Predicted fix: The model can select generic or `aili.*` workers, continue using run IDs, inspect artifacts/statuses, use explicit worktrees and external `cwd`, and opt into provider-domain-aware sandboxing without receiving credential files.
- At-risk regression: Existing skills and tests refer to `aili_task`; generic children may have broader lifecycle and filesystem reach; background work may outlive the parent turn; artifact/log inspection could expose sensitive output; global adapter expansion could conflict with user-managed prompt content.
- Verification trigger: revised subagent lifecycle, credential deny, permission-mode, sandbox, worktree, async/reconcile, global-template hash/behavior, package discovery, and documentation tests; an approved real-provider probe only after implementation.
- Rollback plan: Before the revised test plan is accepted, no runtime code changes. During BUILD, retain the bounded adapter in source history until the replacement passes its focused tests; reverting the replacement restores `aili_task` and the former global template without touching user global files.
- Unknowns: Exact provider-domain resolution for a sandboxed child remains runtime-dependent; real interactive confirmation behavior for external writes/background calls needs focused integration evidence; the package must preserve the credential guard when callers supply custom extensions or disable ambient extensions.
- Approval status: The user explicitly selected the generic-subagent contract and Pi-native synchronization option A in this conversation.
- Application status: DEFINE only.
- Verification result: Not run; no production/runtime files changed.
- Final verdict: `need-user` — accept the revised final `test-plan.md` before BUILD.
- Memory/evidence pointer: `openspec/changes/create-aili-pi-distribution/{design.md,specs/,test-plan.md}` and this report.
