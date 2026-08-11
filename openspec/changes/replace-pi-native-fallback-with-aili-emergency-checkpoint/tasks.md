# Tasks: replace-pi-native-fallback-with-aili-emergency-checkpoint

**State:** Revised final test plan and repository-local BUILD authorization were granted on 2026-08-02. The prior AILI-only acceptance/BUILD authorization is superseded.

**Dependencies:** validate `add-reversible-context-compression`, then `fix-aili-compact-recovery-deadlock`, then `redesign-aili-compact-lifecycle`, then this change against the exact merged contract.

## 1. DEFINE Reconciliation

- [x] 1.1 Obtain fresh acceptance of the revised final `test-plan.md` (accepted 2026-08-02).
- [x] 1.2 Obtain separate revised repository-local BUILD authorization after test-plan acceptance (granted 2026-08-02).
- [x] 1.3 Extend the repository-local sequence validator so its isolated scratch materialization includes this current change as the fourth stage (focused test passed 2026-08-02).
- [x] 1.4 Strict-validate and materialize the complete predecessor-plus-current contract (four-stage isolated validator test passed 2026-08-02).
- [ ] 1.5 Confirm every modified requirement uses the exact merged predecessor heading and preserves the P0 native recovery backend.
- [ ] 1.6 Reconfirm the Pi `0.82.1` public common subset used by the design; keep Pi `0.83.0` runtime compatibility `Unverified` unless separately run.

## 2. Public Hook Arbitration

- [x] 2.1 Align manual, threshold and overflow hooks to return only a complete custom envelope or exact `undefined`.
- [x] 2.2 Preserve exact `undefined` for disabled, deterministic-off, matching native permit, `activeBlocks=0`, coverage gap, stale/invalid input and caught exceptions.
- [x] 2.3 Prohibit cancel, partial envelope, private runtime access and extension-owned secondary provider summary calls.
- [x] 2.4 Verify complete current-epoch coverage uses the exact Pi preparation cut, protocol atoms, source order, quality and bounds.

## 3. Pressure and Coordinator

- [x] 3.1 Keep pressure estimation and the no-later-than-90% policy threshold as proactive diagnostics/scheduling, without claiming a synchronous provider-dispatch veto.
- [x] 3.2 Preserve programmatic `ctx.compact()` at accepted command or idle/settled boundaries.
- [x] 3.3 Enforce at most one semantic attempt and one checkpoint invocation per unchanged session/branch/epoch/pressure cycle; reset only on a new persisted epoch or verified usage at least one semantic-attempt budget below the force boundary.
- [x] 3.4 Revalidate tuple/cache identity across branch, epoch, preparation, policy and callback races.

## 4. Persistence, Retry and Status Truth

- [x] 4.1 Require a matching persisted `CompactionEntry`/new epoch before durable checkpoint success.
- [x] 4.2 Classify deterministic custom, Pi native and `Unverified` origin from observable event evidence only.
- [x] 4.3 Leave overflow retry/continuation to Pi; emit zero synthetic continuation messages.
- [x] 4.4 Report `rebuilding`/`unknown` until valid post-checkpoint usage arrives.
- [x] 4.5 Ensure provider-only suffix actions are executable in the advertised current state and stale identity is status-only/omitted.

## 5. Commands, Configuration and Lifecycle

- [x] 5.1 Preserve `/aili-compact rescue`, one-use `rescue native`, read-only `rescue status` and host-owned Pi `/compact` semantics.
- [x] 5.2 Preserve canonical read-only hybrid config and reject unsafe `nativeFallback=false`; do not migrate HOME or Pi settings.
- [x] 5.3 Preserve append-only Session history, no raw sidecar, query-only prior epochs and branch/session isolation.
- [x] 5.4 Leave branch/tree summary generation host-owned and rebuild AILI state from public lifecycle events.

## 6. Verification

- [x] 6.1 Run focused hook total-matrix and deterministic coverage tests.
- [x] 6.2 Run pressure-cycle, public compact call-count, callback/event race and suffix/status tests.
- [x] 6.2a Prove that a pressure drop smaller than one semantic-attempt budget does not reset the cycle.
- [x] 6.3 Run custom/native persisted-epoch, reload/tree/fork, append-only and config no-write tests.
- [x] 6.4 Run production `AgentSession` custom checkpoint and native overflow/retry tests.
- [ ] 6.5 Run typecheck, generated/provenance/release validators and full suite only after focused checks support the affected claim (typecheck/generated/provenance pass; release validator failed on pre-existing release evidence and full suite was not run).
- [ ] 6.6 Keep real provider, Pi `0.83.0` runtime, installed-package and interactive TUI claims separately authorized and `Unverified` until observed.
- [ ] 6.7 Under separate exact live-provider approval, prove the inherited stable-release real provider/context-length overflow and host retry row; without it stable release remains blocked.

## 7. Release Boundaries

- [ ] 7.1 Update user documentation only if BUILD changes public behavior beyond the existing cooperative contract.
- [ ] 7.2 Do not change dependencies, lockfile, version, settings, HOME, provider credentials or installation without exact separate approval.
- [ ] 7.3 Do not commit, push, tag, publish or release without exact separate approval.
