## 1. Reconcile public contract and readiness

- [x] 1.1 Audit PR #1 and coordinated OpenSpec artifacts against accessible Git revisions and current public diff; classify the two older changes as historical/capability-source references for overlapping scope.
  - Reset unsupported `done`, test-count, snapshot and runtime-ref claims to pending/blocked/not-independently-verifiable.
  - Preserve uncertainty in ordinary prose; do not use current-session or opaque refs as public authority.
  - Prevent `add-file-task-board` and `separate-shared-and-pi-skill-distribution` from being selected as parallel BUILD boards for overlapping packages.
  - Completed 2026-08-01: historical 34-file PR boundary verified; overlapping boards reconciled; independent proposal status preserved; public claim tags and current-session authority removed from the four PR change roots.
- [x] 1.2 Record the exact upstream release tuple and verify the exact tarball/revision contains both protocols and the canonical role inventory.
  - Completed 2026-08-01 with exact `rose-aili@0.4.2`, Git/npm commit `bb1fedacc46d71045daa6257d121f2b71ba29d54`, tarball SHA-256 `df7c67af6acaa7e5080e81f5c7fab6b9dc77b5a24397a26240a527370cad206f`, both protocol reference hashes, and the matching 19-role inventory.
- [x] 1.3 Obtain explicit acceptance of the final `test-plan.md` and fresh BUILD intent.
  - Completed 2026-08-01: the user explicitly accepted the final plan and requested direct BUILD entry.
  - Acceptance does not authorize lockfile, deletion, external, Git, publish or release operations.

## 2. Pin upstream and generate routing projection

- [x] 2.1 Update `upstream/aili-workflows.lock.json` and compatibility/provenance evidence to the exact accepted release.
  - Completed 2026-08-01 under explicit replacement approval: 65 skills/588 files are pinned to `rose-aili@0.4.2` and exact commit `bb1fedacc46d71045daa6257d121f2b71ba29d54`; release/protocol/role inventory metadata and provenance are verified.
- [x] 2.2 Implement `scripts/sync-agent-routing.ts` and generate `manifests/agent-routing.generated.json` from the exact upstream matrix.
  - Completed 2026-08-01: deterministic generation and drift verification cover all 19 canonical specialists without duplicating RoleProfile descriptions or permission authority.
- [x] 2.3 Reconcile role/routing/source commits and hashes across generators, manifests and generated validation.
  - Verify each canonical specialist maps exactly once; reject `general`, unknown roles, protocol/hash drift and duplicate descriptions.
  - Completed 2026-08-01: exact-release role profiles, role/routing manifests, runtime constants, generators and validation all bind commit `bb1fedacc46d71045daa6257d121f2b71ba29d54`; focused positive and fail-closed tests pass.

## 3. Integrate model-facing routing and persistent identity rules

- [x] 3.1 Align `rose-context.ts` and `templates/APPEND_SYSTEM.md` on ordinary/formal routing, human-artifact prose and authorization separation.
  - Completed 2026-08-01: the concise per-turn Runtime summary and readable static adapter now share ordinary/formal owner selection, persistent continuation, human-artifact prose, acceptance/authorization and YOLO boundaries.
- [x] 3.2 Extend persistent `task` metadata/prompt guidelines with the generated compact catalog only while the tool is active.
  - Completed 2026-08-01: production loads and validates the generated 19-specialist routing manifest, joins routing cues to validated RoleProfile descriptions, and exposes bounded task metadata only through the active `task` tool; failures are non-pass with no silent fallback.
- [x] 3.3 Enforce formal explicit Specialized selector/async while preserving ordinary omitted-agent→`general` and current ordinary defaults.
  - Completed 2026-08-01: formal task validation rejects omitted/non-exact/general selectors and omitted/non-boolean async before any allocation; ordinary general/default-async, blocking-profile and nested-sync behavior remain unchanged.
- [x] 3.4 Add continuation audit fields and enforce same-package/same-role/same-scope/same-permission/same-evidence reuse only.
  - Completed 2026-08-01: formal assignment and hub continuation use one bounded durable identity covering package, role, scope, forbidden scope, normalized write scope, acceptance and expected evidence; mismatches fail before continuation execution, successful sends are audited, RoleProfile drift is rejected, and ordinary behavior remains compatible.

## 4. Implement the Pi formal task-board adapter

- [x] 4.1 Implement or reconcile `aili-task-board/v1` parser and validator without redefining canonical semantics.
  - Completed 2026-08-01: parser/validator consumes the exact upstream header, 27-field package, seven-state and 12-event contract, rejects runtime-private board/progress mappings and invalid role/gate/evidence/state combinations, and classifies legacy/unmanaged input without migration.
- [x] 4.2 Implement exact OpenSpec root resolution and fail-closed path/symlink/collision/identity handling.
  - Completed 2026-08-01: exact `openspec/changes/<changeId>/formal-task-board.md` + `progress.txt` resolution rejects unsafe identity/path/topology and invalid/legacy/mismatched pairs before allocation or mutation; safe initialization is exclusive, race-aware and rollback-protected.
- [x] 4.3 Implement state/update, checkbox, evidence/disposition/join and append-only progress behavior.
  - Completed 2026-08-01: ROSE-only canonical updates enforce seven-state transitions, readiness/waiver/inspection/disposition/join/evidence gates, checkbox equivalence and portable append-only progress through guarded atomic pair replacement.
- [x] 4.4 Bind `formalContext: { changeId }` to owning-board protection across workspace leases and revived Agent turns.
  - Completed 2026-08-01: durable formal workspace leases bind the exact canonical change/protected paths, continuation identity, role, workspace mode/root/scope/cwd and initial job/turn; initial and revived execution revalidate the current Board and fail closed before child-session/model execution on missing or changed identity, with no isolated-to-shared fallback.
