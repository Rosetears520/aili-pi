## Context

`fix-aili-compact-recovery-deadlock` is the required implementation and release base. It restores Pi as the final checkpoint/overflow backend, removes age-only top-level deactivation, repairs eligible legacy GC state append-only, and defines token-headroom pressure plus public rescue. This change completes the accepted P1–P3 lifecycle as mandatory `v0.2.0` scope through PR2–PR5.

The current v2 implementation still protects recent user-message counts rather than complete protocol atoms; decides benefit in characters; changes the system prompt for dynamic nudges; trusts literal child-summary inclusion as lineage evidence; replays/scans branches and resolves references linearly; uses broad tool cooling policies; and has no pre-commit catastrophic-loss gate. Static Pi types and local tests cannot prove real provider quality, cache behavior, overflow order, or long-session scalability.

Prior-art provenance is limited to behavioral comparison with `ranxianglei/opencode-acp@v1.14.3`, commit `00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb`. No ACP source, prompt, schema, fixture, test, or asset is authorized for copying. AILI's Pi JSONL append-only, reversible DAG, branch/epoch, public-hook, and fail-open architecture remains independently owned.

## Goals / Non-Goals

**Goals:**

- Preserve REC-001 through REC-008 from P0 in every PR and final release.
- Protect a complete recent tail by protocol atom and token budget, always protect unfinished work and the last user message, and recommend exact mutation-safe ranges before summary generation.
- Use provider/model-scoped token bounds, guaranteed steady-state savings, conservative one-time cost, break-even turns, and bounded calibration.
- Reject catastrophic summary loss before append with tier-specific hard/warning fact classes; evaluator failure is fail-closed and pressure falls through to checkpoint recovery.
- Inject bounded dynamic guidance as a deterministic provider-only suffix, not a changing system prompt or persisted Session entry, and account for it exactly in cache identities.
- Add append-only v3 T1/T2/T3 semantic blocks, explicit consumed-block lineage, atomic parent/child transitions, `mode:"blocks"`, and one-level/raw restoration while retaining v1/v2 readers.
- Replace repeated full scans with a session/branch/epoch-scoped incremental BranchIndex, duplicate-aware monotonic alignment, O(1)-class reference lookup, and deterministic operation-budget evidence.
- Add result-only tool cooling profiles that preserve protocol metadata and fail safe for unknown/protected tools.
- Deliver PR2, PR3, PR4, and PR5 with usable main after every merge and complete migration, fake-provider, real Pi/provider, package/provenance, docs, performance, and release gates.

**Non-Goals:**

- No Pi fork/private API, OS sandbox claim, raw sidecar, irreversible JSONL rewrite, cross-branch semantic merge, unlimited recursive decompression, new agent CLI, ACP code copy, or direct provider SDK dependency.
- No latency or heap PASS claim from unnormalized hardware timing. Deterministic operation and structural-memory budgets are gates; wall-clock/heap are recorded as comparative evidence only.
- No dependency/lockfile, version, Git, provider credential, publish, or release mutation without its separate exact approval.

## Inherited Recovery Contract

The complete P0 requirement set is normative. In particular:

1. AILI deterministic checkpoint or `undefined`; never cancel-only for manual/threshold/overflow.
2. Pi native compaction/retry is the mandatory final recovery path.
3. AILI disabled returns `undefined`.
4. Recovery does not require a normal agent response.
5. Age alone never deactivates top-level semantic coverage.
6. Session history remains append-only; no raw duplicate sidecar.
7. A successful CompactionEntry creates a new epoch and old blocks become query-only ancestry.
8. One coordinator/cycle prevents semantic and checkpoint storms.

PR2–PR5 SHALL run a focused inherited-P0 gate before merge. A PR that weakens a recovery invariant is not mergeable even if its new feature tests pass.

## Decisions

### 1. Complete protocol-atom recent-tail protection

A **protocol atom** is the smallest ordered provider-safe group:

- one ordinary user or assistant message with no tool protocol;
- one assistant tool-call message plus all sibling calls and every matching tool result;
- one branch/compaction/custom provider-visible summary message;
- an incomplete/malformed tool group, which is hard-protected as one remainder atom.

Protection defaults are:

```text
preserveRecentAtoms = 8
preserveRecentTokens = 12000
preserveRecentTokenCap = floor(0.10 * activeModel.contextWindow)
preserveLastUserMessage = true
```

