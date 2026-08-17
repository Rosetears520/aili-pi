## 1. Freeze source identities and authorize material operations

- [x] 1.1 Record exact source locks and complete inventories for `@agegr/pi-web@0.8.8` at `5a53c18ca9328400a3dfb8c48c1e4f343b3e4903` and the accepted `pi-analytics`, `pi-btw`, `pi-stamp`, and `pi-worktree` revisions, including URLs, archive identities, licenses, copyrights, and adaptation boundaries.
  - Acceptance: every imported file can be traced to one locked source; any mismatch stops BUILD rather than floating a version.
  - Verify: focused source-lock and provenance inventory checks.
- [x] 1.2 Obtain and record separate exact authorization before dependency or lockfile mutation; repository source import; AIcss source copying; browser installation; user-home writes; real-process, server, provider, browser, WSL2, performance, disposable-Git, tarball, install, or runtime probes; Git operations; publish; or release. Bind every authorized operation to its exact later task ID, target, command class, and evidence destination.
  - Acceptance: each operation is either exactly authorized or remains unexecuted; no answer to another gate is reused, and no broad authorization label silently covers another task.
  - Verify: Board/progress records the task ID, target, operation class, authorization state, and actual command only when run.
- [x] 1.3 Resolve the AIcss source path from redistribution evidence without reducing scope.
  - Acceptance: compatible public redistribution evidence permits only the evidenced source; otherwise no AIcss source is copied and all fourteen categories remain AILI-owned implementations.
  - Verify: source/provenance and package negative assertions find no unauthorized AIcss or private token.

## 2. Import and package the locked Pi Web baseline

- [x] 2.1 Under source-import authorization, import the exact locked Pi Web source, tests, MIT notice, and adaptation inventory into an AILI-owned Web source boundary.
  - Acceptance: Pi Web is the sole Web code/function base; Codex, `pi-gui`, and OpenCode contribute no source, runtime, protocol, or data model.
  - Verify: lock-to-import inventory and reference-only negative assertions.
- [x] 2.1a Immediately after all five authorized source imports, produce one reviewed included/excluded behavior and TUI-entry inventory for Pi Web, Analytics, Stamp, BTW, and Worktree before adapting dependent behavior.
  - Acceptance: every upstream public behavior and command is mapped to retained, safely modified by an accepted AILI boundary, or explicitly excluded; Analytics 7.5, Stamp 8.4, BTW 9.4, Worktree 10.4, and convergence 13.6 remain blocked until ROSE dispositions the inventory.
  - Verify: source-symbol/command inventory links each disposition to the owning spec and later task.
- [x] 2.2 Under dependency authorization, add the exact Web build/runtime dependencies required by the locked baseline while keeping official Pi packages aligned to `0.84.1` and Node.js `>=22.19.0`; retain the Pi-host peer wildcard only as the documented Package-host compatibility exception and fail runtime startup outside the exact supported compatibility manifest.
  - Acceptance: one compatible dependency graph exists with no runtime dependency on `@agegr/pi-web` itself or the four absorbed upstream packages; development/resolved Pi packages are exact `0.84.1`, and a mismatched host is rejected before mutation.
  - Verify: package/lock assertions, duplicate Pi-version check, runtime host mismatch fixture, and typecheck.
- [x] 2.3 Add deterministic Web build output and package inclusion rules without changing the sole Pi Extension entry.
  - Acceptance: the npm package contains only required runtime assets, and normal package/Pi load neither starts the server nor injects Web assets into model context.
  - Verify: package inventory and extension-load tests.
- [x] 2.4 Add the foreground `pi-web` executable using the compatible Pi Web launcher patterns and explicit build-artifact checks.
  - Acceptance: standalone startup is foreground-owned, signal-safe, and leaves no detached process.
  - Verify: CLI process-lifecycle tests with disposable ports and bounded child-process observations (`tests/integration/web-foreground-lifecycle.test.ts`).
- [x] 2.5 Add Pi `/web` as a non-detached child lifecycle command using the same packaged executable.
  - Acceptance: `/web` starts or reports the Pi-owned address, passes bootstrap identity outside argv, and terminates the child on Pi shutdown.
  - Verify: Pi command/lifecycle integration tests with no ordinary-startup listener (extension-load tests plus the managed-child lifecycle case in `tests/integration/web-foreground-lifecycle.test.ts`).