- [x] 4.5 Enforce pre-mutation write/edit deny and exact-deny-or-no-bash behavior for formal children; preserve ordinary behavior.
  - Completed 2026-08-01: complete formal leases block write/edit aliases to both owning files before mutation with byte-preservation evidence; bash is available only through a matching ready process-owned sandbox configured with the exact two absolute denies, and YOLO/call narrowing cannot restore hard-denied bash. Ordinary behavior remains unchanged.
- [x] 4.6 Implement restart reconciliation with returned/blocked mapping, append-only `RECONCILED` and zero replay/redispatch/fallback/auto-done.
  - Completed 2026-08-01: explicit ROSE-only reconciliation binds canonical Board packages to exact immutable per-job/turn result/history evidence, maps only strict completed/partial envelopes to returned and all missing/failed/interrupted/unexecuted/blocked/unverified/malformed evidence to blocked, appends portable `RECONCILED` atomically, keeps async joins open, and revalidates evidence throughout guarded replacement with rollback on drift.

## 5. Decouple shared and Pi Skill distribution

- [x] 5.1 Remove the shared Skill `postinstall` owner and exclude generic `skills/**` from npm runtime publication.
  - Completed 2026-08-01 under exact deletion/package-lock approval: removed the global-sync scripts, `postinstall`, generic `skills/` publication and root `hasInstallScript` metadata without dependency-graph changes; dry-run inventory proves the retired owner and generic snapshot are absent.
- [x] 5.2 Preserve repository-only exact snapshot verification without semantic hand-editing or second-owner claims.
  - Completed 2026-08-01: repository `skills/**` remains an exact 65-skill/588-file lock-bound verification baseline while package/runtime declarations exclude it; the stale 64-skill runtime fixture now derives exact inventory from the workflow lock.
- [x] 5.3 Update README/bootstrap/package manifests for separate explicit shared-workflow and Pi-package lifecycle owners.
  - Completed 2026-08-01: README and bootstrap name explicit `rose-aili@0.4.2` shared-workflow commands separately from Pi Package install/update/remove; bootstrap reports shared workflows as not run and tests deny npm/npx/rose-aili child invocation.
- [x] 5.4 Implement read-only doctor compatibility states and remediation guidance with no fetch/install/update/fallback behavior.
  - Completed 2026-08-01: doctor inspects the two default shared protocol references read-only, reports the four accepted compatibility states plus bounded source-match detail, accepts structurally compatible hash drift, and emits only textual exact-version remediation.

## 6. Verification

- [x] 6.1 Run focused routing projection, ordinary/formal Agent, continuation, board, protection and reconciliation tests.
  - Completed 2026-08-01: 16 directly owning unit/integration files passed 205/205 tests across INT-04 through INT-10, including ordinary controls and formal reconciliation race rollback.
- [x] 6.2 Run package/doctor/bootstrap/generated/provenance/compatibility checks and affected integration tests.
  - Completed 2026-08-01: package, doctor, bootstrap, generated, provenance, compatibility, exact-snapshot and affected integration checks pass; revision-bound persistent-Agent adapter evidence is promoted from unverified to adapted. Final reconciliation aligned the permission validator with the six generated adaptations, and the full provenance unit file now passes.
- [x] 6.3 Inspect `npm pack --dry-run --json` and a disposable HOME install/update/remove cycle; prove shared Skills remain byte-identical.
  - Completed 2026-08-01: offline local npm-source fixture exercised real Pi install `0.1.12`, update to `0.1.13`, and remove through a task-owned `npmCommand` wrapper; packed inventory excludes shared Skills/retired owner and the seeded shared tree retained exact hash `34282f71105af8a0555b014aba26f6570260bc08bfd37214b13d6ce543737575` at every stage with zero npx/rose-aili child invocation.
- [x] 6.4 Run typecheck, strict OpenSpec validation and diff hygiene; broaden to the full suite only if affected integration claims remain unsupported.
  - Completed 2026-08-01: typecheck, direct strict OpenSpec validation and whole tracked-diff hygiene pass; the affected focused/integration matrix already supports the accepted claims, so the conditional full-suite expansion was not triggered.
- [x] 6.5 Reconcile every result with the requirement matrix and record real provider/HOME/release limitations without false PASS.
  - Completed 2026-08-01 after two convergence passes and one explicit material reacceptance: all INT rows and selected scenarios are reconciled; the Runtime owning pair is `formal-task-board.md` + `progress.txt`; current live provider/process-loss, real HOME/WSL/public-registry and operation gates remain explicitly unverified or absent.

## 7. Release boundary

- [x] 7.1 Confirm the two historical source changes cannot independently advance overlapping work, and independent TUI/image-paste and emergency-checkpoint proposals neither block nor inherit this change's completion.
  - Completed 2026-08-01: overlapping boards remain historical/capability sources; TUI/image-paste is independent and unreconciled with historical candidate evidence; emergency checkpoint is proposal-only/upstream-blocked; none inherits or blocks this BUILD.
- [x] 7.2 Record implementation, focused verification, full required suite, exact upstream release, candidate identity and public exposure review as separate states.
  - Completed 2026-08-01 in `release-state.md`; conditional full-suite non-execution, dirty-tree candidate identity, bounded local exposure review, live/real limitations and absent operation authority are explicit.
- [ ] 7.3 Request separate exact approvals for commit, push, npm publish, GitHub release and real WSL install; execute none by default.
