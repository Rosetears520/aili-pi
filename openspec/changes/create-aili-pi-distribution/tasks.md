## 1. Repository and executable baseline

- [x] 1.1 [框架内] After exact approval, initialize `/home/rosetears/code/aili-pi` as the `Rosetears520/aili-pi` Git repository, configure the declared remote, create a non-default development branch, and capture fresh branch/status evidence.
- [x] 1.2 [框架内] Initialize project `AGENTS.md`/rules and a minimal npm/TypeScript Pi Package skeleton only after the required Git/rules/dependency/lockfile approvals; pin the observed Node/Pi API baseline in compatibility metadata rather than hard-coding it as “latest forever.”
- [x] 1.3 [框架内] Add focused scripts/tests for typecheck, unit tests, generated-artifact drift, package validation, npm dry-run, and OpenSpec verification; establish a clean baseline before feature code.
- [x] 1.4 [框架内] Declare `@rosetears/aili-pi` Package metadata, one Extension entry, skill snapshot path, five prompt paths, npm files allowlist, MIT license, repository metadata, and no replacement agent CLI or theme resource.

## 2. Canonical skill migration and synchronization

- [x] 2.1 [框架内] Obtain a fresh exact attachment/read/write approval for the pinned `aili-workflows` target before any local cross-repository operation; read its current rules/Git state and create the upstream-owned DEFINE/change contract required for canonical正文 edits.
- [x] 2.2 [框架内] Run `upstream-skill-migration.md` against the exact upstream revision and produce the full per-skill/per-asset inventory with hashes, backend anchors, required capabilities, proposed canonical changes, adapter owners, tests, statuses, and unverified evidence.
- [x] 2.3 [框架内] Migrate lifecycle/harness and subagent/review/test skills in canonical `aili-workflows` to backend-neutral capability language, preserving OpenCode behavior and focused regressions.
- [x] 2.4 [框架内] Migrate browser/E2E, CodeGraph/Graphify/OpenSpec, and project-memory skills in canonical `aili-workflows`, including scripts/references/assets and explicit optional/fail-closed behavior.
- [x] 2.5 [框架内] Migrate Lark/external-service, document/media/data, and remaining generic development skills in canonical `aili-workflows`, preserving authorization/side-effect boundaries and regression evidence.
- [x] 2.6 [框架内] Validate the upstream capability manifest, unresolved-anchor report, OpenCode regressions, provenance, and complete inventory; stop with `blocked` for any unclassified or materially ambiguous skill.
- [x] 2.7 [框架内] Record the accepted upstream 40-character commit/tree hashes and create `upstream/aili-workflows.lock.json`, deterministic sync tooling, the exact embedded snapshot, and drift tests in `aili-pi` without semantic overlay or runtime network fetch.

## 3. ROSE and lifecycle Package runtime

- [x] 3.1 [框架内] Create the single owned Extension entry and internal modules for ROSE context, lifecycle routing, task runtime, permission modes, capability registry, doctor, shortcuts, and minimal status; verify helper modules are not independently loaded.
- [x] 3.2 [框架内] Generate the Pi-specific ROSE prompt/runtime adapter and append it through `before_agent_start` without replacing Pi base context or treating prompt text as permission.
- [x] 3.3 [框架内] Convert and package `/ideate`, `/define`, `/build`, `/ship`, and `/local-review` prompts, preserving four delivery modes, standalone local review, natural-language routing, and gate semantics.
- [x] 3.4 [框架内] Add conflict detection for prompt/command/shortcut ownership and tests proving conflicts cannot be silently reported as PASS.
- [x] 3.5 [框架内] Verify project rules remain higher-priority constraints and that missing project evidence is reported rather than fabricated.

## 4. Capability registry, compatibility report, and doctor

- [x] 4.1 [框架内] Define and validate `manifests/capabilities.json` with provider/adapter owner, platform, required/optional class, secret/network/side-effect class, probe, and dependent skills.
- [x] 4.2 [框架内] Define and validate `manifests/skill-compatibility.json` so every embedded skill has exactly one `native`, `adapted`, `optional`, or `blocked` record with evidence/reason.
- [x] 4.3 [框架内] Implement explicit optional-pack discovery and runtime `SKIP/WARN` behavior without installing external tools/assets or claiming skipped work ran.
- [x] 4.4 [框架内] Implement human and JSON doctor probes for Pi/API, Package resources, snapshot/hash, ROSE/prompts, roles/subagent runtime, permissions/shortcut, registry/packs, conflicts, platform, and provenance.
- [x] 4.5 [框架内] Add negative tests for missing, duplicate, malformed, timeout, unsupported, unverified, and blocked states; prove doctor never aggregates missing work into unconditional success.
- [x] 4.6 [框架内] Add stable-release validation that fails on any unexplained `blocked`, unclassified inventory item, missing required role/prompt/capability/platform evidence, or incomplete provenance.