- [x] 2.6 Under D-17, make the npm artifact TUI-only: retain Web source in the repository but exclude `/web`, `pi-web`, Web build output, and all Web build/prepack hooks from the published package.
  - Superseded 2026-08-15: the user's Pi Web resumption authorization restores `bin/pi-web`, `dist/web/`, `extensions/web/`, `src/runtime/web/`, and the locked Web dependency graph in `package.json`; publication itself remains unauthorized so no TUI-only artifact claim persists.
  - Acceptance: installing or packing the package has no Web build/start requirement and exposes only the retained Pi TUI extension behavior.
  - Verify: package manifest and tarball-inventory assertions prove Web paths and commands are absent.
- [x] 2.7 Under D-17, remove foreground-Pi-Web-exclusive dependencies and regenerate `package-lock.json` with exactly `npm install --ignore-scripts`; repair only the existing `process-liveness.ts` type error so the TUI-only package typechecks. Under D-18, retain `pi-web-access@0.13.0` because it provides independent Pi TUI web-retrieval capability rather than the paused foreground Pi Web application.
  - Superseded 2026-08-15: the exact locked Web runtime and UI-build dependencies were restored and `package-lock.json` regenerated with `npm install --ignore-scripts`; `pi-web-access@0.13.0` remains retained.
  - Acceptance: the resolved graph contains no Next/React/Web-build dependency residue; `pi-web-access@0.13.0` and its Pi-owned skill remain available; global typecheck passes; and no foreground Web behavior is added or executed.
  - Verify: focused package/dependency assertions, lockfile inspection, extension-load tests, and `npm run typecheck`.

## 3. Build the Session Runtime Gateway contracts

- [x] 3.1 Implement schema-validated `RuntimeSnapshotV1`, `RuntimeEventV1`, and `MutationEnvelopeV1` contracts with opaque session handles and redacted public projections.
  - Acceptance: version, epoch, sequence, cursor, generation, request identity, and capability fields are explicit; private paths, credentials, raw MCP config, and private payloads are excluded.
  - Verify: valid/malformed/unknown-version/redaction unit fixtures.
- [ ] 3.2 Implement a per-session AILI Runtime Host, an authenticated owner-only local IPC transport for TUI projection/control, and a Browser BFF boundary over existing Pi, persistent-Agent, MCP, provider/context, and permission owners.
  - Acceptance: browser routes cannot directly mutate private Pi objects, Agent journals, MCP adapters, or filesystem state outside the gateway; TUI/Web peers require current opaque bootstrap identity and cannot widen observer authority.
  - Verify: dependency-boundary, IPC discovery/authentication/spoofing/cleanup, and route-admission integration tests.
- [ ] 3.3 Adapt Pi Web's read-only `SessionManager` JSONL browsing and lazy official `AgentSession` creation.
  - Acceptance: history browsing creates no `AgentSession`; only an admitted writer creates one official Pi mutation runtime and Pi JSONL stays authoritative.
  - Verify: session-list/read/resume tests with creation counters and real disposable JSONL fixtures.
- [ ] 3.4 Implement the ordered event hub, bounded replay window, snapshot-first SSE, cursor resume, gap reset, heartbeat, stale event/response rejection, and bounded slow-client backpressure.
  - Acceptance: reconnect neither loses silently nor reorders state, old runs cannot overwrite newer snapshots, and slow clients cannot create unbounded queues.
  - Verify: epoch/sequence/cursor/gap/reconnect/visibility/late-response/slow-client matrix.
- [x] 3.5 Implement the bounded general mutation disposition journal for every mutation family.
  - Acceptance: identical in-flight or completed duplicates execute once; request-ID/payload/identity collisions fail closed; retention and expiry are bounded; unknown non-idempotent outcomes after restart are reconciled from authoritative state rather than replayed.
  - Verify: in-flight duplicate, completed duplicate, collision, epoch/generation change, expiry, restart, and unknown-outcome matrix across representative Pi, Worktree, Analytics cleanup, BTW bring-to-main, and Agent mutations.

## 4. Enforce single-writer ownership

- [x] 4.1 Implement atomic versioned lease acquisition with opaque generation, owner surface, process/start identity, liveness endpoint, heartbeat, active-turn state, and no secret fields.
  - Acceptance: concurrent acquisition produces exactly one writer and durable lease state cannot be confused with Analytics or Agent sidecars.
  - Verify: multi-process acquisition and schema tests.
