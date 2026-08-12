# Tasks

## 1. Freeze external identities and operation boundaries

- [x] 1.1 Verify the frozen DEFINE identity table against published package/tarball/source contents: `rose-aili@0.4.7`, `pi-mcp-adapter@2.23.0`, `mempalace==3.7.0`, `@upstash/context7-mcp@4.0.2`, `@playwright/mcp@0.0.79`, `@colbymchenry/codegraph@1.5.0`, `billion-context-pi@0.1.34`, exact `@narumitw/pi-codex-compact` candidate (currently observed `0.50.0`), `@narumitw/pi-retry@0.31.0`, and official Pi `0.84.1` packages. Record algal only as comparison evidence, not a production identity.
  - Acceptance: no identity, license, command, runtime API or Pi/Node/Python compatibility contradicts the accepted contract; any contradiction stops as material discovery rather than floating a pin.
  - Verify: canonical provenance input, tarball/wheel inventory and focused pin/compatibility tests agree with official release/package evidence.
- [x] 1.2 Record each operation authorization independently before it runs: dependency/lockfile mutation; bundled-package change; root-license replacement; shared MCP config write; each external tool install; MemPalace initialization; MemPalace read; MemPalace write; MemPalace delete/import/mine; embedding download; Playwright browser install; CodeGraph project initialization/index; each provider/live probe; Git; publish; release.
  - Acceptance: each exact target is explicitly authorized or remains not executed; no grouped approval is inferred.
  - Verify: progress evidence lists operation class, target, authorization state and actual command only when run.

## 2. Consume the Workflow runtime bundle

- [x] 2.1 Implement typed loading and validation for the pinned `rose-aili` Pi runtime bundle.
  - Acceptance: version, provenance, schema and cross-file identity mismatch fail closed.
  - Verify: focused loader tests cover valid, missing, mixed and unsupported bundles.
- [x] 2.2 Move every bundle artifact to one explicit consumer/owner: runtime system input, persistent role metadata, selection map, protocol validators, installation-boundary checks and provenance/doctor.
  - Acceptance: each of system, role metadata, selection map, protocols, installation contract and provenance has one documented consumer and fail-closed behavior; all 20 canonical `rose-aili@0.4.7` Specialized Agents, including read-only `aili.solution-architect`, are exposed without a handwritten duplicate map, fixed 19-role assertion or adapter-side filtering.
  - Verify: an artifact-to-consumer matrix plus role/routing, installation-boundary, doctor and persistent-Agent focused tests assert one consistent 20-role catalog and the canonical `solution-architect` tool ceiling.
- [x] 2.3 Retire obsolete Workflow snapshot, duplicate prompts/roles and overlapping APPEND_SYSTEM installation responsibilities only after 2.1–2.2 pass.
  - Acceptance: production package has one Workflow semantic owner; legacy user files are reported but untouched.
  - Verify: package inventory, global-resource tests and doctor tests prove absence/non-mutation.

## 3. Integrate session-owned MCP

- [x] 3.1 Add the pinned `pi-mcp-adapter` dependency and a shared config-path resolver for `${XDG_CONFIG_HOME:-$HOME/.config}/mcp/mcp.json`.
  - Acceptance: Parent and Worker resolve the same path; source contains no current-user absolute path.
  - Verify: pure path/config tests cover XDG override, default home and missing environment.
- [x] 3.2 Compose one adapter instance into Parent and each persistent Worker explicit child extension list.
  - Acceptance: ambient extensions remain disabled for Workers; each session has an independent runtime.
  - Verify: host-seam/integration tests prove instance isolation and no duplicate/forbidden extension load.
- [x] 3.3 Dispose MCP resources on park, release, cancellation, prepare/revive failure, replacement and shutdown.
  - Acceptance: affected transports/processes close once without affecting another session.
  - Verify: lifecycle tests inject observable disposable factories across every seam.
- [x] 3.4 Bridge all MCP origins into the existing permission/approval intersection.
  - Acceptance: proxy, direct, script and resource calls cannot widen Parent/role/task/Pi authority; headless approvals fail closed.
  - Verify: a per-origin positive/negative matrix covers Parent disablement, role/task narrowing, same-name collision, proxy discovery, script/resource indirect calls, headless approval, allow-once/session grants and revocation.
- [x] 3.5 Add machine-readable lazy MCP status and doctor checks.
  - Acceptance: inspection distinguishes server states without connecting unused lazy servers.
  - Verify: status/doctor tests assert zero transport start during read-only inspection.

