# Test Plan: redesign-aili-compact-lifecycle

**Target:** `@rosetears/aili-pi@0.2.0`
**Scope:** all accepted P1–P3 behavior through mandatory PR2–PR5
**Prerequisite:** completed/evidenced `fix-aili-compact-recovery-deadlock` P0
**Status:** DEFINE draft; explicit acceptance required before BUILD
**Host baseline:** official Pi `0.82.1`

## 1. Cross-Release Acceptance Invariants

| ID | Required outcome |
|---|---|
| V2-A | REC-001 through REC-008 pass after every PR; no new layer can cancel Pi recovery |
| V2-B | Recent protection operates on complete protocol atoms, token cap, unfinished turn, and last user |
| V2-C | Status recommends exact safe ranges; mutations reject scope drift instead of silently filtering |
| V2-D | Token decisions use bounded provider/model economics and invalid calibration never broadens eligibility |
| V2-E | Catastrophic hard facts are rejected before append; warnings and overrides are truthful/redacted |
| V2-F | Dynamic guidance is provider-only/non-persisted and cache identities account for it exactly |
| V2-G | v1/v2 replay remains valid; v3 T1/T2/T3 lineage is atomic, contiguous, acyclic, and single-active-parent |
| V2-H | One/raw restoration and exact recompression preserve explicit user intent and append-only history |
| V2-I | Deterministic checkpoint uses complete maximal accepted layers; any gap falls through to Pi |
| V2-J | BranchIndex output equals pure oracle, invalidates correctly, and meets deterministic operation/record budgets |
| V2-K | Duplicate alignment fails open only when mappings can change semantic/protocol action |
| V2-L | Tool cooling changes result bodies only; unknown/mutation/protocol tools fail safe |
| V2-M | Migration, fake-provider, real Pi/provider, performance, docs, package/provenance, and release gates all pass before `0.2.0` |

## 2. PR2 Matrix — Safe Planning

| Surface | Required automated cases | Placement |
|---|---|---|
| Atom builder | ordinary messages; multi-call siblings; out-of-order/missing/duplicate results; branch/custom summaries; binary/malformed | new focused unit file under `tests/unit/` or extend protection tests |
| Tail policy | exact 8 atoms; below/equal/above 12K; 10% caps for small/large windows; crossing atom; last user outside tail; full unfinished turn; config tighten/unsafe weaken | `tests/unit/aili-compact-protection.test.ts` |
| Safe ranges | leading/interior/trailing protected split; exact refs/digest; stale catalog; range/message scope mismatch; no post-summary filtering | mutation/reference unit and integration tests |
| Token bounds | production projector/serializer derives complete replacement and one-time components; recap wrappers/refs/topic/mode/tier/count/summary/separators/prior/lineage/suffix/provider overhead; discovery/resent source/model output/tool call/result/cache invalidation/reserve; saturation/minima/ratio/horizons | estimator/benefit integration tests, never handwritten formula inputs alone |
| Calibration | provider/model/version isolation; 4/5/20/21 samples; min/max clamp; 25% movement; cache ambiguity; retry/overflow/image/outlier exclusion | estimator/cache unit tests |
| Quality extractor | exact source frozen in memory; caller manifest/extra fields reject; versioned types; UTF-16 surrogate/boundary cases; exact NFC+newline normalization; exact durable agent/job/turn/message/history refs; stale/cross-branch/fuzzy refs; fail-closed faults; independently hand-written golden manifests | new quality unit/golden tests |
| Quality commit | hard loss/no append; warning commit metadata; redacted error; expert override; force one-attempt; checkpoint fallback | mutation + registered integration tests |
| Provider suffix | omitted normal; stable order; complete-atom append; char/token bound; deterministic truncation; no raw source; no Session/ref/search presence | context/integration/session tests |
| Cache identity | static surface vs logical pre-suffix prefix vs suffix/full changes; logical is not provider implementation; display invariance; only real provider usage counts as hit | cache unit/integration tests |
| P0 regression | every reason matrix, rescue, pressure storm, age/repair, bootstrap recovery | inherited focused P0 command |

