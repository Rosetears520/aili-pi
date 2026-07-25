# BUILD Context — replace-subagent-runtime-with-persistent-agent-framework

## Route and authority

- Lifecycle mode: `BUILD`
- Class: formal/material implementation of one accepted OpenSpec change
- Target repository: `/home/rosetears/code/aili-pi`
- Startup Git host evidence: branch `fix/quota-animation-subagent-label`, HEAD `227d9dc9392a83748ac4cf77f5c386cbacf7957c`; unrelated pre-existing dirty paths remain out of scope and must not be overwritten or cleaned.
- Accepted contract: `proposal.md`, `interview.md` D-001–D-014, `design.md`, both `specs/**/spec.md`, `tasks.md`, and the user-accepted final `test-plan.md` in this change.
- Acceptance: user accepted the final test plan and repository-local BUILD, then explicitly authorized dependency/public migration, local-package provider verification, disposable external Git and positive sandbox probes, a release-only worktree, version `0.1.10`, commit, push to `origin/main`, and npm publication on 2026-07-25.
- Exact operations still not authorized: copied or substantively adapted OMP source; `aili-workflows` writes; unrelated current-worktree cleanup/stash; force-push/history rewrite; AILI Compact publication.

## Accepted scope and forbidden scope

Accepted implementation is the AILI-owned persistent Agent framework defined by the active change: official Pi child Session JSONL, 20 bundled selectors, `task`/`hub`, lifecycle/message/job/delivery storage, permissions, conflict-aware workspaces, model selection, output/history, migration adapters, tests, doctor/docs/provenance, and non-destructive legacy-data handling.

Forbidden without a new exact gate: modifying `package.json` or `package-lock.json`; writing real `~/.pi/agent`; copying OMP implementation; mutating `.worktrees/oh-my-pi-reference`; modifying `aili-workflows`; touching unrelated current dirty work; Git/release operations. A discovery that changes accepted scope, architecture, dependency, public contract, permission, acceptance, or verification strategy is `BUILD_MATERIAL_DISCOVERY` and returns affected work to DEFINE.

## Resolvable package queue

1. **PKG-01 Host seams and version binding** — tasks 1.2–1.8. Exact current prototype baseline is the repository pin official Pi `0.81.1`; inspect the pending `support-pi-0-82-0` change for conflict, but do not change dependencies. Acceptance: disposable/offline evidence resolves SessionManager, resource cloning, approval bridge, parent sidecar lifecycle, and isolation seams or records a DEFINE-return blocker.
2. **PKG-02 Role profile v2 and general** — tasks 2.1–2.5; depends on PKG-01 tool/profile seam.
3. **PKG-03 Durable parent storage** — tasks 3.1–3.6; depends on HOST-1.
4. **PKG-04 Child session/policy assembly** — tasks 4.1–4.5; depends on HOST-2/HOST-3 plus PKG-02/03.
5. **PKG-05 task and scheduler** — tasks 5.1–5.6; depends on PKG-03/04.
6. **PKG-06 hub and messaging** — tasks 6.1–6.5; depends on PKG-03/04/05.
7. **PKG-07 Delivery/output/history/ownership** — tasks 7.1–7.5; depends on PKG-03/05/06 and HOST-4.
8. **PKG-08 Permission bridge hardening** — tasks 8.1–8.5; depends on HOST-3 and PKG-04/05.
9. **PKG-09 Conflict-aware workspace** — tasks 9.1–9.5; depends on HOST-5 and PKG-05.
10. **PKG-10 Model selection/config** — tasks 10.1–10.6; depends on PKG-03/04/06.
11. **PKG-11 Runtime migration/provenance** — tasks 11.1–11.5; safe registration/provenance work may proceed, but OMP code-copy and dependency/lockfile portions stop at their exact gates.
12. **PKG-12 Deterministic regression** — tasks 12.1–12.8, developed with owning packages and reconciled after PKG-11.
13. **PKG-13 Docs/cross-change alignment** — tasks 13.1–13.4; cross-repo write remains packet-only.
14. **PKG-14 Completion verification** — tasks 14.1–14.4; run only accepted local checks, classify live/exact-gate rows `Unverified`, inspect branch/worktree hygiene, and stop BUILD without SHIP.

## Active package PKG-14 (public migration complete; live/release evidence intentionally non-pass)

- Completed local scope: exact approved dependency/lockfile removal, deletion of the old wrapper and obsolete fixtures, public single-entry `task`/`hub` registration with direct-user model command, production official-Pi session/tool/model/permission/workspace/delivery wiring, capability/adapter/provenance/SBOM/doctor/docs/OpenSpec reconciliation, deterministic regression, package dry-run, and diff hygiene.
- Public contract: `@agwab/pi-subagent` is absent from package and lock inventory; `src/runtime/subagents.ts` and old generic/live tests are removed; public discovery contains `task` and `hub` and rejects any `subagent` alias. Historical `.pi/agent/runs/`, Pi sessions, user configuration, and sidecars remain untouched.
- Release evidence: real provider sync/follow-up/async, positive Bubblewrap child Bash, and disposable external-workspace lifecycle probes passed. `manifests/live-verification.json` schema v3 binds those rows to the exact implementation hashes.
- Release isolation: this worktree contains only the Persistent Agent change. AILI Compact code, tests, docs, and its AGPL/MIT blocker remain in the original dirty worktree and are excluded from this MIT package/release.
- Verification: focused role generator/validation tests plus `npm run validate:roles` only after expected generated outputs are updated.
- Pause condition: preserving a role would require changing its accepted responsibility/tool/output contract or writing canonical `aili-workflows`.
- Commit allowance: none.

## Canonical CONT-005 envelope

```yaml
loop_kind: objective
trigger: explicit accepted-contract BUILD request
trigger_evidence: "User: 接受，你直接开始吧，你也可以充分利用subagent来帮你完成这个工作"
objective: implement the accepted persistent Agent framework through the dependency-ordered package queue until complete or an exact/material gate stops affected work
accepted_contract:
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/proposal.md
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/design.md
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/specs/persistent-agent-orchestration/spec.md
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/specs/subagent-model-selection/spec.md
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/tasks.md
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/test-plan.md
change_id: replace-subagent-runtime-with-persistent-agent-framework
success_evidence: accepted test-plan traceability plus package-scoped fresh checks and final changed-scope verification
budgets:
  iteration: { limit: 14, consumed: 1, remaining: 13 }
  time: null
  tokens: null
  review_repair: null
human_gate: final test plan accepted; repository-local BUILD authorized
operation_gate: safe local reads/edits/diagnostics only; dependency, lockfile, OMP code-copy, live/global/external/cross-repo/Git/release operations require separate exact approval
allowed_actions:
  - repository-local task-scoped reads and edits
  - disposable offline fixtures under project-defined test paths
  - focused local diagnostics and tests
  - fresh bounded subagent dispatches within the declared repository and package scope
writeback_targets:
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/progress.txt
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/tasks.md
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/context.md
  - openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/drift-log.md only for actual contract drift
stop_reason: null
outcome: null
```