- [ ] 4.2 Gate every Pi and AILI mutation on authenticated origin identity, allowed root, permission/capability, epoch, lease generation, request ID, session leaf, and operation-specific revalidation; browser origins additionally require Host/Origin policy, while TUI uses the authenticated private runtime channel.
  - Acceptance: observers and stale clients perform zero mutation, TUI does not fabricate browser Origin data, and every denial returns a bounded reason.
  - Verify: origin-by-command positive/negative matrix including browser and TUI send, Steer, Follow-up, Compact, model, thinking, Branch, Fork, session, Worktree, Agent, and capability actions.
- [ ] 4.3 Implement explicit release, bounded disconnect grace, process liveness validation, active-turn retention, durable interruption, and atomic recovery without force stealing.
  - Acceptance: live or possibly live owners cannot be stolen from; proven dead active owners are marked interrupted before transfer.
  - Verify: clean release, reconnect, stale heartbeat, PID reuse/start fingerprint, owner death, active turn, and recovery-race tests.
- [ ] 4.4 Implement the accepted official-Pi asymmetric attachment behavior through Extension `session_start` admission and the private local projection channel.
  - Acceptance: TUI writer permits authenticated live read-only Web observation; Web writer makes the Extension gracefully shut down or block the conflicting stock-TUI runtime before user mutation; no Pi fork or replacement TUI is introduced.
  - Verify: real-process integration fixtures for both ownership directions, spoofed peers, corrupt/stale lease sidecars, crash/reconnect, and denial messaging.

## 5. Strengthen Web access and path security

- [x] 5.1 Preserve loopback as the default and reject non-loopback startup before listening unless password authentication, exact Host/Origin policy, and canonical allowed roots are all valid.
  - Acceptance: incomplete remote configuration opens no socket and explains the missing control.
  - Verify: startup bind-policy matrix on disposable ports.
- [ ] 5.2 Adapt Pi Web Host/Origin checks into authenticated same-site sessions with request-size, content-type, mutation, login, rotation, expiry, logout, restart, and password-change bounds.
  - Acceptance: cross-site, untrusted Host, unauthenticated, expired, malformed, and oversized requests are rejected before route effects.
  - Verify: HTTP/API and cookie/session lifecycle integration matrix.
- [ ] 5.3 Adapt lexical-plus-realpath allowed-root enforcement and require final revalidation before filesystem, Git, Worktree, skill, plugin, model, and media mutations.
  - Acceptance: traversal, symlink escape, stale target, and credential-path access fail closed.
  - Verify: path-boundary and TOCTOU fixtures.
- [ ] 5.4 Ensure passwords, bootstrap identities, credentials, cookies, and provider secrets never enter argv, logs, Analytics, sessions, package defaults, or browser persistent storage; use owner-only local artifacts and deterministic expiry/cleanup.
  - Acceptance: all failure and diagnostic surfaces remain actionable and redacted, consumed bootstrap identities cannot be replayed, and cleanup failure remains visible.
  - Verify: permission, replay, expiry, cleanup, and secret-marker scans across process args, logs, IPC artifacts, Web storage fixtures, snapshots, and packed files.

## 6. Adapt the Pi Web workbench

- [x] 6.1 Restore the applicable locked Pi Web session/project tree, resume, rename/export/safe-delete, Branch/Fork, model/provider/thinking, commands, skills/plugins, files, Git diff, Worktree navigation, media preview, i18n, responsive, and PWA surfaces against gateway contracts.
  - Acceptance: baseline behavior is retained where compatible without bypassing gateway ownership or security.
  - Verify: focused component/API integration tests and baseline browser flows under `tests/browser/`.
- [x] 6.2 Implement the AILI Timeline, independent sidebars, persistent runtime status surface, Queue Next versus Steer, and narrow-layout degradation.
  - Acceptance: model, thinking, context token/window, connection, writer, and active-run state remain accessible; queue and steer never share ambiguous behavior.
  - Verify: component tests, accessibility assertions, and wide/narrow browser scenarios.
- [x] 6.3 Project existing persistent-Agent and MCP status as truthful first-class Web resources.
  - Acceptance: inspection does not connect lazy MCP servers, infer state from transcript text, expose raw config/secrets, or widen Agent continuation authority.
  - Verify: Agent/MCP projection tests and browser empty/error/permission states.
- [x] 6.4 Implement bounded Web media upload, paste, drag/drop, preview, and official Pi image conversion without changing the Pi-native WSL clipboard path.
  - Acceptance: invalid, oversized, unsupported, or model-incompatible media fails visibly and produces no misleading attachment.
  - Verify: media unit/integration fixtures and browser interaction tests.