**PR2 usable-main gate:** v1/v2 writes and pure runtime remain usable; new planning may be disabled coherently, but Pi fallback cannot be disabled. Static system prompt no longer changes for dynamic nudge only after provider-suffix fake tests pass.

## 3. PR3 Matrix — Schema v3 and Tiered Lifecycle

| Surface | Required automated cases | Placement |
|---|---|---|
| Schema reader | complete tagged union/shared header; all five arms; strict exclusive message/block source; recursive ordered digest/no parent leaf array; derived atomic child state; existing reasons; malformed/mixed/interrupted; v1/v2 unchanged | reducer/contracts + versioned fixtures |
| T1 | exact message source; contiguous atom range; digest/count; quality/token metadata; protected intersection | mutation/reducer tests |
| T2/T3/restill | 2/16/17; promotion and T3→T3 defaults true/2/8000/1024/0.25/3000/8 at below/equal/above boundaries; churn rationale; mixed/stale/inactive/gap/parent | mutation/lineage/economics tests |
| DAG | parent rank; explicit DFS cycle; duplicate child; one active parent; historical inactive parents; canonical order | reducer and projection tests |
| Text independence | literal inclusion with invalid structure rejects; valid paraphrase without inclusion passes structural/quality gate | lineage/quality tests |
| Atomicity | append failure at every validation boundary; no partial parent/child state; reload equivalence | mutation + fault fixture |
| Projection | maximal parent only; parent one-decompressed exposes children; raw exposes leaf messages; exact fail-open on inconsistency | projector tests |
| Block tool | mode schema; current catalog; 2–16; caller order canonicalization; stale/duplicate/mixed/noncontiguous/protected refs | API/contract integration tests |
| Restore/recompress | 0/1/16/17 roots; duplicate/ancestor overlap; unique closure 256/257 from roots+recursive digest; drift/overlap/exact parent/reload/fork | mutation/session tests |
| Checkpoint | maximal T3/T2/T1 selection; parent/descendant exclusion; gap/overlap/stale quality/token; native fallthrough | compaction + integration tests |
| Archive | new epoch refs reset; old query-only; no mutation; metadata lookup; exact source search; byte-prefix preservation | reference/session integration tests |
| Migration | v1/v2 maximal leaf; every attempted v3-child use rejects; no compatibility-child field; explicit decompress then exact new T1; qualityEvidence→v3 mapping; rollback copy | fixtures + SessionManager integration |
| PR2/P0 regression | full focused gates | required before merge |

**PR3 usable-main gate:** dual readers remain; v3 writes are capability-gated until mixed/rollback tests pass; pure state path remains available; no migration rewrites Session history.

## 4. PR4 Matrix — BranchIndex, Alignment, Cooling, Performance