The effective token tail is `min(preserveRecentTokens, preserveRecentTokenCap)`. If the active context window is unavailable or invalid, AILI uses the full configured 12,000-token tail and reports `window-source:fallback`; it never applies an invented smaller cap. Scanning newest to oldest protects whole atoms until both the newest `preserveRecentAtoms` and at least the effective token budget are covered; an atom crossing the token limit remains wholly protected. The entire unfinished current turn, malformed/binary/secret/protected-tag atoms, and the newest user message are hard-protected regardless of count/budget. Config may increase protection, not disable incomplete/protocol/secret safety.

A planner converts eligible source into maximal contiguous unprotected atom-aligned ranges and returns exact refs, source digest, catalog scope, token bounds, and exclusion reason counts. It does not write a summary. A later mutation must name one exact recommended range (or explicit set for message mode) under the same catalog and source digest. If a summary was authored for a broader/different range, mutation rejects `source-summary-scope-mismatch`; it never silently filters protected entries after summary generation.

### 2. Provider/model-scoped token bounds and benefit policy

The estimator key is `(providerId, modelId, estimatorVersion)`. It returns bounded integers `[lower, upper]` plus source (`provider-calibrated`, `baseline`, or `fallback`) for source text, projected replacement, provider suffix, tool arguments, and quality metadata. Binary/image/unknown protocol content is ineligible rather than guessed.

The versioned immutable profile for a supported provider/model supplies `minBytesPerToken`, `maxBytesPerToken`, lower/upper per-message overhead, and lower/upper per-tool-part overhead. For canonical provider serialization with `N` UTF-8 bytes, `M` messages, and `P` structured tool parts:

```text
baselineLower = ceil(N / maxBytesPerToken) + M*messageOverheadLower + P*toolOverheadLower
baselineUpper = ceil(N / minBytesPerToken) + M*messageOverheadUpper + P*toolOverheadUpper
```

The unknown-provider fallback is `minBytesPerToken=1`, `maxBytesPerToken=8`, message overhead `[1,16]`, and tool-part overhead `[4,64]`; this deliberately wide bound may make candidates ineligible. A zero-length surface is `[0,0]`. Arithmetic uses saturating safe integers; saturation is ineligible. `cacheWritePenaltyUpper` equals the upper-bound stable-prefix tokens whose provider reuse would be lost by the compression request and is zero only when provider-reported/request-shape evidence proves that prefix remains reusable.

For candidate `c`:

```text
sourceLower(c)       = lower bound of current provider-projected source
replacementUpper(c) = upper bound of block envelope + summary/stub + suffix delta
steadySavingsLower  = max(0, sourceLower - replacementUpper)

oneTimeCostUpper    = discovery/status input upper
                    + suffix upper for the compression turn
                    + tool-call/quality-manifest upper
                    + summary output upper
                    + conservative cache-write penalty

breakEvenTurnsUpper = ceil(oneTimeCostUpper / steadySavingsLower)
netSavingsLower(H)  = H * steadySavingsLower - oneTimeCostUpper
```

If `steadySavingsLower <= 0`, bounds are unavailable, or any arithmetic saturates, semantic compression is rejected. Stable defaults are `minSteadySavingsTokens={T1:256,T2:512,T3:768}`, `minSavingsRatio=0.20`, and maximum break-even horizon by pressure `{NORMAL:8,PRESSURE:4,FORCE_SEMANTIC:1}`. `CHECKPOINT_REQUIRED` and `OVERFLOW_RECOVERY` do not start another semantic operation; they use inherited checkpoint recovery. T1 is used for raw-source candidates before v3 parent tiers exist.

The ratio is `steadySavingsLower / max(1, sourceUpper)`. A candidate passes only when savings tokens, ratio, break-even horizon, protection, quality, and pressure policy all pass. Stable config may tighten these values; unsafe loosening below hard minima is rejected.

### 3. Bounded estimator calibration and failure boundaries

Completed provider usage is sampled only when provider/model, full provider-input identity, projected messages, suffix, tool surface, and reported token fields are known; images/binary, overflow/retry, cancelled calls, compaction calls, zero/negative values, cache semantics that cannot be reconciled, or an observed/baseline ratio outside `[0.25,4.0]` are excluded.