## 4. Configure the accepted MCP servers and MemPalace mapping

- [x] 4.1 Generate a redacted preview for the shared MCP configuration containing pinned MemPalace, Context7, Playwright and `colbymchenry/codegraph` entries.
  - Acceptance: same-name conflicts block, values containing credentials are not printed, and no file is written during preview.
  - Verify: fixture tests cover clean merge, conflict, malformed input and redaction.
- [x] 4.2 Under separate per-tool approvals, install each exact MCP server/tool package without writing user configuration.
  - Acceptance: only the individually approved package/tool target is installed; failures do not trigger another installer or floating version.
  - Verify: per-tool version/command/license evidence in a disposable environment before current-user installation.
- [x] 4.3 Under a distinct shared-config write approval, write the accepted MCP configuration with backup and atomic replacement.
  - Acceptance: refusal or failure preserves the original destination; OpenCode host config is untouched.
  - Verify: disposable-HOME config-write evidence and resulting redacted inventory.
- [x] 4.4 Configure MemPalace mapping inputs for `/home/rosetears/code/ai/.mempalace`, including trusted-project normalization, collision handling, worktree/rename behavior, shared promotion authority and stable Agent diary identity.
  - Acceptance: no AILI SQLite or second Palace is created; untrusted/ambiguous identity and unavailable memory fail closed.
  - Verify: pure mapping tests cover normalization, collisions, trust, rename/worktree and shared/diary scope.
- [x] 4.5 Under separate approval, initialize only the exact Palace target and perform a read-only health/search probe.
  - Acceptance: initialization and read are separately recorded; no write/mining/import occurs implicitly.
  - Verify: version/status and bounded read evidence without secret/raw-memory output.
- [x] 4.6 Under a separate memory-write approval, perform one bounded test write/read-back; keep delete/import/mine unexecuted unless independently approved.
  - Acceptance: the exact Wing/diary mapping is observable and no fallback store is created.
  - Verify: redacted receipt/lookup evidence.
- [x] 4.7 Under separate approvals, install Playwright browser assets, download any required MemPalace embedding model, and initialize/index CodeGraph only for each explicitly selected project.
  - Acceptance: each operation can be independently denied; only approved targets are mutated.
  - Verify: per-operation command/result evidence.
- [x] 4.8 Under separate live-probe approvals, verify Context7 retrieval, Playwright browser action and CodeGraph query.
  - Acceptance: each unavailable prerequisite remains truthful and does not falsify global MCP success.
  - Verify: one bounded server-specific smoke record per approved server.
- [x] 4.9 Under a separate runtime probe approval, call one harmless MCP tool from Parent and from at least two Workers.
  - Acceptance: all read the same config, own independent adapters, enforce a denied operation, and disposing one Worker does not affect Parent/other Worker.
  - Verify: session identity/status/disposal evidence with no credential output.

## 5. Make task and hub transparent

- [x] 5.1 Add atomic selector/model/thinking preflight before durable allocation for flat and batch tasks.
  - Acceptance: all failure classes allocate zero identities; omitted/explicit bare/canonical model behavior matches the spec.
  - Verify: task/model tests cover every precedence layer, ambiguity, authentication, thinking mismatch and batch zero allocation.
- [x] 5.2 Add stable redacted display metadata through task settlement, async delivery, hub and audit.
  - Acceptance: effective identity agrees across all surfaces and one-shot model overrides do not stick to later turns.
  - Verify: sync/async/delivery/hub/audit consistency tests.
- [x] 5.3 Add shared `renderCall`/`renderResult` helpers to top-level and nested task/hub definitions.
  - Acceptance: compact task shows name, selector, effective model, status and bounded assignment summary; hub shows action and target.
  - Verify: renderer fixtures independently cover preparing, running, completed, partial, failed, blocked, cancelled and malformed states plus batch, width and redaction; task/hub/delivery/audit mappings agree.

## 6. Restore Pi-native UI and retain a minimal footer

- [x] 6.1 Inventory fixed-editor and WSL image-paste dependencies before removing Zentui/UI owners.
  - Acceptance: each independent behavior is proven separable and retained, or the affected work stops as a material discovery before deletion.
  - Verify: call-path/test ownership map with explicit retained/removed disposition.
- [x] 6.2 Remove Matrix, custom header/theme resources and only the Zentui theme/editor/message/thinking ownership proven in-scope by 6.1, plus associated commands/config/tests.
  - Acceptance: package never hides/replaces Pi working/thinking or registers Rose theme/chrome; retained fixed-editor/WSL behavior still meets its owning contract; legacy user config is untouched.
  - Verify: extension-load/package tests and source inspection prove no `setWorkingVisible(false)`, custom indicator or prototype patch remains, plus focused retained-behavior tests.