| Surface | Required automated cases | Placement |
|---|---|---|
| Cold index | linear/branched/compacted/malformed/protocol-heavy/v1-v3 corpora; canonical digest equals pure reducer/catalog | index unit/integration tests |
| Incremental/entry | exact production event/update table via production extension entry; exact per-event counter deltas; ancestry-prefix proof; healthy zero full reducer/replay/hash/protocol/protection/catalog rebuilds and <=1 provider-message pass | production integration/index tests |
| Branch lifecycle | cached/uncached switch; shared prefix; ancestry mismatch; fork/rebase; session replacement; LRU eviction | SessionManager/index integration |
| Epoch | custom/native CompactionEntry; old archive close; new current index; pending coordinator clear | index + checkpoint integration |
| Selective invalidation | model/provider, estimator, projection, quality, config version; only owned subindex invalidates | index unit tests |
| Fault fallback | corrupt ID/digest/lineage/ref/coverage; pure equality or exact fail-open; fallback counter truthful | fault fixtures |
| Alignment | unique anchors; equal duplicate runs; duplicates with equivalent/different action; missing/reordered protocol; compaction summary; other-extension transform; suffix exclusion | projector/alignment unit tests |
| Ref lookup | current/stale/wrong branch/epoch/catalog; reverse lookup; paging; archived bounded lookup; no global scan | reference/index tests |
| Tool registry | exact aliases; retrieval/execution/mutation/control/unknown; trusted tighten; wildcard/unsafe reject | cooling/config unit tests |
| Result-only projection | exact successful later-request observation identity; duplicate bodies/results; error grace 4/5/large insufficient alone; explicit same-identity resolution; task/hub refs hard in stubs/quality/tier/checkpoint; protocol preserved | cooling/projector/integration |
| Operation metrics | small hand-audited exact counters first; guarded containers, independent scan tripwire, sentinels/object-graph identity; then 10K/100K through production entry; no hidden rebuild/copy/scan | `tests/integration/aili-compact-performance.test.ts` |
| Structural memory | record-count formula, no source-body duplicate, LRU 4, fault cleanup | performance/index tests |
| P0/PR2/PR3 regression | full focused gates | required before merge |

### Deterministic Corpus and Gate

Use fixed seeds and generated data; do not commit raw credential/session data. Let `E`, `A`, `B`, `R`, and `D` have their design meanings. Pass requires:

1. cold 10K build: `entryVisits<=3E`, `atomMembershipVisits<=4A`, `blockVisits<=4B`, `hashOps<=12*(E+A+B)`;
2. valid append: no pre-tip entry visit, `entryVisits<=3D`, `fullRebuilds=0`;
3. 100K ref lookups/paging: `fullScans=0`, `hashLookups<=3R`;
4. retained records `<=6E+3A+8B+2*catalogRefs` and branch/epoch LRU <= 4;
5. canonical state/projection/ref order equals the pure oracle;
6. injected faults increment rebuild/fail-open counters and never pass as indexed success.

Command target: `npx vitest run tests/integration/aili-compact-performance.test.ts --reporter=verbose`. Durable report: `artifacts/test-results/aili-compact-lifecycle-performance.json`. The report records seed/counts/digests/counters, Node/Pi/platform, duration, and heap delta without source bodies. Wall-clock and heap are comparative only, not PASS thresholds.

**PR4 usable-main gate:** index runs beside pure oracle before cutover; unhealthy/missing index uses pure/fail-open; unknown tools remain raw; no ordinary Session requires a later PR to recover.

## 5. PR5 Matrix — Integration, Migration, Release

| Surface | Required evidence |
|---|---|
| Defaults/cutover | accepted safe-planning/v3/index/cooling defaults; compatibility flags removed only with migration proof |
| Doctor/UI | pressure/headroom, quality, schema/tier, index/fallback, calibration, cache identities, repair/checkpoint; bounded and truthful |
| Docs | architecture, config, tools, migration, rollback, rescue, quality limits, cache semantics, performance claim bounds, ACP provenance |
| Package | exact `0.2.0`, files/exports/runtime, no private/raw artifacts, dry-run manifest |
| Provenance | exact ACP reference commit only for adopted behavior, independently authored boundary, license/notices/SBOM |
| Fake provider | full semantic→quality→tier→checkpoint/retry flow, faults, continued post-checkpoint work |
| Live Pi/provider | named matrix in section 8 |
| Release validator | required evidence hashes/versions, schema/defaults, operation budgets, sanitizer; fail closed on missing/stale rows |
| Full regression | typecheck, focused categories, full `npm test`, package/generated/provenance/release validators |

**PR5 usable-main/release gate:** local main is usable before version/publish; stable release remains blocked until every automated and separately authorized live row passes. Merge/commit/push/publish/tag/release are distinct approvals.