## 7. Absorb local Analytics

- [x] 7.1 Under source-import authorization, import the exact locked `pi-analytics` source inventory and map retained behavior into an AILI-owned Analytics service.
  - Acceptance: complete relevant behavior and MIT provenance are traceable without a runtime dependency on the upstream package.
  - Verify: source/adaptation inventory.
- [x] 7.2 Implement the versioned content-free event schema and reject forbidden content at ingestion.
  - Acceptance: only allowed timing/count/provider/model/usage/name/outcome/category metadata persists; prompts, replies, thinking, arguments/results, raw errors, credentials, cwd, paths, titles, labels, and raw session IDs do not.
  - Verify: exhaustive allow/deny schema fixtures and secret/content marker scans.
- [x] 7.3 Implement random opaque per-session scopes as Pi custom entries outside model context.
  - Acceptance: per-session aggregates work without deriving or storing raw Pi identity.
  - Verify: context-construction exclusion and cross-session attribution tests.
- [x] 7.4 Implement append-oriented segments, bounded-cardinality aggregation, multi-process serialization, atomic finalization, schema migration, corruption quarantine, store-size reporting, and coordinated explicit time-range/all cleanup.
  - Acceptance: normal operation does not auto-delete; concurrent append/cleanup cannot lose unrelated records; corrupt data is not counted as valid; cleanup affects only Analytics and reports partial/failure outcomes truthfully.
  - Verify: append/query/cardinality/concurrent-writer/cleanup/crash/corruption/migration fixtures.
- [x] 7.5 Add retained important TUI Analytics entry points; defer Runtime/API and Web dashboard parity until the foreground Pi Web package resumes last.
  - Acceptance: the Pi TUI uses the same content-free store and query semantics; deferred layers remain explicit and do not support a first-release completion claim.
  - Verify: focused TUI/store tests; deferred parity matrix and browser dashboard flows.
- [ ] 7.6 Profile long-running Analytics memory and disk growth and record measured acceptance bounds.
  - Acceptance: memory remains bounded without loading full history; disk growth matches content-free event volume and remains user-visible through size reporting.
  - Verify: repeatable long-running fixture with measurements under `artifacts/test-results/browser/` or the accepted performance artifact location.

## 8. Absorb Stamp timing

- [x] 8.1 Under source-import authorization, import the exact locked `pi-stamp` inventory and map it to an AILI-owned Stamp service.
  - Acceptance: retained behavior and MIT provenance are complete without an upstream runtime dependency.
  - Verify: source/adaptation inventory.
- [x] 8.2 Implement versioned out-of-context Stamp entries through the owning serialized Pi session mutation path for message, response, tool, usage/cost, cancellation, retry, compaction, failure, and interruption lifecycles.
  - Acceptance: entries remain outside model context, do not store tool payloads or raw errors, tolerate invalid/partial entries, and migrate schema without rewriting unrelated JSONL.
  - Verify: lifecycle/timing/context-exclusion/concurrent-write/crash/corruption/migration matrix.
- [x] 8.3 Preserve usage and cost provenance without fabricating unavailable values.
  - Acceptance: provider/Pi-reported values are distinguishable from unavailable or explicitly estimated values.
  - Verify: reported/missing/partial usage fixtures.
- [x] 8.4 Add retained important TUI Stamp entry points; defer Runtime/API and Web timing/usage surfaces until the foreground Pi Web package resumes last.
  - Acceptance: the Pi TUI displays bounded metadata semantics; deferred layers remain explicit and do not support a first-release completion claim.
  - Verify: focused TUI/timing tests; deferred parity matrix and browser timing views.

## 9. Absorb BTW side threads

- [x] 9.1 Under source-import authorization, import the exact locked `pi-btw` inventory and map it to an AILI-owned ephemeral BTW service.
  - Acceptance: retained behavior and MIT provenance are complete without an upstream runtime dependency.
  - Verify: source/adaptation inventory.
- [x] 9.2 Implement in-memory independent side threads with explicit model/thinking selection and isolated steering queues.
  - Acceptance: side-thread messages, queues, and lifecycle never implicitly alter the main conversation and are not falsely recovered after process loss.
  - Verify: focused mocked isolation, steering, cancellation, and process-loss tests.
- [x] 9.3 Implement explicit preview and writer-gated bring-to-main behavior.
  - Acceptance: preview makes no main-session change; confirmed insertion passes the main lease and permission gates.
  - Verify: focused draft/denial/idempotency matrix.