For the last 20 eligible samples (minimum 5), calibration records observed-to-baseline ratios without source content. The lower multiplier is `0.90 * min(ratios)` clamped to `[0.25,1.0]`; the upper multiplier is `1.10 * max(ratios)` clamped to `[1.0,4.0]`. A new accepted window may move either effective multiplier by at most 25% from the prior value. Provider/model or estimator-version change invalidates the window. Missing/invalid telemetry keeps conservative baseline/fallback bounds and increments bounded reason counters; it never narrows upper bounds or broadens eligibility.

### 4. Default-enabled pre-commit catastrophic-loss gate

The gate runs after schema/source/lineage validation and before appending a semantic transaction. It is a local deterministic `QualityEvaluator`; it makes no hidden provider call. Source analysis emits bounded fact descriptors with refs/digests, never source bodies in rejection output.

Fact classes are:

| Class | Examples | T1 | T2 | T3 |
|---|---|---|---|---|
| `goal-constraint` | user goal, must/must-not, scope, approval | hard | hard | hard |
| `decision` | accepted/rejected option, invariant, default | hard | hard | hard |
| `artifact-symbol` | modified file, public symbol/API/schema/version | hard | hard | hard when still current |
| `failure-blocker` | exact error class, failed gate, unresolved blocker | hard | hard | hard |
| `verification` | command/check and truthful result | warning unless current | hard when release-relevant | hard |
| `open-work` | unfinished item, next action, Unverified claim | hard | hard | hard |
| `protocol-provenance` | tool/reference/source relationship | hard structural | hard coverage | hard coverage |
| `resolved-detail` | superseded chronology or implementation detail | warning | warning | optional/warning |

Secrets, credentials, binary bodies, and configured protected data are never eligible source facts. Hard structural checks require every hard descriptor to map to a bounded summary span with class-appropriate anchors and source refs; the evaluator verifies summary-span text/digest, coverage count, non-contradictory status terms, and tier template fields. Warnings may commit but are persisted as bounded codes/counts. Missing hard coverage, contradictory completion state, malformed metadata, evaluator exception/timeout/unavailable version, or unclassifiable high-risk content rejects the whole mutation.

The rejection returns only evaluator version, tier, codes, counts, and current message/block refs. Under `NORMAL`/`PRESSURE`, the model may retry once with corrected exact scope. Under `FORCE_SEMANTIC`, the pressure cycle permits no more than its one semantic attempt. Under checkpoint-required/overflow, rejection goes directly to deterministic checkpoint planning or Pi native fallback; quality failure can never cancel recovery.

Stable config defaults `quality.enabled=true` and exposes tier warning policy. Turning the gate off is an explicit expert override recorded in doctor/transactions, but release evidence and deterministic checkpoint eligibility treat unevaluated new blocks as ineligible unless a separately accepted safe migration establishes equivalent metadata.

### 5. Deterministic provider-only suffix and cache identity

Dynamic guidance is removed from `before_agent_start` system-prompt mutation. Static system/tool instructions stay byte-stable. At the final `context` projection step, AILI may append one transient `role:"custom"`, `customType:"aili-compact-provider-suffix"`, `display:false`, `timestamp:0` message after a complete protocol atom. Pi converts it to a provider user message. It is never appended through SessionManager, never receives a Session entry/ref, never participates in replay/search/source coverage, and is removed/rebuilt for every call.

The suffix is omitted in `NORMAL` when no action is recommended. Otherwise it contains only bounded, stable-ordered fields:

```text
version; pressure stage; conservative headroom;
catalog ID/scope digest; exact recommended safe ranges;
eligible block refs/target tier; allowed actions; checkpoint state
```

No raw source, summary body, path contents, secret metadata, wall-clock value, animation, terminal width, or random identifier is included. Maximum is 512 estimated tokens and 2,048 characters; overflow drops optional eligible refs first and then emits a bounded status-only suffix.

Four identities are maintained:

```text
staticSurfaceIdentity        = digest(provider, model, byte-exact static system/tools/immutable guidance)
logicalProviderPrefixIdentity= digest(canonical AILI pre-suffix provider messages)
suffixFingerprint            = digest(exact rendered suffix or "none")
fullProviderInputIdentity     = digest(logical prefix, branch, epoch, projectionHash, suffixFingerprint)
```