## 6. Migration and Rollback Matrix

| Input | Forward expected | Required evidence |
|---|---|---|
| v1 only | pure replay unchanged; no rewrite; new T1 only on explicit operation | prefix hash/reload |
| v2 active blocks | project unchanged as maximal legacy leaves; never v3 children | canonical digest/negative child tests |
| v2 ambiguous lineage | stay maximal legacy; no fabricated parent; explicit decompress then new T1 is sole upgrade | negative/upgrade fixture |
| mixed v2/v3 | deterministic dual replay and projection | reload/fork |
| interrupted/malformed v3 | reject atomically, raw fail-open | fault fixture |
| one/raw decompressed | explicit state survives index/lifecycle/reload | round trip |
| current/prior epochs | current only mutates; prior query-only/searchable | SessionManager |
| P0 repaired GC | repair remains; may become validated legacy leaf | migration fixture |
| old/new cooling decisions | old replay; new profile/version only prospectively | policy replay |
| index missing/corrupt | rebuild/pure fallback; no persisted source loss | fault rehearsal |
| provider/model changes | only estimator window invalidates | unit/live telemetry |
| rollback to P0 binary | raw JSONL and CompactionEntries intact; v3 ignored/rejected; documented native checkpoint/no-extensions procedure | copied-session rehearsal |

No migration first touches the user's live Session. A sanitized copy in disposable HOME must prove byte-prefix preservation, branch isolation, and rollback opening before a release candidate is called ready.

## 7. Fake-Provider End-to-End Matrix

The registered Pi harness SHALL prove without credentials:

1. a pressure suffix recommends one exact safe range;
2. tool call supplies matching summary/scope/quality evidence and commits T1;
3. adjacent T1 blocks commit T2, adjacent T2 commit T3, with structural not textual lineage;
4. a hard-fact omission rejects before append with redacted output;
5. a stale catalog/index fault returns pure/fail-open and no partial mutation;
6. one-level/raw decompression and exact recompression replay after restart/fork;
7. checkpoint chooses maximal T3/T2/T1 full coverage;
8. an uncovered/unevaluated gap yields `undefined`; fake evidence may verify state only and MUST NOT substitute a synthetic CompactionEntry for the live production overflow gate;
9. production AgentSession overflow retry remains Unverified until a real context-length failure, checkpoint persistence, original-request retry, and continued work are observed;
10. provider/model change invalidates calibration but not replay/lineage;
11. suffix is absent from Session entries, refs, exact search, and migration output;
12. repeated high-pressure calls do not create semantic/checkpoint storms.

Fake evidence proves AILI state/return contracts only. It cannot prove actual provider tokenization, summary semantics, cache hits, HTTP behavior, Pi internal retry/order, or UI behavior.

## 8. Separately Authorized Real Pi 0.82.1 / Provider Matrix

Run sanitized disposable Sessions with recorded Pi/package/provider/model versions. All three project support families—OpenAI, Anthropic, and Google Gemini—SHALL run LIVE-V2-1 through LIVE-V2-10. The candidate SHALL also rerun every P0 live gate, a long T1→T2→T3→T3-restill quality flow, and a controlled third-party context handler in both registration orders (before and after AILI). Every row is blocking.

