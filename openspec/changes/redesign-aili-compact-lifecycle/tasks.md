# Tasks: redesign-aili-compact-lifecycle

**Delivery:** mandatory PR2–PR5 ending at `v0.2.0`.  
**Prerequisite:** P0 PR1 complete/evidenced and this test plan explicitly accepted.  
**Invariant:** every task/PR preserves REC-001 through REC-008 and leaves main usable.

## 1. DEFINE and P0 Entry Gate

- [ ] 1.1 Record explicit human acceptance of proposal, design, all five capability deltas, migration strategy, test matrix, deterministic budgets, live evidence, and release gates.
- [x] 1.2 Materialize and strict-validate sequentially: accepted base, then base+`fix-aili-compact-recovery-deadlock`, then base+fix+this redesign; preserve each intermediate validation report.
- [x] 1.3 Run the inherited P0 focused gate on the approved BUILD baseline; stop if manual/native fallback, no-cancel, age/repair, append-only, or storm invariants regress.
- [ ] 1.4 Reconfirm official Pi `0.82.1` context/custom-message/cache usage contracts and record any drift before production edits.
- [x] 1.5 Prepare task-owned fixed-seed fixtures, disposable HOME, copied-session rehearsal, and sanitized evidence paths.

## 2. PR2 — Complete Safe Planning

- [x] 2.1 Add a pure protocol-atom builder with multi-call sibling/result grouping, incomplete/malformed/binary handling, and deterministic source order.
- [x] 2.2 Replace recent-user-count selection with default 8-atom plus 12K/10%-cap tail, newest-user and unfinished-turn hard protection; retain config migration diagnostics.
- [x] 2.3 Add exact safe-range planning, catalog/scope/source digests, exclusion counts, and strict mutation scope equality for range/message modes.
- [x] 2.4 Derive economics through production projector/provider serializers: complete recap/wrapper/reference/topic/mode/tier/count/summary/separator/prior/lineage/suffix/provider replacement upper and discovery/resent-source/model-output/tool-call/result/cache-invalidation/reserve one-time upper.
- [x] 2.5 Implement bounded 20-sample/5-min calibration with provider/model/version invalidation, exclusion reasons, clamps, 25% movement, and no unsafe narrowing.
- [x] 2.6 Add runtime-only post-selection extraction with closed `QualityInputV1`/`ManifestV1`/`ResultV1`, exact normalization, UTF-16 spans, exact durable agent/job/turn/message/history refs, no caller manifest, fail-closed errors, and independent hand-written golden manifests.
- [x] 2.7 Integrate quality failure with one-attempt pressure state and inherited deterministic/native checkpoint fallback.
- [x] 2.8 Replace dynamic system-prompt nudges with one transient bounded custom provider suffix added after complete projection/atom validation; prove no Session/ref/search persistence.
- [x] 2.9 Split stable-prefix, suffix, and full-provider cache identities; include suffix in benefit cost/full identity and retain provider-authoritative telemetry.
- [x] 2.10 Add `planning.enabled=true` and exact narrow disable semantics; four cache identities; PR2 bounded additive no-raw-text v2 `qualityEvidence`; config/doctor/UI/docs and PR3 mapping.
- [x] 2.11 Run the entire PR2 matrix plus inherited P0; record the usable-main gate before merge.

## 3. PR3 — Schema v3 and Tiered Lifecycle

- [x] 3.1 Add closed tagged v3 union with shared header and semantic-create/decompress/recompress/cooling/control arms, strict exclusive source, existing reasons, recursive ordered digest/count, and invalid mixed-payload fixtures; keep v1/v2 readers unchanged.
- [x] 3.2 Add v3 T1 writes with exact safe message source, leaf digest/count/bounds, summary digest, projection version, token and quality metadata.
- [x] 3.3 Add `mode:"blocks"` public schema/resolution for 2–16 current refs and deterministic source ordering.
- [x] 3.4 Implement T2/T3 promotion plus default T3→T3 restill (true/2/8000/1024/0.25/3000/8), 2–16 children, current active contiguous parentless selection, rationale and boundary tests.
- [x] 3.5 Replace literal summary inclusion with ID/rank/epoch/leaf digest/count/contiguity structural lineage and explicit cycle/single-active-parent validation.
- [x] 3.6 Commit parent and child state atomically; project maximal active nodes only and validate reload/fork/fault behavior.
- [x] 3.7 Add 1–16 roots and unique recursive root+digest closure <=256, one/raw decompression, explicit-user precedence, derived atomic state, and exact recompression.
- [x] 3.8 Extend deterministic checkpoint planning to maximal accepted T3/T2/T1 complete coverage and native fallback for every gap/stale/unevaluated path.
- [x] 3.9 Implement old-epoch query-only archived metadata/summary lookup and preserve exact branch source search while rejecting old refs for mutation.
- [x] 3.10 Keep v1/v2 maximal leaves that can never be v3 children; remove compatibility-child state; test explicit decompress then new exact T1 as the sole upgrade.
- [ ] 3.11 Gate v3 write cutover only after dual-reader/rollback/copied-session evidence passes; document old-binary rollback limitation.
- [x] 3.12 Run the entire PR3 matrix plus P0/PR2; record the usable-main gate before merge.