Warm-candidate telemetry requires identical full identity; a changed projection or suffix is `state-change`. Static and logical-prefix identities are reported separately. The logical identity is AILI's request-surface identity, not a claim about a provider's private serialization/cache key. Provider usage remains authoritative; inferred reuse is never an actual hit. Suffix state is excluded from JSONL/reference/search persistence but included exactly in benefit cost and full cache identity.

### 6. Append-only complete tagged v3 transaction union and tier semantics

`aili.compact.tx.v3` is additive. Readers continue to accept v1/v2 exactly. New semantic writes use v3 after PR3 cutover; control/cooling compatibility is versioned explicitly.

Every v3 transaction has a shared closed header `(schema, txId, sessionId, branchLeafId, epochId, catalogId, createdAt, projectionVersion)` and exactly one tagged payload: `semantic-create`, `decompress`, `recompress`, `cooling`, or `control`. Semantic-create has tier/topic/run/anchor, summary/digest, token/quality metadata, and exactly one source arm: message IDs or immediate child block IDs. It records recursive ordered leaf digest/count, not a full parent leaf-ID array. State booleans are not caller input: parent activation and child deactivation are derived atomically. Other arms carry bounded target/provenance and only existing closed reasons.

Tiers are semantic ranks:

- **T1:** source kind `messages`; directly covers one exact contiguous safe raw-message atom range and has no child blocks.
- **T2:** source kind `blocks`; consumes 2–16 active T1 children.
- **T3:** source kind `blocks`; consumes 2–16 active T2 children and is the highest rank in an epoch.

All children of one parent must have the same tier, current epoch, active state, no active parent, and projection-contiguous effective leaf coverage. Promotion parent tier is exactly child tier + 1; a T3-restill replacement remains T3. Cross-tier merging is rejected; the caller must first normalize lower-tier adjacent children into the missing tier. T3-to-T3 restilling is rank-preserving and default-enabled for 2–16 children with minimum 8,000 source tokens, 1,024 guaranteed savings, 0.25 savings ratio, maximum 3,000 summary tokens, and 8 turns since each child creation. These stricter defaults prevent churn while reducing repeated T3 wrapper/reference overhead in long Sessions. Other tier relations remain exact; rank validation plus explicit DFS cycle checks prevent cycles. A child may have historical parents in append-only history but at most one active parent after replay.

Parent append and child deactivation are one transaction validated against one catalog/digest. Projector selects maximal active nodes only: if parent is active, descendants are hidden; if it is inactive and immediate children are active, those children project. Literal `summary.includes(child.summary)` is never lineage proof; only IDs, leaf coverage digest/count, contiguity, tier, and transaction validation establish lineage.

### 7. Block-mode selection and bounded restoration

`aili_compact` gains this additive stable union arm:

```ts
{
  mode: "blocks";
  catalogId: string;          // exact 64-character current catalog ID
  topic: string;              // 1..200 characters
  blockRefs: string[];        // 2..16 refs matching ^b\\d{6}$
  summary: string;            // 1..10,000 characters, also bounded by summaryMaxChars
  summaryMaxChars?: number;   // 256..10,000
}
```

Selection is deterministic after resolving refs in caller order then sorting by effective source ordinal. It rejects duplicate/stale refs, non-v3-semantic/query-only/inactive blocks, mixed child tiers, active-parent children, non-contiguous projected coverage, protected current-tail intersection, unsafe estimator benefit, and any source/quality mismatch. T3 children are accepted only under the T3-restill gates.

`aili_decompress` keeps `catalogId` and 1–16 `blockRefs` and adds optional `depth:"one"|"raw"`; v1/v2 leaves retain their existing raw behavior, while a v3 parent defaults to `one`.

Decompression semantics are:

- `one` atomically deactivates the selected parent for explicit decompress and reactivates exactly its immediate children after digest/active-parent validation.
- `raw` accepts 1–16 non-overlapping roots, computes unique recursive ordered closure from root IDs/child IDs/digests, and atomically deactivates roots and descendants. Closure includes roots and must be <=256; no full parent leaf array is stored.

Recompression may reactivate the exact previously decompressed parent only when its leaf digest, child closure, tier, quality metadata, projection version, and explicit-decompression provenance still match and no overlapping active parent exists. It atomically deactivates the exposed children/raw coverage. It never silently creates a new summary. `restore-all` keeps its explicit-user semantics and cannot be undone by automatic lifecycle work.