| ID | Real behavior | Pass evidence |
|---|---|---|
| LIVE-V2-1 | provider suffix role/order during user and complete tool-result turns | provider call succeeds, no protocol error, suffix absent from JSONL/search |
| LIVE-V2-2 | actual token usage/calibration | eligible/excluded samples match policy; bounds never narrow from invalid data |
| LIVE-V2-3 | semantic quality T1→T2→T3 | human-reviewed hard facts retained; warning/quality metadata truthful; no hidden evaluator call |
| LIVE-V2-4 | scope drift and quality rejection | no Session transaction appended; redacted retry guidance; one-attempt pressure guard |
| LIVE-V2-5 | deterministic maximal-layer rescue/checkpoint | custom CompactionEntry, new epoch, old query-only/searchable, next work succeeds |
| LIVE-V2-6 | deterministic-ineligible/native fallback and actual threshold | native CompactionEntry/recovery, no cancel loop, next work succeeds |
| LIVE-V2-7 | production AgentSession context-length path | real provider failure reaches overflow hook, custom/native checkpoint persists, Pi retries the original request, and later work succeeds; synthetic entries/direct hooks/fake retry events do not count |
| LIVE-V2-8 | provider cache behavior across stable prefix/suffix/projection changes | only provider-reported usage counts as hit; identities/classifications match request changes |
| LIVE-V2-9 | copied long Session migration/index | v1/v2/v3 reload, branch switch, decompression, checkpoint, index fallback; prefix preserved |
| LIVE-V2-10 | bundled/known extension ordering and TUI status | no bundled cancellation override; bounded truthful status across resize/restart |

Artifacts record event sequences, bounded digests/IDs/counters/usage, fact-class verdicts, and PASS/FAIL only. They MUST exclude credentials, raw conversation/provider requests, protected source, and full logs. Unknown third-party handlers remain documented `Unverified`; known bundled handlers must pass.

## 9. Release Gates

`v0.2.0` is blocked until all are true:

1. Human explicitly accepts this test plan before BUILD.
2. P0 change is complete and its inherited tests/evidence remain green.
3. Materialized strict validation passes sequentially for base, base+P0 fix, and base+P0 fix+redesign, including exact modified-requirement heading resolution.
4. PR2, PR3, PR4, and PR5 focused matrices pass fresh, in order, with usable-main gates recorded.
5. Typecheck, bootstrap, integration, full `npm test`, package, generated, provenance, and stable-release validators pass.
6. 10K/100K deterministic operation and structural-memory gates pass; wall/heap are reported without unsupported promises.
7. Copied-session forward/rollback migration matrix passes with byte-prefix proof.
8. Fake-provider matrix passes with no false live claim.
9. P0 live gates and LIVE-V2-1 through LIVE-V2-10 pass freshly for OpenAI, Anthropic, and Google Gemini; long T1→T2→T3→T3 and controlled third-party before/after ordering pass; missing/stale evidence fails closed.
10. Human review confirms hard-fact retention/quality limitations, recovery behavior, migration/rollback, cache and performance wording.
11. Package dry-run/candidate sanitizer shows exact `0.2.0`, intended files, license/SBOM/notices/provenance, and no internal/raw/credential artifacts.
12. ACP provenance names only `v1.14.3@00e8ba5...` behavioral influence and verifies no direct copied material unless separately reviewed/licensed.
13. Doctor reports no false PASS for provider, cache, index, effective setting, ordering, migration, or release evidence.
14. Dependency/lockfile, version, Git, push, provider credentials, publish, tag, and release actions each receive their separate exact approvals.

## 10. Unverified Until Named Evidence Runs

- Real tokenizer/billing/cache semantics for each provider/model.
- Summary semantic quality beyond the deterministic catastrophic classes.
- Provider acceptance of transient custom-message suffix in every turn topology.
- Actual Pi threshold/overflow retry/event ordering and provider-specific context errors.
- Unknown third-party extension ordering.
- Wall-clock/heap behavior outside the recorded Node/Pi/platform corpus.
- Real user Session migration before copied-session rehearsal.
- TUI status/resize behavior before live inspection.

Static declarations, fake provider output, or local timing MUST NOT be relabeled as proof for these rows.

## 11. Acceptance Record

- [ ] Human explicitly accepts the proposed defaults (`8` atoms, `12000` tokens capped at `10%`, last user protected), token/quality/tier/index/tool-profile contracts, deterministic performance budgets, PR2–PR5 matrix, migration, and release gates.
- [ ] BUILD authorization is separately granted.
