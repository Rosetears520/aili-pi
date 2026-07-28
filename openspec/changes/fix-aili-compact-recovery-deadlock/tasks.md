# Tasks: fix-aili-compact-recovery-deadlock

**Delivery:** PR1 / independently releasable `v0.1.14` P0 only.
**Prerequisite:** explicit acceptance of all DEFINE artifacts and separate BUILD authorization.
**Successor:** `redesign-aili-compact-lifecycle` MUST preserve REC-001..REC-008 and the P0 wire contracts.
**Rule:** acceptance boxes remain unchecked until their named evidence is freshly produced.

## 1. Freeze and Validate DEFINE

- [ ] 1.1 Record explicit human acceptance of proposal, context, design, both deltas, tasks, test plan, migration, and release gates.
- [x] 1.2 Strict-validate the new capability delta alone.
- [x] 1.3 Strict-validate the reversible delta against the exact base requirement headings.
- [x] 1.4 Sequentially materialize/validate base plus this change's deltas in release order; do not treat two independent delta passes as merged-spec proof.
- [ ] 1.5 Reconfirm Pi 0.82.1 public compact/hook/CompactionEntry/settings behavior before BUILD and stop on contract drift.
- [x] 1.6 Establish task-owned disposable HOME and copied-session fixtures; never begin with the user's live Session.

## 2. Implement Standalone Repair Reader and Reducer

- [x] 2.1 Add exact `aili.compact.repair.v1` reader/schema with 1..16 ordered evidence objects and reject unknown/missing fields.
- [x] 2.2 Implement canonical branch/root-epoch/evidence/transaction identities and stable evidence order.
- [x] 2.3 Implement eligibility disposition partition, then deterministic contiguous batching of at most 16.
- [x] 2.4 Revalidate whole batches against fresh replay state; reduce/project in temporary state and commit all-or-none.
- [x] 2.5 Make identical replay idempotent, reject ID/content mismatch, and atomically reject stale concurrent/overlapping batches without shrinking.
- [x] 2.6 Preserve explicit user, nested, old-epoch, ambiguous, digest-mismatch, and active-parent states.
- [x] 2.7 Add branch activation guard for `session_start`, `session_tree`, and fork/leaf activation before projection/catalog publication.
- [x] 2.8 Verify reducer, projector, reload, tree, fork, byte-prefix, branch movement during activation, and exact fail-open cases.

## 3. Remove Age Deactivation

- [x] 3.1 Replace inverse GC tests before implementation so below/equal/above legacy age never deactivates a top-level semantic block or exposes source.
- [x] 3.2 Remove age-only deactivation while preserving promotion/survival/telemetry and explicit nested/user/epoch transitions.
- [x] 3.3 Keep `maxBlockAge` accepted as deprecated/no-op and add bounded config/doctor diagnostics.

## 4. Implement Exact Compaction Hook

- [x] 4.1 Add deterministic attempt identity over the complete design tuple and a session-memory immutable terminal cache.
- [x] 4.2 Wire pure `planMajorGc()` to validate unique cut, whole atoms, complete unique current-epoch coverage, digests, lineage, ordering, and bounds.
- [x] 4.3 Enforce that the handler returns only one validated compaction envelope or exact undefined.
- [x] 4.4 Remove every AILI cancellation/partial/error-envelope branch and update inverse tests in the same change.
- [x] 4.5 Exhaust manual/threshold/overflow × off/on × deterministic off/on × eligible/ineligible/throw × policy.
- [x] 4.6 Verify attempt cache identity, cloning, invalidation, no exception caching, and exclusion of UI-only state.

## 5. Implement Permit and Coordinator

- [x] 5.1 Implement separate `ManualCompactPermit` and one-use matching `NativeOnlyCompactPermit`; prove they cannot satisfy each other.
- [x] 5.2 Implement exact coordinator states, request serial, source/policy, hook ordinals, external adoption, and re-entry rejection.
- [x] 5.3 Implement `/aili-compact rescue`, `rescue native`, and read-only `rescue status` with one `ctx.compact()` and zero `sendUserMessage()` per accepted rescue.
- [x] 5.4 Handle invocation throw, synchronous/asynchronous callbacks, event/callback races, awaiting epoch, stale callbacks, and terminalization once.
- [x] 5.5 Clear request/permit/cache/pressure/manual-trigger state on error, settled-without-epoch, start/replacement/shutdown, tree/fork/leaf change, and epoch transition.
- [x] 5.6 Adopt threshold/overflow/manual host events before planning so idle auto-rescue cannot duplicate them.