### 8. Highest-safe-layer deterministic checkpoints and archive search

P0 complete-coverage rules remain. For each discarded prefix segment, the planner chooses the maximal active semantic node with valid current provider/model estimates and accepted quality metadata: T3 over T2 over T1, without mixing parent and descendant. If maximal nodes do not cover the entire prefix exactly, planning returns `undefined` and Pi native fallback remains mandatory.

After Pi persists the custom/native CompactionEntry, the entry ID becomes the new epoch. All prior v1/v2/v3 nodes derive `active=false`, `deactivationReason:"epoch"`, `queryOnly=true`. Current reference catalogs do not expose them as decompression/recompression sources. A bounded archived index supports exact summary/block metadata lookup by old epoch and current-branch source search; it returns refs/digests/metadata or bounded snippets only through the established search permission surface. Raw Session entries are neither copied nor deleted.

### 9. Session/branch-scoped incremental BranchIndex

The index key is `(sessionId, canonicalSessionPathDigest, branchLeafId, epochId, replayVersion)`. It owns:

- ordered branch entries and `entryId -> ordinal/entry`;
- protocol atoms and `entryId -> atomId`, completeness/protection metadata;
- replayed transaction/block maps, active parent/children, leaf coverage intervals;
- current/archived message and block ref maps in both directions;
- canonical message fingerprints and duplicate-alignment queues;
- provider/model token-estimate subindexes;
- projection/source/catalog digests and deterministic operation counters.

Initialization performs one pure full build and compares its canonical state digest with the existing reducer/catalog oracle. Valid append at the known leaf incrementally updates only new entries/atoms/transactions. A transaction update becomes visible atomically after validation. Reference resolution uses scoped hash maps rather than scans.

Invalidation rules are exact:

| Event | Action |
|---|---|
| same-branch append with matching parent/tip | incremental append |
| `session_tree` to cached leaf with matching ancestry digest | switch to cached immutable snapshot |
| uncached/rebased leaf or parent mismatch | full pure rebuild for that branch, never partial reuse |
| persisted CompactionEntry | close/archive old epoch subindex; create/rebuild current epoch tail |
| session replacement/path/ID change | discard session index and rebuild |
| provider/model/estimator change | invalidate token estimates/calibration only |
| projection/quality/config version change | invalidate affected derived subindex; replay source remains |
| malformed/duplicate IDs, digest mismatch, impossible lineage | mark index unhealthy and use exact pure fail-open path |

Branch snapshots share immutable prefix structures internally but state is never applied across a leaf without ancestry-digest proof. The pure reducer/catalog/projector remains the correctness oracle through v0.2.0 and a runtime fallback; index health uncertainty returns exact unmodified provider input or Pi native checkpoint fallthrough rather than approximate state.

### 10. Duplicate-aware monotonic entry/message alignment

Canonical fingerprints exclude timestamps and display-only data but include role, normalized text/content digest, tool-call IDs/names/argument digest, result IDs/names/content digest, and custom summary type. Protocol atoms are aligned as indivisible groups.

The linear aligner builds occurrence queues, unique/protocol anchors, and forward/backward feasible ordinal bounds. Provider messages are walked monotonically between anchors. A mapping is accepted when each message has one ordinal or every feasible duplicate ordinal has the same active-coverage/projection action and protocol-atom identity. If duplicate choices could change which source is hidden, summarized, or protected, alignment is ambiguous and the entire projection returns the exact input references. It never selects an arbitrary equal string by first-match alone.

The index stores alignment keys, but the final monotonic/protocol validation runs against each deep-copied provider message list because Pi may include a CompactionSummary or another extension may have transformed context. The transient AILI provider suffix is added only after alignment/projection and is excluded from matching.

### 11. Result-only tool cooling profiles

Cooling never removes the assistant tool call, IDs/name, result role/status, or sibling order. It may replace only a result body after a successful later settled provider request proves observation of the exact session/branch/epoch/call/result/body/provider-input identity. Turns or grace alone are insufficient. A unique unresolved error is permanently protected until explicit same-identity resolution evidence; durable task/hub refs remain hard in messages, stubs, quality, tier, checkpoint, and open work.

