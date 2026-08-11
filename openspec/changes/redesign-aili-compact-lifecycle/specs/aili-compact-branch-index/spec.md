## ADDED Requirements

### Requirement: BranchIndex is scoped by session branch epoch and replay version
AILI SHALL maintain an index keyed by session identity/path digest, branch leaf, compaction epoch, and replay version. It SHALL index ordered entries, entry ordinals, protocol atoms, replayed transactions/blocks, active lineage/coverage, scoped refs, alignment fingerprints, token estimates, and canonical digests. It MUST NOT duplicate raw source bodies outside Pi Session history.

#### Scenario: Two branches share a prefix
- **WHEN** each branch has a different leaf after a common prefix
- **THEN** each index exposes only its selected branch state while immutable prefix structures may be shared after ancestry proof

#### Scenario: Session identity changes
- **WHEN** session ID or canonical path digest changes
- **THEN** old index state is discarded and cannot satisfy refs for the new Session

### Requirement: Valid same-branch append is incremental and atomic
When a new entry's parent matches the indexed tip, AILI SHALL validate and update only the appended entries, affected atoms, transactions, coverage, refs, and digests. A transaction SHALL become visible atomically after full validation. It SHALL not rescan any entry before the prior tip on a valid append.

#### Scenario: One valid message is appended
- **WHEN** its parent and prior digest match the index tip
- **THEN** incremental state equals pure replay and operation counters record no full rebuild

#### Scenario: Appended transaction is invalid
- **WHEN** payload/digest/lineage validation fails
- **THEN** no partial block/ref/coverage update becomes visible and bounded diagnostics match pure replay

### Requirement: Production events have one exact index update contract
The production extension entry SHALL route events through this table: `session_start|session_switch` => discard prior session identity and cold-build selected branch; `session_tree` with cached leaf and verified ancestry-prefix digest => snapshot switch, otherwise one cold rebuild; `message_end|tool_execution_end|custom_entry` with matching parent/tip => one incremental append; `session_before_compact` => read-only frozen snapshot; `session_compact` => atomically archive old epoch and cold-build new tail; provider/model change => estimator/calibration invalidation only; projection/quality/config version change => owned derived-index invalidation only; shutdown => discard. Parent/tip mismatch, malformed/duplicate IDs, impossible lineage, or digest mismatch marks unhealthy and invokes the exact pure fallback.

Prefix proof SHALL hash canonical ordered `(entryId,parentId,entryKind,payloadDigest)` records from the shared prefix and compare length, tip, and digest before structural sharing. On a healthy steady request, the full reducer, transaction replay, hash recatalog, protocol rebuild, protection rebuild, and catalog rebuild counters SHALL all remain zero; after projection there may be exactly one bounded monotonic pass over provider messages. Production extension-entry integration tests, not adapter-only tests, SHALL assert this table and counters.

#### Scenario: Cached branch ancestry mismatches
- **WHEN** length, tip, or canonical ancestry-prefix digest mismatches
- **THEN** AILI rejects reuse and performs one declared rebuild

#### Scenario: Healthy provider request
- **WHEN** no production event invalidated the selected snapshot
- **THEN** all full rebuild/reducer/hash/protocol/protection/catalog counters are zero and provider messages are visited at most once

#### Scenario: Index is unhealthy
- **WHEN** consistency validation fails
- **THEN** exact pure/fail-open output is used and every fallback/rebuild counter increments visibly

### Requirement: Message alignment is monotonic duplicate-aware and protocol-safe
AILI SHALL fingerprint semantic role/content and protocol metadata while excluding timestamps/display-only data, treat protocol atoms indivisibly, build occurrence queues and forward/backward feasible ordinal bounds, and align provider messages monotonically between unique/protocol anchors. A duplicate mapping is acceptable only if unique or if every feasible ordinal has identical atom identity and projection/protection action. Otherwise the entire projection SHALL return the exact input.

#### Scenario: Identical text occurs twice under different block coverage
- **WHEN** either duplicate could align to the provider message and the projection action differs
- **THEN** alignment is ambiguous and exact fail-open input is returned

#### Scenario: Duplicate occurrences have equivalent state
- **WHEN** all feasible duplicate ordinals belong to the same protocol atom/action class
- **THEN** deterministic monotonic alignment may proceed without selecting semantically different source

#### Scenario: Provider list contains AILI suffix
- **WHEN** transient guidance is needed
- **THEN** alignment/projection completes first and suffix is excluded from entry matching

### Requirement: Reference lookup is scoped and scan-free after index build
Message/block reference resolution, reverse lookup, and paging SHALL use scoped maps with current catalog/branch/epoch validation. Stale refs SHALL fail without falling back to an unscoped global scan. Archived lookup SHALL use a separate bounded epoch index.

#### Scenario: One hundred thousand scoped refs are resolved
- **WHEN** the deterministic corpus performs lookups and paging
- **THEN** outputs match the pure oracle, `fullScans=0`, and hash lookups remain within the accepted budget