- [x] 6.3 Implement the lightweight footer using public Pi APIs.
  - Acceptance: model and material Codex quota state are prioritized; reset/update age and minute clock appear when available; optional fields degrade deterministically.
  - Verify: pure layout tests cover wide/narrow widths, unavailable/stale status and byte-width limits.
- [x] 6.4 Bound and dispose footer refresh.
  - Acceptance: time refresh is no more than once per minute; status redraw is change-driven; replacement/shutdown leaves no timer/listener.
  - Verify: fake-timer lifecycle tests.
- [x] 6.5 Under separate approval, run a real TUI probe.
  - Acceptance: only Pi-native working/thinking animate during Parent, Worker and tool execution; footer remains stable.
  - Verify: manual terminal evidence states environment and limitations without claiming subjective performance from unit tests.

## 7. Replace AILI Compact with Codex Remote V2 and provider-routed billion-context

- [x] 7.1 Preserve the complete tracked `billion-context-pi@0.1.34` tree and consume one exact verified `@narumitw/pi-codex-compact` package/source identity; keep algal documentation-only.
  - Acceptance: every billion-context tracked path/hash is represented; the Codex package inventory/license/tests/provenance are exact; package inventory contains no algal runtime file or hook.
  - Verify: recursive billion-context comparison, exact Codex package/source inventory, provenance and package negative assertions.
- [x] 7.2 Implement one turn-frozen provider/API/model route token and gate every context/nudge/payload/compaction/replay hook before side effects.
  - Acceptance: only exactly compatible `openai-codex` selects Codex Remote V2; direct `openai`, Azure, custom and all other providers select ACP; missing/contradictory identity fails with zero mutation; registration order and concurrent turns do not change ownership; ACP delegate tools remain available.
  - Verify: complete handler inventory and provider/API/model/order/concurrency/router-failure/model-switch/resume/tree/fork matrix with selected-owner once and other-owner zero mutation/cancellation.
- [x] 7.3 Integrate `pi-codex-compact` on Pi 0.84.1 without a second replay or retry owner.
  - Acceptance: automatic/manual/threshold/overflow compaction, bounded opaque checkpoint persistence, exact marker/fingerprint/model replay, repeated compaction, cancellation and truthful Pi fallback work; ordinary Codex transport remains Pi-owned; extension retry is zero or proven single-owner.
  - Verify: typecheck plus protocol/checkpoint/lifecycle/settings/provider seam tests, including malformed/oversized/duplicate marker and retry-disabled negatives.
- [x] 7.4 Remove repository AILI Compact production source, hooks, commands, configs, docs, scripts, tests, registry/doctor/provenance claims and obsolete package exclusions.
  - Acceptance: no `aili_*` compact tool or `/aili-compact` remains and historical OpenSpec artifacts are preserved.
  - Verify: source/package negative assertions and current package-runtime tests.
- [x] 7.5 Preserve the ACP non-formal delegation boundary and verify Pi 0.84.1 permission interception/cancellation.
  - Acceptance: formal packages never route through ACP; upstream cwd/nesting/wait/cancel/result-file behavior remains; denied operations remain denied or BUILD stops as material discovery.
  - Verify: lifecycle/negative fixtures plus bounded disposable local process/file harness.
- [x] 7.6 Under separate provider approvals, verify Codex Remote V2 compaction/replay plus representative direct-OpenAI and non-OpenAI ACP sessions; compare 32K versus upstream-default retained history only under a separately approved bounded long-session probe.
  - Acceptance: each provider uses only its selected runtime; model switching prevents cross-provider checkpoint contamination; no retained-history default changes without actual latency/token/cache/continuity evidence.
  - Verify: bounded provider-backed evidence with actual model identities and usage fields, no secret output.

## 8. Absorb explainable pi-retry

- [x] 8.1 Vendor the complete published `@narumitw/pi-retry@0.31.0` source, README and MIT license and record its later deprecated upstream state.
  - Acceptance: frozen classifier/watchdog/status/policy behavior is complete and attribution is intact.
  - Verify: published tarball/source inventory comparison and provenance entry.