An immutable registry selects by normalized exact tool name/alias:

| Profile | Default members | Policy |
|---|---|---|
| `retrieval` | read, grep, find, ls, web/fetch/get-search, read-only diagnostics | body eligible after 2 later successful observation turns; exact duplicate identity; keep latest equal result raw |
| `execution-evidence` | bash/test/build and other execution results | success eligible after 3 observed turns; error grace floor 5 but explicit durable resolution is mandatory |
| `mutation-evidence` | edit, write, fix/apply operations | no automatic cooling by default; explicit trusted override may enable after 3 consumed turns while artifact/status facts remain in semantic coverage |
| `protocol-control` | `aili_*`, task/hub/session/control surfaces | never automatic cooling |
| `unknown` | unmatched tools | keep raw / no automatic cooling |

Trusted project configuration may provide an exact tool-name override to a named profile or tighten age/keep-latest/body bounds. Wildcards and overrides that weaken hard protocol, secret, binary, incomplete, current-turn, or open-failure protection are rejected. Malformed metadata, missing call/result match, unknown profile, or config error falls back to `unknown` keep-raw. Result stubs include no raw body and cannot count as semantic coverage for deterministic checkpoint planning.

### 12. Deterministic performance and structural-memory gates

Let `E` be branch entries, `A` protocol-atom membership edges, `B` replayed blocks, `R` reference lookups, and `D` newly appended entries. Instrumentation counts visits/hash operations/full-scan fallbacks without source content.

Accepted v0.2.0 budgets on deterministic generated corpora are:

- cold 10K-message build: `entryVisits <= 3E`, `atomMembershipVisits <= 4A`, `blockVisits <= 4B`, `hashOps <= 12*(E+A+B)`;
- valid same-branch append: no entry before prior tip is revisited, `entryVisits <= 3D`, and `fullRebuilds=0`;
- 100K scoped message/block ref resolutions plus paging: `fullScans=0`, `hashLookups <= 3R`, exact digest/order equals the pure oracle;
- cached branch switch: no source rescan and one ancestry-digest check per changed path node; uncached switch may perform one declared full rebuild;
- retained index records: `<= 6E + 3A + 8B + 2*catalogRefs`, with no source-body duplicate and all per-epoch caches bounded by configured LRU size 4;
- every fault path produces either canonical-equivalent output or exact fail-open input and records the fallback count.

The fixed-seed corpus includes duplicates, multi-call atoms, malformed entries, v1/v2/v3 blocks, forks, decompression/recompression, and compaction epochs. Wall-clock duration and heap delta are written for observation with Node/Pi/platform metadata, but they are not PASS thresholds unless a later accepted spec normalizes hardware/runtime and changes this contract.

### 13. PR boundaries keep main usable

- **PR2 — safe planning:** implement complete atom/tail protection, exact safe ranges, token bounds/calibration, benefit policy, quality gate, and provider-only suffix/cache identities against existing v2/T1-equivalent blocks. Main remains usable with P0 checkpoint recovery and v1/v2 writes; new planning can be disabled as one coherent config fallback.
- **PR3 — tiered lifecycle:** add v3 dual readers/writers, T1/T2/T3, block mode, atomic lineage, one/raw restoration, and highest-layer checkpoint input. Main keeps v1/v2 replay and pure state paths; v3 write cutover is capability-gated and reversible by config before any unsupported write.
- **PR4 — index/cooling/performance:** build BranchIndex beside the pure oracle, duplicate alignment, exact refs, tool profiles, deterministic metrics, then cut over only after canonical-equivalence gates. An unhealthy index falls back to the pure path; main never requires the index to open a Session.
- **PR5 — integration/release:** make the accepted features default, remove superseded compatibility switches only where migration evidence permits, complete doctor/docs/provider-backed evidence/package/provenance and release validation for exactly `v0.2.0`. No publish is implicit.

Every PR runs inherited P0, migration, and its focused tests. A partial merge cannot disable Pi fallback, lose old readers, or require a future PR to make ordinary Sessions usable.

## Fixed Revision Decisions

