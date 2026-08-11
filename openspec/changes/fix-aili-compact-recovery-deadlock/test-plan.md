# Test Plan: fix-aili-compact-recovery-deadlock

**Target:** `@rosetears/aili-pi@0.1.14` P0 / PR1  
**Status:** DEFINE revised draft; explicit acceptance and BUILD authorization remain required  
**Host:** official Pi `0.82.1`  
**Rule:** no test uses the user's real HOME/Session; acceptance boxes remain unchecked.

## 1. Acceptance Invariants

| ID | Invariant | Primary evidence |
|---|---|---|
| P0-A | AILI hook returns only valid custom envelope or exact undefined; never cancel | exhaustive exact-return matrix |
| P0-B | Deterministic planning is complete/unique/atomic and tail-safe | planner positive/negative matrix |
| P0-C | Rescue calls `ctx.compact()` once and `sendUserMessage()` zero times | command + production-entry spy evidence |
| P0-D | Age alone never exposes raw source | repeated lifecycle/projector regression |
| P0-E | Repair v1 identity, partition, 1..16 order, atomic replay, and idempotence are exact | schema/reducer/concurrency tests |
| P0-F | Branch activation repairs before projection on start/tree/fork | registered lifecycle integration |
| P0-G | One-use native permit and coordinator cannot leak or storm | state/race/lifecycle matrix |
| P0-H | New bootstrap preserves native defaults and ambiguous false | disposable-HOME matrix |
| P0-I | Custom/native CompactionEntry creates epoch; old blocks are query-only and source-searchable | session reload/tree/fork integration |
| P0-J | AILI-off and host false/manual behaviors are truthful | host matrix + doctor assertions |
| P0-K | Production `AgentSession` overflow reaches registered Extension and preserves retry/fallthrough | production-entry harness |
| P0-L | Stable claims have sequential merged-spec, fake, copied-session, and live evidence | release manifest validator |

## 2. Exact Return and Planner Matrix

Cross product manual/threshold/overflow with:

- AILI disabled/enabled;
- deterministic false/true;
- no permit/matching native permit/nonmatching permit;
- complete/incomplete/duplicate/stub-only/digest-mismatch/stale-epoch/unsafe-lineage coverage;
- valid/duplicate/missing first-kept ID and whole/split protocol atom;
- prior summary present/absent and every section/total bound edge;
- planner success, throw before construction, throw after local construction, and validation failure;
- retry flag false/true.

Every cell asserts exact JavaScript undefined or a schema-valid immutable `{compaction: ...}`. Assert no cancellation, null, partial/error envelope, append, or planner cache write in disabled/error cases. Repeat identical attempts to prove deterministic ID/cache clone; vary each identity input one at a time to prove a miss. Verify display width/animation changes do not change identity.

## 3. Repair Schema, Reducer, and Projector Matrix

### Schema and identity

- evidence cardinality 0, 1, 16, 17;
- unknown/missing/wrong-type fields and nonnegative integer boundary;
- source IDs empty, duplicate, reordered, or protocol-incomplete;
- canonical branch/root epoch/CompactionEntry epoch/evidence/transaction digest goldens;
- discovery-order permutation produces the same ordered evidence and IDs;
- semantic v1/v2 envelope carrying repair evidence is rejected;
- duplicate ID identical content is no-op; same ID/different content rejects.

### Eligibility and deterministic batching

Cover exact GC, wrong/missing reason, digest one-byte mismatch, active parent/peer overlap, explicit decompress, restore-all, recompress, nested replacement, old epoch, lineage cycle/ambiguity, missing source, and valid candidate. Assert one disposition by precedence. Test 1, 16, 17, and 33 eligible candidates, eligible/ineligible interleaving, and stable contiguous batch identities.

### Atomic replay and concurrency

For every evidence position in a 16-item batch, invalidate that member and assert zero members apply. Interleave two planners with disjoint, overlapping, and parent/child candidates; append one before replaying the other; assert whole acceptance or whole rejection, never shrink/partial apply. Reload after interruption at before-append/after-append/before-publish boundaries. Verify projection unique coverage after every accepted batch.