### Requirement: Cooling profiles replace only eligible result bodies
AILI SHALL retain assistant tool calls, sibling ordering, tool IDs/names, result role, completion/error status, and protocol metadata. Cooling requires durable evidence that a successful later provider request actually observed the exact result: observation identity is `(sessionId,branchLeafId,epochId,callEntryId,callId,normalizedExactToolName,resultEntryId,resultBodyDigest,providerInputIdentity,settledRequestId)`. Age or grace alone is never observation. Only that exact result body may become a bounded stub/digest. Any unresolved error remains uniquely and permanently protected until explicit durable resolution evidence names the same identity and records the resolving assistant turn/status. The error grace floor is 5 later observed turns but is insufficient by itself. Durable task/hub refs in result, later messages, quality facts, tier/checkpoint coverage, or open work are hard protection; test stubs may not pretend those surfaces are absent. Result stubs never count as semantic checkpoint coverage.

#### Scenario: Retrieval result is consumed
- **WHEN** an exact-name retrieval-profile result is complete, unprotected, and followed by the configured later assistant turns
- **THEN** only its body may cool while the call/result protocol atom stays valid

#### Scenario: Mutation tool uses defaults
- **WHEN** edit/write/fix output has no explicit trusted tightening override
- **THEN** it remains raw because mutation-evidence automatic cooling defaults off

### Requirement: Tool profile selection is exact and fail-safe
AILI SHALL resolve normalized exact names/aliases to `retrieval`, `execution-evidence`, `mutation-evidence`, or `protocol-control`; unmatched/malformed tools SHALL use `unknown` keep-raw. Trusted project overrides MAY choose a named profile or tighten age/keep-latest/body bounds but MUST NOT weaken protocol, secret, binary, incomplete, current-turn, or open-failure protection. Wildcards SHALL be rejected.

#### Scenario: Unknown tool appears
- **WHEN** no exact registry/override entry exists
- **THEN** result content remains raw and doctor increments only a bounded unknown-profile count

#### Scenario: Override tries to cool AILI protocol
- **WHEN** configuration assigns an automatic profile to an `aili_*` control tool
- **THEN** hard protocol-control policy wins and the unsafe override is rejected

#### Scenario: Success was not observed
- **WHEN** turns elapsed but no later successful settled provider request identity proves it included the exact result
- **THEN** the result stays raw

#### Scenario: Execution error is unresolved
- **WHEN** an error has no explicit same-identity resolution evidence, or any durable task/hub reference remains in stubs, quality, tier, checkpoint, or open work
- **THEN** it remains protected permanently even after the five-turn grace floor

### Requirement: Deterministic operation budgets gate index release
For corpus variables `E` entries, `A` atom-membership edges, `B` blocks, `R` reference resolutions, and `D` new entries, the implementation SHALL satisfy: cold build `entryVisits<=3E`, `atomMembershipVisits<=4A`, `blockVisits<=4B`, `hashOps<=12*(E+A+B)`; valid append revisits no pre-tip entry, `entryVisits<=3D`, `fullRebuilds=0`; and 100K lookup/paging `fullScans=0`, `hashLookups<=3R`. Output digests/order SHALL equal the pure oracle. Counter assertions SHALL name the exact expected increment for every production event and fault, alongside an independent scan tripwire that throws on prohibited iteration. Fixtures SHALL use guarded containers, sentinels, and object-graph identity checks to detect hidden copying/rebuilds. Tests SHALL first run a small human-audited corpus with exact expected state/counters, then fixed-seed 10K-message and 100K-reference corpora through production extension entry points.

#### Scenario: Fixed 10K-message corpus builds
- **WHEN** the generated duplicate/protocol/v1-v3/fork corpus is indexed cold
- **THEN** canonical state equals pure replay and every operation counter is within its formula

#### Scenario: Valid append batch is measured
- **WHEN** entries append to the known tip
- **THEN** no prior entry is revisited and no hidden full rebuild is reported as incremental success

### Requirement: Structural memory and cache retention are bounded
Retained index records SHALL be at most `6E + 3A + 8B + 2*catalogRefs`; per-epoch/branch snapshots SHALL use a deterministic LRU bound of four unless stricter configured. Source bodies MUST NOT be duplicated. Wall-clock/heap metrics SHALL record Node/Pi/platform metadata for comparison but MUST NOT become universal PASS claims without a later accepted normalized threshold.

#### Scenario: Fifth inactive branch snapshot is retained
- **WHEN** the configured LRU is four
- **THEN** the deterministic least-recent inactive snapshot is evicted without changing persisted Session state

### Requirement: Instrumentation cannot hide fallback or source data
Performance evidence SHALL record corpus seed/counts, operation counters, canonical digests, rebuild/fail-open counts, duration, heap delta, and runtime versions without source bodies. Every fallback SHALL be counted; a full rebuild or scan MUST NOT be reported as an incremental/indexed PASS.

#### Scenario: Fault triggers pure fallback
- **WHEN** index consistency is deliberately corrupted in a fixture
- **THEN** output remains canonical/fail-open, fallback count increases, and the indexed-path operation gate does not falsely pass