- **Quality ownership:** callers keep unchanged range/message/block plus summary inputs and submit no manifest. Runtime first resolves exact source, freezes it in memory, then extracts `QualityManifestV1` from `QualityInputV1` and returns `QualityResultV1`. UTF-16 half-open spans, NFC + CR/LF normalization without trim/case-fold, exact digest framing, and exact durable agent/job/turn/message/history identities are normative; unknown versions, stale refs, malformed surrogates, extraction/evaluator errors, and ambiguous matches fail closed. Golden manifests are independently hand-written.
- **Economics:** replacement upper is measured through production projection and provider serialization and includes recap request/result/wrappers, every reference/topic/mode/tier/count/summary/separator, prior summary, parent/child, suffix, and provider overhead. One-time upper includes discovery, resent source, model output, tool call/result, cache invalidation estimate, and reserve. Tests inspect projector/serializer values, not formula fixtures alone.
- **Tagged v3:** the closed union has a shared header and `semantic-create|decompress|recompress|cooling|control` payload. Message/block sources are strictly exclusive. Ordered recursive child digests/counts replace full parent leaf arrays; activation/deactivation is derived atomically. Decompress roots are 1–16 and unique closure from roots plus digests is at most 256. Existing reasons remain closed.
- **Index/cooling:** the production event table, ancestry-prefix proof, zero healthy full-reducer/replay/hash/protocol/protection/catalog rebuilds, and one bounded provider-message pass are release contracts. Cooling requires exact later-request observation and exact result identity. Unresolved errors remain protected until explicit same-identity resolution; five turns alone never resolves them. Durable task/hub refs are hard across stubs, quality, tier, and checkpoint surfaces.
- **Planning/recovery:** `planning.enabled=true`; false disables only automatic discovery/recommendation/attempt/promotion/restill/suffix. It never disables manual mutation/restoration, protection, quality, P0 checkpoint/native/rescue/overflow, or index correctness. Overflow release evidence uses production AgentSession and real retry, never a synthetic CompactionEntry substitute.
- **Release:** rerun every P0 live gate on the candidate; run all three project-named provider families; exercise long T1→T2→T3→T3 restill quality; and run a controlled third-party context handler before and after AILI. Any missing row blocks release. Validation materializes and validates base, then P0 fix, then redesign in sequence.

## Required DEFINE Answers

| Question | Answer |
|---|---|
| 1. Pi `ctx.compact()` | Inherited P0: fire-and-forget `void`, manual path, callbacks, hook-supplied custom result, safe idle invocation only. |
| 2. `enabled=false` | Inherited P0: manual still works; threshold/overflow do not run; AILI-off returns `undefined`; ambiguous false is preserved/reported. |
| 3. Deterministic unavailable | Exactly `undefined`, never cancellation. |
| 4. Legacy repair | Exact GC reason + current epoch + digest + unique coverage + no parent/later explicit state; ambiguous states fail closed. |
| 5. Storm prevention | One branch/epoch pressure cycle and CheckpointCoordinator with one semantic attempt, schedule, in-flight call, callbacks, and lifecycle invalidation. |
| 6. Token formulas/calibration | Section 2 defines lower/upper savings, one-time cost, break-even/net formulas and pressure thresholds; section 3 defines 20-sample bounded provider/model calibration and explicit exclusion/fallback boundaries. |
| 7. Quality gate | Section 4 defines hard/warning fact classes per T1/T2/T3, deterministic manifest/span checks, fail-closed errors, redacted output, one retry policy, and checkpoint fallback. |
| 8. Provider suffix/cache | Section 5 defines transient custom suffix fields/bounds/non-persistence and separate stable-prefix, suffix, and full-provider identities. |
| 9. T1/T2/T3 | Sections 6–8 define schema, same-tier child selection, exact next-tier parent, no cross-tier merge, contiguity, cycle/single-active-parent checks, one/raw restoration, maximal layer checkpoint, and old-epoch archive/search. |
| 10. BranchIndex/alignment | Sections 9–10 define index ownership, lifecycle invalidation/rebuild rules, oracle fallback, duplicate feasible bounds, protocol anchors, and ambiguity fail-open. |
| 11. Tool cooling | Section 11 defines exact-name registry profiles, result-body-only replacement, trusted tightening/overrides, and unknown/malformed keep-raw fallback. |
| 12. Release live evidence | `test-plan.md` requires migration, fake-provider, named real Pi/provider, package/provenance, deterministic performance, cache, quality, overflow, and post-checkpoint continued-work gates before `v0.2.0`. |