- [x] 9.4 Add retained important TUI BTW entry points; defer Runtime/API and Web thread controls until the foreground Pi Web package resumes last.
  - Acceptance: the Pi TUI implements the locked BTW inventory; deferred layers remain explicit and do not support a first-release completion claim.
  - Verify: focused mocked TUI/side-thread tests; deferred parity matrix and browser side-thread flows.

## 10. Absorb safe Worktree management

- [x] 10.1 Under source-import authorization, import the exact locked `pi-worktree` inventory and reconcile it with the Pi Web Worktree baseline behind one AILI-owned service.
  - Acceptance: retained status/add/switch/remove/prune/configure/session-transition behavior and MIT provenance are traceable without duplicate owners.
  - Verify: source/adaptation and ownership inventory.
- [ ] 10.2 Implement argv-safe Git execution, canonical roots, repository-scoped serialization, exact preflight, and immediate repository/target/session/Agent revalidation.
  - Acceptance: changed preconditions abort before mutation.
  - Verify: operation/state/TOCTOU integration matrix using disposable repositories.
- [ ] 10.3 Remove the baseline force-removal path and forbid main, dirty, unknown, active-session, and active-Agent target removal; do not delete branches.
  - Acceptance: neither TUI nor API nor Web offers a force retry or branch deletion.
  - Verify: route/UI/source negative assertions and Git side-effect counters.
- [ ] 10.4 Add retained important TUI Worktree entry points; defer Runtime/API and Web status/add/switch/remove/prune/configure parity until the foreground Pi Web package resumes last.
  - Acceptance: the Pi TUI uses explicit safe session transitions with no force removal or branch deletion; deferred layers remain explicit and do not support a first-release completion claim.
  - Verify: focused TUI/policy tests; deferred parity matrix and browser Worktree flows.

## 11. Implement AI process components

- [ ] 11.1 Implement the frozen fourteen-category inventory from `specs/ai-process-components/spec.md`, mapping each named component to observable gateway events and states.
  - Acceptance: every frozen category is reachable, has an accessible name/meaning, and does not require hidden chain-of-thought.
  - Verify: exact-name inventory and semantic rendering tests.
- [ ] 11.2 Implement or adapt only license-authorized components, with independently owned implementations as the fallback for every category.
  - Acceptance: package provenance exactly matches copied source; absent rights means zero copied AIcss source.
  - Verify: source/license/package scans.
- [ ] 11.3 Implement one default Orb, reduced-motion variants, offscreen/background pausing, and bounded animation scheduling.
  - Acceptance: state remains understandable without animation and hidden/offscreen work is reduced.
  - Verify: component accessibility/reduced-motion tests and browser visibility scenarios.
- [ ] 11.4 Prevent hidden reasoning, credentials, prompts, private tool payloads, and raw internal errors from entering expanded process components.
  - Acceptance: only schema-approved observable data renders.
  - Verify: adversarial projection and browser-state redaction fixtures.
- [ ] 11.5 Profile animation responsiveness and resource cost on the supported browser environment.
  - Acceptance: measured thresholds in the final test plan pass or remain an explicit release blocker.
  - Verify: browser performance artifact under `artifacts/test-results/browser/`.

## 12. Complete provenance, documentation, and operator guidance

- [ ] 12.1 Generalize provenance validation for the five locked imports, Web assets, AI component dispositions, notices, and SPDX SBOM.
  - Acceptance: missing, stale, mixed, or unattributed source blocks packaging.
  - Verify: provenance/generated validation and negative fixtures.
- [ ] 12.2 Update package metadata, third-party notices, licenses, README, doctor, and operator guidance for foreground startup, loopback/non-loopback security, storage/cleanup, asymmetric TUI attachment, and unsupported public-Internet use.
  - Acceptance: documentation contains no daemon, symmetric observer, copied-reference, or unsafe Worktree claim.
  - Verify: focused docs/package/doctor assertions.
- [ ] 12.3 Revise `AILI Web UI 详细设计与实施方案.md` to make Pi Web the sole code/function base and Codex/`pi-gui`/OpenCode reference-only, and to incorporate the accepted package, lease, security, Analytics, AIcss, media, source, testing, and release boundaries.
  - Acceptance: the human design no longer contradicts the formal proposal, design, specs, or test plan.
  - Verify: section-to-contract comparison and terminology scan.