- [x] 8.2 Port pi-retry to Pi 0.84.1 and add bounded structured error diagnostics without creating a second retry loop.
  - Acceptance: Pi owns attempts/budget/backoff; cause/category/retry decision/attempt-delay when available/terminal state remain visible and sanitized; Codex Remote V2 transport and provider stream share one attempt-scoped watchdog/abort provenance without extension-owned duplicate retry.
  - Verify: known/unmatched errors, duplicate tag, disabled/exhausted retry, watchdog stall, user cancel, Codex remote abort, late old-attempt event and cleanup fixtures.
- [x] 8.3 Integrate receiving/retrying/error status into the lightweight footer/expanded diagnostics without hiding native working UI.
  - Acceptance: transient status clears; terminal errors preserve cause; renderer failure does not change retry semantics.
  - Verify: fake-timer/status/renderer/redaction tests.

## 9. Align official Pi 0.84.1

- [x] 9.1 Update official Pi core/AI/coding-agent/TUI declarations, docs, compatibility specs, lock/provenance and tests to exact `0.84.1`.
  - Acceptance: no current production declaration remains at `0.82.1`; all embedded integrations typecheck and load against 0.84.1.
  - Verify: full scoped package/lock/generated scan, `npm ls` duplicate-version check, runtime imported package identity, typecheck and extension-load/API seam tests for all four `@earendil-works` packages.

## 10. Change license and regenerate release evidence

- [x] 10.1 Produce a per-path ownership/relicense disposition for every retained first-party, copied and adapted source before replacing the root license.
  - Acceptance: each path is MIT-authorized, separately licensed, replaced/removed, or blocking; no Unverified path is treated as cleared by notices/SBOM.
  - Verify: repository-local disposition artifact plus focused source/header/license inspection.
- [x] 10.2 Under exact owner authorization and only after 10.1 has no blocker, replace the project primary AGPL metadata/license with MIT.
  - Acceptance: package, lock root, root LICENSE and README agree on MIT; third-party license identities remain intact.
  - Verify: license-disposition validation.
- [x] 10.3 Update provenance input, license texts, notices and SPDX SBOM for all added/removed sources and dependencies.
  - Acceptance: disposition, immutable identity, local boundary and verification are complete and generated artifacts are byte-current.
  - Verify: `npm run validate:provenance` and focused provenance tests.
- [x] 10.4 Update doctor, capability registry, README, bootstrap/upgrade guidance and package validation for the new ownership boundaries.
  - Acceptance: no stale SQLite, AILI Compact, Matrix/theme, duplicate Workflow or AGPL production claim remains.
  - Verify: focused doctor/generated/package tests.

## 11. Integration and package verification

- [x] 11.1 Run the smallest focused unit/integration tests for each changed boundary, repairing only task-scoped failures.
  - Acceptance: bundle, MCP, memory mapping, task/hub, UI/footer, context owner and license/provenance claims each have fresh evidence.
  - Verify: commands and results are recorded in `progress.txt` during BUILD.
- [x] 11.2 Run typecheck and package validation after focused checks pass; under a distinct package-creation approval, create a real candidate tarball, record its hash, extract its inventory and load/install that exact archive in a disposable HOME.
  - Acceptance: the integration compiles; the actual archive includes required bundled runtime/license files, excludes retired files and loads from the packed artifact. Dry-run output alone is insufficient.
  - Verify: `npm run typecheck`, `npm run validate:package`, `npm run validate:generated`, `npm pack --dry-run --json`, then separately approved `npm pack --json`, archive hash/list/extract and exact-tarball clean load.
- [x] 11.3 Under separate baseline-install, candidate-upgrade and rollback permissions, verify Linux clean install and upgrade from an exact published baseline in disposable HOME fixtures.
  - Acceptance: baseline version/integrity is recorded; baseline→candidate tarball and rollback paths load the expected single runtime owner, preserve declined/legacy config, retain fixed-editor/WSL image-paste where required and report external prerequisites truthfully.
  - Verify: before/after/rollback inventories and hashes plus focused bootstrap/local-package E2E evidence.

## 12. Completion boundary

- [x] 12.1 Inspect the task-scoped diff, accepted requirement links, generated evidence and remaining external/runtime limits.
  - Acceptance: every accepted task is Done, explicitly Blocked, or source-backed N/A; no unrelated untracked paths were touched.
  - Verify: changed-file inspection plus the smallest fresh checks supporting the exact completion claim.
- [x] 12.2 Stop BUILD at `IMPLEMENTED_TARGETED_VERIFIED` without commit, push, publish or release.
  - Acceptance: remaining operation approvals and unverified live behavior are stated explicitly.
  - Verify: final progress entry and user-facing summary name actual checks only.