## 6. Pressure and Epoch Recovery

- [x] 6.1 Implement observed/fallback usage, conservative budget components, exact boundaries, five stages, and estimate-source diagnostics.
- [x] 6.2 Enforce one semantic attempt and one checkpoint invocation per session/branch/epoch/serial cycle.
- [x] 6.3 Invoke programmatic compact only from accepted command or idle `agent_settled`, never an active provider/tool event.
- [x] 6.4 On custom/native CompactionEntry, use exact entry ID as epoch, reload state/catalog, archive old blocks query-only, and retain exact source search.
- [x] 6.5 Verify failed semantic, failed checkpoint, repeated settled events, token-drop reset, epoch reset, and continued post-checkpoint work.

## 7. Host Settings, Commands, and Doctor

- [x] 7.1 Replace settings tests for absent, true, unmarked false, malformed, unrelated, and idempotent refresh before helper changes.
- [x] 7.2 Stop bootstrap/settings merge from adding or refreshing false while preserving unrelated settings and failure atomicity.
- [x] 7.3 Preserve unmarked false and report `disabled-config`/`unknown`; document exact user-owned enable action.
- [x] 7.4 Verify host matrix: false suppresses automatic threshold/overflow at host, manual `/compact` and public manual compact still work, and AILI-off returns undefined.
- [x] 7.5 Implement exact compress/rescue/native/status/Pi-compact matrix, busy/invalid behavior, and no cross-permit authorization.
- [x] 7.6 Implement every doctor field with exact owner/value domain, bounded errors/counts, and Unverified behavior.
- [x] 7.7 Exclude width/animation/rendering state from provider cache identity.

## 8. Automated and Production-Entry Verification

- [x] 8.1 Run focused schema/reducer/projector/repair/GC/planner/permit/coordinator/pressure/config/doctor unit tests.
- [x] 8.2 Run deterministic 17-item batching, all-or-none rejection, duplicate identity, ID mismatch, and interleaved concurrency tests.
- [x] 8.3 Run registered Extension tests through production `AgentSession` entry for overflow/retry, custom persistence, undefined native fallthrough, disabled behavior, and resumed work.
- [x] 8.4 Assert each accepted rescue calls `ctx.compact()` once and `sendUserMessage()` zero times.
- [x] 8.5 Run disposable-HOME bootstrap and copied-session migration matrices without touching real HOME.
- [x] 8.6 Run focused checks, typecheck/package/generated/provenance validators, then full test suite only after authorization and in release-gate order.
- [x] 8.7 Store sanitized durable evidence only in approved repository paths.

## 9. Migration and Documentation

- [x] 9.1 Implement readers before repair writer and checkpoint behavior; preserve all v1/v2 readers.
- [x] 9.2 Rehearse clean, repairable, mixed, explicit-user, prior-epoch, interrupted rescue, custom/native epoch, reload/tree/fork, and rollback states.
- [x] 9.3 Update docs to replace exclusive ownership/disabled-native claims with exact cooperative semantics and limitations.
- [x] 9.4 Document command matrix, ambiguous false, manual-vs-automatic behavior, repair schema compatibility, and rollback rescue limitation.
- [x] 9.5 Confirm no raw sidecar, non-public host call, dependency drift, or native-quality claim enters P0.

## 10. Live and Release Gates

- [ ] 10.1 Obtain separate authorization and run LIVE-P0-1..LIVE-P0-7 on official Pi 0.82.1; static/fake evidence is not a substitute.
- [ ] 10.2 Require controlled real overflow/retry through production entry; if not reproducible, leave release blocked.
- [ ] 10.3 Inspect candidate/package and release claims only under separate release-readiness authorization.
- [ ] 10.4 Update version/lock/provenance only with separate exact approval.
- [x] 10.5 Stop before commit, push, tag, publish, or release unless each exact operation is separately approved.

## 11. P0 Acceptance

- [x] 11.1 Main is independently recoverable: no installed false default, no AILI cancel path, manual rescue works without a normal turn, age cannot expose source, and eligible legacy state repairs append-only.
- [ ] 11.2 Sequential merged-spec, automated, production-entry, copied-session, and all live gates pass with fresh evidence.
- [x] 11.3 Remaining unsupported facts are explicitly `Unverified`; no acceptance checkbox is inferred from another gate.