## 4. PR4 — BranchIndex, Alignment, Cooling, Performance

- [x] 4.1 Implement BranchIndex identity and cold build for entries, atoms, blocks/lineage, coverage, refs, fingerprints, token estimates, and canonical digests without source-body duplication.
- [x] 4.2 Implement atomic valid append updates and operation counters; reject parent/tip/transaction mismatch without partial state.
- [x] 4.3 Implement the exact production event/update table and ancestry-prefix proof; healthy context has zero full reducer/replay/hash/protocol/protection/catalog rebuilds and one bounded provider-message pass.
- [x] 4.4 Keep pure reducer/catalog/projector as oracle/fallback; compare canonical digests and surface bounded unhealthy/rebuild/fail-open telemetry.
- [x] 4.5 Implement duplicate-aware monotonic/protocol alignment with occurrence queues, anchors, feasible bounds, semantic-equivalence acceptance, and ambiguity exact fail-open.
- [x] 4.6 Move current ref/reverse/paging/archive lookup to scoped maps and reject stale refs without unscoped scans.
- [x] 4.7 Add immutable exact-name tool profiles, trusted tightening overrides, wildcard/unsafe rejection, and unknown keep-raw fallback.
- [x] 4.8 Require successful later-request observation and exact duplicate identity; permanently protect unique unresolved errors until explicit resolution; grace floor 5 is insufficient alone; hard-protect durable task/hub refs in stubs/quality/tier/checkpoint.
- [x] 4.9 Generate fixed-seed 10K-message/100K-reference corpora containing duplicates, protocol faults, forks, v1-v3 lineage, restore, and epochs.
- [x] 4.10 Assert exact per-event counter increments plus independent scan tripwire, guarded containers, sentinels/object-graph identity; audit a small corpus before fixed-seed 10K/100K through production extension entry.
- [x] 4.11 Cut indexed reads over only after canonical-equivalence/fault budgets pass; retain pure runtime fallback through v0.2.0.
- [x] 4.12 Run the entire PR4 matrix plus P0/PR2/PR3; record the usable-main gate before merge.

## 5. PR5 — Integration, Migration, Documentation, Release Evidence

- [x] 5.1 Integrate accepted defaults and remove compatibility switches only where migration tests prove safe; preserve all old readers and P0 fallback.
- [x] 5.2 Complete doctor/UI telemetry for pressure, quality, tier/schema, index/fallback, token calibration, cache identities, repair/checkpoint, and Unverified evidence.
- [x] 5.3 Update README/config/API/migration/rollback/rescue/quality/cache/performance docs and remove superseded exclusive/char/dynamic-system/summary-inclusion claims.
- [x] 5.4 Record independently authored ACP behavioral provenance at exactly `v1.14.3@00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb`; verify no unauthorized copied material.
- [x] 5.5 Run copied-session forward/rollback matrix in disposable HOME with byte-prefix, branch/epoch, explicit restoration, index fallback, and continued-work evidence.
- [x] 5.6 Run the full fake-provider flow including T1→T3, quality fault, maximal deterministic checkpoint, native gap fallback/retry, suffix non-persistence, and storm guard.
- [ ] 5.7 Under separate approval rerun P0 live gates and LIVE-V2 rows on all three project-named provider families, including long T1→T2→T3→T3 quality, production AgentSession overflow retry, and controlled third-party context handler before/after AILI; every row blocks release.
- [x] 5.8 Add fail-closed release evidence validation for schema/defaults, migration, deterministic budgets, fake/live versions/hashes, package/provenance, and sanitizer.
- [ ] 5.9 Update exact root/package identity to `0.2.0`, lockfile/provenance/SBOM/notices only under their separate approvals.
- [ ] 5.10 Run fresh focused tests, typecheck, bootstrap, integration, full `npm test`, package/generated/provenance/release validations, and package dry-run/candidate review.
- [ ] 5.11 Human-review summary quality/limitations, recovery, migration/rollback, cache, performance and public claims.
- [x] 5.12 Stop before commit, push, publish, tag, or release unless each exact operation is separately approved.

## 6. Final `v0.2.0` Acceptance

- [ ] 6.1 All P1–P3 tasks are complete; none is deferred as optional backlog.
- [ ] 6.2 PR2–PR5 usable-main records and P0 invariant results are present and fresh.
- [ ] 6.3 Every automated, migration, fake-provider, live-provider/Pi, performance, package/provenance, and documentation gate passes.
- [x] 6.4 Remaining unknown third-party/provider/platform claims are explicitly bounded as `Unverified`; no missing required row is waived implicitly.
- [ ] 6.5 Release candidate is ready for separate SHIP/release authorization, not automatically published.