- [ ] 12.4 Document migration and rollback as non-destructive for Pi JSONL, unknown custom entries, Analytics records, Agent sidecars, and unrelated user data.
  - Acceptance: no automatic user-home rewrite or cleanup is claimed.
  - Verify: disposable migration/rollback fixtures and documentation inspection.

## 13. Verify package, multi-process, and browser behavior

- [ ] 13.1 Implement focused unit and integration coverage for gateway contracts, lease/recovery, security, Analytics, Stamp, BTW, Worktree, projections, media, source locks, and package boundaries.
  - Acceptance: each normative failure path has deterministic evidence before broader checks.
  - Verify: focused Vitest commands from the accepted `test-plan.md`.
- [ ] 13.2 Under the exact browser-install/probe authorization from 1.2, implement browser and Playwright coverage under `tests/browser/`, with durable reports/traces/screenshots under `artifacts/test-results/browser/` only when required as evidence.
  - Acceptance: the supported browser matrix from the accepted test plan covers the baseline workbench, accessibility thresholds, responsive behavior, writer/read-only states, four absorbed capabilities, fourteen components, and error/empty/loading states.
  - Verify: accepted browser command, browser/version receipt, threshold results, and artifact inventory.
- [ ] 13.3 Under the exact real-process authorization from 1.2, verify the multi-process writer lease and private projection transport with real TUI/Web-compatible processes, reconnect grace, owner death, active-turn interruption, spoofing, corrupt sidecars, and both asymmetric attachment directions.
  - Acceptance: exactly one writer exists, only authenticated observer projection succeeds, and no unsupported stock-TUI observer claim is made.
  - Verify: disposable process/session/IPC evidence.
- [ ] 13.4 After final `test-plan.md` acceptance and explicit BUILD authorization, run typecheck, focused tests, strict OpenSpec validation, provenance/generated/package validation, then the full automated suite only after focused checks pass.
  - Acceptance: all selected gates pass on the exact candidate tree or remain explicit blockers.
  - Verify: fresh command receipts recorded in this change's `progress.txt`.
- [ ] 13.5 Under the exact package-creation, disposable-install, and server-probe approvals from 1.2, create an exact candidate tarball, record its hash/inventory, clean-install it in disposable HOME, and run bounded foreground Web startup including readiness failure, port collision, repeated `/web`, parent crash, stale-address recovery, and shutdown cleanup.
  - Acceptance: the installed package loads the sole Pi Extension and Web assets without repository-only source, hidden writes, absorbed upstream runtime dependencies, false readiness, or orphan processes.
  - Verify: exact tarball, hash, extracted inventory, startup/failure/recovery, process and shutdown evidence.
- [ ] 13.6 Complete the first-release convergence matrix for Analytics, BTW, Stamp, and Worktree across important TUI entry points, Runtime/API, Web UI, provenance, tests, and residual risk.
  - Acceptance: no capability ships with a missing required layer.
  - Verify: matrix links to fresh evidence and marks no missing row as pass.

## 14. Completion boundary

- [ ] 14.1 Under the exact repository-inspection authorization from 1.2 where required, inspect the task-scoped diff, changed source, generated artifacts, accepted requirement links, browser evidence, package inventory, and remaining `Unverified` measurements.
  - Acceptance: changes are scoped to the accepted contract and unrelated dirty/untracked paths remain untouched.
  - Verify: final diff/source/artifact inspection plus the smallest fresh checks supporting each completion claim.
- [ ] 14.2 Stop BUILD before commit, push, publish, release, installation into the user's real Pi home, or other external mutation unless each exact operation receives separate authorization.
  - Acceptance: implementation completion is reported separately from release readiness and operation authority.
  - Verify: final Board/progress disposition names actual evidence and remaining gates only.
- [ ] 14.3 Under the user's 2026-08-19 exact authorization, corrected to `0.2.3` before publication, publish the TUI-only `@rosetears/aili-pi@0.2.3` npm package after a fresh non-destructive readiness inspection and push its verified commit to `main` first.
  - Acceptance: `package.json`, `package-lock.json`, and generated provenance identify `0.2.3`; the packed artifact retains `pi-web-access` and BTW/Analytics/Stamp but excludes foreground Pi Web paths and commands; the exact npm publish receipt identifies `@rosetears/aili-pi@0.2.3`; the verified release commit is pushed to `main`; no tag or release-host mutation occurs.
  - Verify: focused package/provenance/extension-load tests, typecheck, deterministic tarball inventory, successful `git push origin HEAD:main`, `npm publish --access public --ignore-scripts`, and `npm view @rosetears/aili-pi@0.2.3 version`.