### Lifecycle guard

On `session_start`, `session_tree`, and fork/leaf activation assert repair replay/planning/final replay completes before provider projection/catalog/doctor publication. Navigate during append and assert stale activation is abandoned. Test forks before/after repair, byte-prefix preservation, reducer+projector reload equivalence, and exact raw fail-open on guard failure.

## 4. Age, Epoch, and Search Matrix

- age below/equal/above legacy `maxBlockAge`, repeated passes, promotion and survival changes;
- explicit nested replacement and user controls remain distinct legal deactivation;
- deprecated/no-op config diagnostic appears without state change;
- deterministic and native CompactionEntry epoch transition;
- old blocks cannot project, repair, decompress, recompress, or satisfy planner coverage;
- exact current-branch source search survives reload, tree navigation, and fork;
- current catalog/references rebuild and stale one-shots disappear.

## 5. Permit, Coordinator, Pressure, and Command Matrix

### Native-only permit

Test exact match, wrong session/branch/epoch/reason/ordinal/request, threshold/overflow non-consumption, nonmatching manual invalidation, second hook after consumption, ordinary Pi `/compact`, invocation throw, callbacks, settle, every lifecycle invalidation, and semantic-permit/native-permit non-interchangeability.

### Coordinator

Exercise every legal transition among idle, scheduled, invoking, inFlight, awaitingEpoch, succeeded, failed, and invalidated. Cover synchronous callback during invocation, callback-before-event, event-before-callback, duplicate callback/event, stale callback, invocation throw, callback error, settled without epoch, external manual/threshold/overflow adoption, rescue re-entry, auto-rescue suppression, and session replacement/shutdown/tree/fork/epoch cleanup. Terminalize exactly once.

### Pressure

Test observed/fallback estimates, reserve and all semantic budget components, each boundary at minus one/equal/plus one, unknown conservative bounds, five stages, recommendation once, semantic attempt once, checkpoint once, repeated settled events, failed semantic/checkpoint, verified token-drop reset, epoch reset, and no compact invocation during active provider/tool events.

### Commands

| Command/surface | Expected agent sends | Expected AILI compact calls | Expected permission |
|---|---:|---:|---|
| model `aili_compact` | existing call only | 0 | semantic transaction rules |
| `/aili-compact compress` | 1 | 0 | one semantic permit |
| `/aili-compact rescue` | 0 | 1 | deterministic-first |
| `/aili-compact rescue native` | 0 | 1 | one native-only permit |
| `/aili-compact rescue status` | 0 | 0 | read-only |
| Pi `/compact` | host-defined | 0 | deterministic-first, no permit |

Repeat for idle/busy/invalid/off state. Invalid or busy requests append nothing and invoke nothing.

## 6. Host Settings and Doctor Matrix

Use disposable HOME fixtures for missing settings file, object without compaction, explicit true, unmarked false, unrelated keys, malformed JSON, non-object root, refresh, and repeated refresh. Assert no new/refresh false write, preservation of unrelated bytes/values under existing semantics, original malformed-file behavior, and no real HOME access.

Test host/effective cases:

- enabled true: automatic threshold/overflow may reach hook;
- enabled false: host automatic paths do not reach hook, while manual `/compact` and `ctx.compact()` do;
- AILI off: every delivered hook returns undefined and no AILI planning/mutation occurs;
- unobservable override: doctor says `Unverified-effective`.

Assert exact owner/domain for every doctor field, each repair disposition count, no source text, bounded last error, origin-not-observable does not increment native count, unknown provenance/order stays Unverified, and UI-only state is excluded from cache identity.

## 7. Fake Provider and Production-Entry Integration

### Fake provider

The registered harness simulates manual, threshold, and overflow preparations; custom persistence; undefined then native persistence; retry only after checkpoint; callback/event races; failure; pressure; continued turn; AILI-off; and ambiguous setting diagnostics. It proves AILI state and public return values, not provider quality or live host ordering.

### Production entry