## 5. Subagent profiles and child-process orchestration

- [x] 5.1 [框架内] Audit the pinned Pi official subagent example and `@agwab/pi-subagent` candidate patterns for license/provenance/API/maintenance; record allowed files/symbols, notices, rejected semantics, and focused reuse tests before copying or depending on code.
- [x] 5.2 [框架内] Generate exactly 19 Pi-owned role profiles with role prompt, tool/capability ceiling, output schema, provenance, and compatibility validation; reject unsupported OpenCode frontmatter semantics.
- [x] 5.3 [框架内] Implement `aili_task` with fresh UUID/process per task, `pi --mode json --no-session`, at most two tasks per call, session-wide semaphore 2, and no resume/chain/background/automatic redispatch API.
- [x] 5.4 [框架内] Disable recursive delegation structurally for child mode and project effective child authority as parent-active ∩ role-allowed ∩ mode-policy ∩ project/task boundary.
- [x] 5.5 [框架内] Implement incremental JSONL/status parsing and the structured result schema; enforce byte limits for lines, stderr tails, details/artifacts, retained events, and the 50 KiB final model-visible result with explicit truncation/error metadata.
- [x] 5.6 [框架内] Implement Unix process-group cancellation, grace/escalation, exactly-once settlement, orphan detection, and bounded redacted child failure diagnostics without AILI task retry.
- [x] 5.7 [框架内] Add executable tests for fresh IDs/processes, stale-ID rejection, concurrency 2, third-task handling, no recursive tool, permission ceilings, malformed/oversized protocol, non-zero exit, cancellation, and no orphan process.
- [x] 5.8 [框架内] Prototype child operation with representative Pi authentication paths without copying/logging credentials; if the required safety contract cannot be met, stop for DEFINE material-delta.

## 6. Standard and bounded-YOLO permissions

- [x] 6.1 [框架内] Implement session-local `standard` and `bounded-yolo` state with `standard` initialization and no cross-session persistence.
- [x] 6.2 [框架内] Implement effective policy intersection, canonical project/path checks, existing-parent realpath, symlink-escape detection, protected credential/auth paths, and redacted decisions.
- [x] 6.3 [框架内] Implement command/tool classification so unknown or complex operations ask/deny rather than default allow; retain exact gates for external-directory, credential/auth, destructive, push, publish, and release classes.
- [x] 6.4 [框架内] Implement noninteractive ask=>deny and tests proving no mode or child profile can widen parent/role authority.
- [x] 6.5 [框架内] Register `Ctrl+Shift+Alt+A`, `/aili-mode standard|yolo`, visible current-mode status, conflict diagnostics, and no implicit preauthorization from toggling mode.
- [x] 6.6 [框架内] Run negative tests for secret paths, symlink escape, external targets, ambiguous shell, headless asks, destructive commands, push/publish/release, denied role tools, and redacted audit output.

## 7. Thin Unix bootstrap

- [x] 7.1 [框架内] Implement the shared setup core and thin Linux-only entrypoint: detect Pi, reject macOS/native Windows before mutation, invoke only the official installer when absent, preserve existing Pi by default, and gate `--update-pi` explicitly.
- [x] 7.2 [框架内] Implement pre-mutation Pi version/API/package-resource/headless-load compatibility smoke and actionable fail-closed diagnostics with no credential output.
- [x] 7.3 [框架内] Delegate installation/reconciliation to `pi install` for the declared AILI npm source; do not overwrite Pi settings/auth/session/other packages or create a parallel core receipt.
- [x] 7.4 [框架内] Implement partial-failure reporting that distinguishes Pi from AILI state, leaves official Pi installed, and supplies repair/remove commands without destructive automatic rollback.
- [x] 7.5 [框架内] Add supported/unsupported platform, repeat-install, existing-config preservation, explicit-update, incompatible-latest, package-failure, update/list/remove, and offline-embedded-snapshot tests.

## 8. Integration, provenance, and release gates