## Migration Strategy

1. **Prerequisite:** complete and release/evidence-validate `v0.1.14` P0; freeze inherited recovery tests as gates in this change.
2. **PR2 additive planning:** introduce safe defaults and compatibility mapping from old count/character/nudge settings. Existing v2 writes may add bounded `qualityEvidence` only (versions, digests, durable refs, UTF-16 spans, class/count/code verdicts), never raw text. Move guidance only after suffix/cache tests pass; PR3 maps valid evidence into v3 quality fields.
3. **PR3 dual schema:** add v3 reader and fixtures first; replay v1/v2 unchanged and normalize them as legacy T1-equivalent leaves only for projection/checkpoint selection. Continue v2 writes until mixed-version, rollback-reader, and fault tests pass; then capability-gate v3 writes. Never rewrite old entries.
4. **Tier migration:** never consume v1/v2 as v3 children. Legacy blocks stay maximal leaves. Upgrade requires explicit decompression followed by a new exact v3 T1 over exposed raw messages; no compatibility-child marker or fabricated lineage exists.
5. **PR4 dual index:** construct BranchIndex beside pure replay/catalog and compare canonical digests in tests/diagnostic sampling. Cut over reads only after operation budgets and fault equivalence pass; retain pure fallback through v0.2.0.
6. **Cooling migration:** old policy transactions replay unchanged. New result-only decisions carry profile/version; no old broad decision is retroactively expanded. Unknown tool names remain raw.
7. **Checkpoint migration:** any new Pi CompactionEntry closes the old epoch uniformly. No attempt moves old blocks into the new epoch; only the persisted summary plus retained tail is current provider context.
8. **Copied-session rehearsal:** exercise clean v1, v2, mixed v2/v3, interrupted transaction, fork, prior epoch, explicit decompression, legacy repair, malformed index, and rollback copies in disposable HOME.
9. **PR5 default/release:** switch defaults only after live provider/Pi and package/provenance gates. Update exact package identity to `0.2.0` under separate approval. Keep migration docs and rollback command paths in the candidate.
10. **Rollback:** v0.2.0 never removes v1/v2 readers. A pre-v3 binary ignores/rejects v3 custom state but raw Session entries and Pi CompactionEntries remain; it may expose raw source rather than understand v3 summaries, so release notes require AILI-off/no-extensions plus native checkpoint before rollback when provider context safety matters. No rollback rewrites/deletes v3 entries.

## Risks / Trade-offs

- **Conservative token bounds may skip useful compression** → correctness and guaranteed savings win; bounded provider/model calibration can widen eligibility only with valid evidence.
- **Deterministic quality checks cannot prove all semantic equivalence** → gate targets catastrophic classes, requires explicit span/manifest evidence, warns on softer loss, and falls back to Pi checkpoint rather than claiming perfect summarization.
- **A transient custom user suffix may affect provider role behavior** → append only after complete atoms, bound it, verify across named providers, and omit in normal state; provider behavior remains Unverified until live gates.
- **Tier DAG adds schema/replay complexity** → strict rank/contiguity/digest/single-parent checks, atomic transactions, dual readers, and pure oracle fallback.
- **Index caching may become stale across forks/epochs** → identity/ancestry digests and exact invalidation; uncertainty triggers full rebuild or exact fail-open, never approximate projection.
- **Structural performance budgets do not guarantee every machine's latency** → gate algorithmic work deterministically and report wall/heap without universal claims.
- **Result-only cooling can hide useful evidence** → unknown/mutation/protocol tools default keep-raw, hard protections override profiles, and stubs never count as checkpoint coverage.
- **Provider suffix changes full-input identity** → report full state change truthfully while separately measuring stable-prefix cache reuse from provider telemetry.
- **v3 rollback to old binaries degrades semantic projection** → raw append-only history remains safe, release notes provide native-checkpoint/no-extensions recovery, and no old reader is removed in v0.2.0.

## Open Questions

No material product/architecture decision is left unresolved in this DEFINE draft. The numeric defaults, operation budgets, PR boundaries, and live evidence matrix are proposed for explicit test-plan acceptance. Provider quality/cache/overflow/role behavior, third-party extension order, and real-session migration remain `Unverified` until their release gates execute; failure blocks release rather than converting them into assumptions.