A separate integration MUST instantiate/use the same registered Extension entry and Pi `AgentSession` flow used in production rather than call the planner directly. It SHALL drive controlled context overflow through `AgentSession`, observe `session_before_compact` reason/retry metadata, assert custom or exact undefined, observe CompactionEntry/retry or truthful failure, and complete a post-checkpoint turn. It SHALL assert `ctx.compact()` once and `sendUserMessage()` zero for rescue. Direct handler-only tests do not satisfy P0-K.

## 8. Migration and Rollback Matrix

| Input | Forward expectation | Rollback expectation |
|---|---|---|
| clean v0.1.13 branch | unchanged replay, cooperative hook | old entries readable |
| one/many eligible GC blocks | deterministic repair batches, no rewrite | unknown standalone entries ignored/rejected safely |
| mixed explicit/ineligible state | only prepartitioned eligible batches proposed | explicit state unchanged |
| current/prior epochs | current only repairable | source/history retained |
| repair on sibling fork | branch isolation | no leaked state |
| interrupted rescue | runtime state clears on reload | no fabricated success |
| custom/native checkpoint | real epoch, query-only ancestry | CompactionEntry/history retained; old cancellation limitation documented |
| absent/true/false setting | preserve user state; no false write | value remains user-owned |

Every copied-session rehearsal compares the complete old JSONL byte prefix, branch entry IDs, repair identities, projection hashes, reload result, and source search. It contains no raw bodies in durable reports.

## 9. Sequential OpenSpec Validation

Validation order is mandatory:

1. strict-validate `aili-compact-checkpoint-recovery` delta;
2. strict-validate `reversible-context-compression` delta and exact base headings;
3. materialize/apply the base reversible spec and this change's deltas in release order in a disposable location;
4. strict-validate the merged result and inspect that only the exclusive requirement is removed while the two exact requirements are modified;
5. record command/version/output digest as release evidence.

Independent delta success is not merged-spec PASS. A later successor must validate after this merged P0 result, not against the old base alone.

## 10. Separately Authorized Live Pi 0.82.1 Gates

| ID | Live run | Required evidence |
|---|---|---|
| LIVE-P0-1 | deterministic-first rescue with complete coverage | one compact call, zero normal sends, custom CompactionEntry, new epoch, next turn |
| LIVE-P0-2 | rescue native and deterministic-ineligible manual | native CompactionEntry, one-use permit, old JSONL retained, next turn |
| LIVE-P0-3 | effective automatic threshold | hook result, checkpoint completion, no cancel loop |
| LIVE-P0-4 | controlled real overflow | production entry, overflow hook, custom/native fallthrough, retry/continued work |
| LIVE-P0-5 | AILI off and automatic false/manual matrix | exact undefined plus truthful host behavior/status |
| LIVE-P0-6 | copied legacy Session with mixed repair state | selective deterministic batches, atomic replay, prefix/tree/fork preservation |
| LIVE-P0-7 | installed extension composition/order | no known bundled later cancellation; unknown third-party order documented |

Artifacts record sanitized scenario IDs, exact Pi/package/provider/model versions, event sequence, origin when observable, epoch IDs/digests, and pass/fail. They contain no private provider inputs, raw conversation bodies, or local secret material. If real overflow cannot be produced deterministically, release stays blocked; simulation is not relabeled live.

## 11. Verification Order and Release Gates

After acceptance and BUILD authorization: focused unit; bootstrap; integration; production-entry; typecheck/package/generated/provenance; full test suite; copied-session rehearsal; fake evidence; separately authorized live gates; candidate inspection under separate approval. Fresh output is required. See `release-gates.md` for exact stop conditions.

## 12. Unverified Until Named Evidence

- Real provider overflow timing/retry and post-checkpoint continuation.
- Live callback/TUI ordering and unknown third-party extension ordering.
- Effective overrides unavailable to the public Extension API.
- Native summary quality, exact live token accounting, provider cache behavior, and provider availability.

These remain `Unverified`; no neighboring gate promotes them.

## 13. Acceptance Record

- [ ] Human explicitly accepts this revised P0 test plan.
- [ ] Human explicitly accepts all other revised DEFINE artifacts.
- [ ] BUILD authorization is separately granted.