- [x] 8.1 [框架内] Add `THIRD_PARTY_NOTICES.md` and SBOM/provenance generation for every adapted/dependent source with exact revision/version/license/files/symbols/local changes; keep unresolved sources reference-only.
- [x] 8.2 [框架内] Run local Package loading checks, `pi install`/list/remove checks in disposable Unix homes, prompt/skill/Extension discovery, ROSE routing, doctor JSON, permission, and subagent end-to-end tests.
- [x] 8.3 [框架内] Run Linux clean-home/reinstall/failure E2E plus macOS/native-Windows unsupported-before-mutation negatives, package dry-run/content allowlist, generated drift, typecheck/unit/integration suites, secret scan, and unrelated-state preservation checks.
- [x] 8.4 [框架内] Confirm the fixed skill snapshot inventory is complete, every role/prompt/core capability is proven, optional items have explicit guidance, and no unexplained `blocked` remains before any stable-release claim.
- [x] 8.5 [框架内] Publish/update user docs for install, `--update-pi`, remove, doctor, modes/shortcut fallback, optional packs, limitations, security boundary, provenance, troubleshooting, and deferred theme references.
- [x] 8.6 [框架内] Reconcile final implementation against specs/design/test-plan, rerun fresh OpenSpec strict validation and claim-matched verification, and stop before commit/push/publish/release until each exact operation is separately approved.

## 9. Native Pi integration revision

- [x] 9.1 [框架内] After revised Test Plan acceptance and a separate exact dependency/lockfile approval, replace `pi-web-search@1.3.1` with exact pinned `pi-web-access@0.13.0`, retain the other three named pins, and update notices/SBOM/provenance with package/source/license/API evidence.
- [x] 9.2 [框架内] Register the complete `pi-web-access` surface inside the single AILI Extension; prove search/content/fetch registration, visible provider fallback, clone/PDF/video/curator/bundled-skill side-effect disclosure, and default quota-state behavior in fixtures/disposable HOME.
- [x] 9.3 [框架内] Replace owned permission modes with `pi-permission-modes` `Default/Plan/Build/YOLO`, `/perm`, and `Alt+M`; remove the superseded AILI mode/command/shortcut surface; prove sandbox-enabled and explicit-degrade paths without claiming isolation.
- [x] 9.4 [框架内] Replace the owned child lifecycle with a bounded `@agwab/pi-subagent/api` adapter; retain only AILI role/path/tool/headless policy guard and result normalization; disable worktree/background/resume/automatic redispatch/recursion and prove cancellation, artifacts, concurrency-two, and fail-closed boundaries.
- [x] 9.5 [框架内] Package a Pi-safe global ROSE adapter template and the 19 generated profiles. Add an explicit marker-aware global-resource bootstrap path which never overwrites unrelated user content or automatically prunes profiles; prove it in disposable HOME fixtures.
- [x] 9.6 [框架内] After a separate exact `~/.pi/agent/` write approval, run the minimum authorized real-global installation/update probe; otherwise report global-resource behavior as unverified and do not claim it installed.
- [x] 9.7 [框架内] Update README/doctor/capability registry/compatibility records and rerun strict validation plus all changed-scope checks; stop for DEFINE if a third-party API cannot satisfy the contract without reimplementing it.

## 10. Generic Pi-subagent and Pi-native global AGENTS revision

- [x] 10.1 [框架内] Replace public `aili_task` registration, types, runtime summary, doctor evidence, and package discovery expectations with a generic `subagent` wrapper that accepts the complete pinned upstream `@agwab/pi-subagent@0.4.8` public schema and exposes no legacy alias.
- [x] 10.2 [框架内] Preserve the 19 generated global `aili.<role>` profiles as optional named upstream agents; prove AILI-role, generic named-agent, and agentless/one-off role-context paths without requiring AILI structured output for generic runs.
- [x] 10.3 [框架内] Remove the AILI two-child/project-only/headless/shared/no-sandbox/result-normalization restrictions while retaining upstream recursive-tool exclusion, version-bound fan-out validation, durable run/attempt/artifact lifecycle, and action forwarding.
- [x] 10.4 [框架内] Add a non-removable generic-child credential policy integrated with `pi-permission-modes`; prove protected file-tool and parsed-bash reads deny without leaked content, including with external `cwd`, YOLO, custom extensions/resources, or background runs.
- [x] 10.5 [框架内] Prove non-credential external `cwd`/path work, permission-confirmed external writes/headless denial, explicit worktree creation/cleanup/failure retention, async/status/logs/wait/interrupt/mark-background/reconcile, fail-fast/sibling cancellation, and upstream concurrency caps in disposable fixtures.
- [x] 10.6 [框架内] Prove sandbox false/deny-all/explicit-domain paths and visible degradation without claiming universal isolation; obtain separate exact approval before any real provider/sandbox/external-directory probe.
- [x] 10.7 [框架内] Add a pinned source/hash record and Pi-native derivation for `aili-workflows/templates/opencode-global-AGENTS.md`; synchronize portable governance mechanisms, exclude OpenCode-only control planes, and update marker/global-resource preservation tests without touching real `~/.pi/agent/`.
- [x] 10.8 [框架内] Update README, capability registry, provenance/SBOM, doctor, package/load fixtures, focused tests, and release validation; rerun strict OpenSpec validation and request separate approval for any real global-home, dependency/lockfile, commit, push, publish, or release operation.
