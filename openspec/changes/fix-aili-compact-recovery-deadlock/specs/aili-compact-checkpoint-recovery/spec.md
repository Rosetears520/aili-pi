## ADDED Requirements

### Requirement: AILI and Pi cooperate through a mandatory recovery backend
AILI Compact SHALL own reversible semantic projection and deterministic checkpoint planning. Pi SHALL remain the final native checkpoint and overflow-recovery backend. AILI MUST NOT create a cancel-only path for manual, threshold, or overflow compaction. Recovery MUST NOT require another successful normal agent request. Pi Session JSONL/tree SHALL remain append-only and AILI MUST NOT create a raw-conversation sidecar.

#### Scenario: Deterministic overflow coverage is unavailable
- **WHEN** an overflow event cannot produce a valid deterministic envelope
- **THEN** AILI returns exactly `undefined`, performs no partial mutation, and does not prevent Pi native compaction/retry

#### Scenario: AILI is disabled
- **WHEN** any manual, threshold, or overflow event arrives while AILI is disabled
- **THEN** AILI returns exactly `undefined` without planning, cancellation, state mutation, or attempt-cache write

### Requirement: The compaction hook has an exact total return matrix
For manual, threshold, and overflow events, the AILI handler SHALL return only `{ compaction: CompactionResult }` after complete validation or JavaScript `undefined`. It MUST NOT return `{cancel:true}`, `null`, an empty/partial/error envelope, or false success. Deterministic disabled, planner ineligibility, validation failure, and caught exceptions SHALL return `undefined`. A matching native-only permit SHALL return `undefined` without deterministic planning.

#### Scenario: Every matrix cell is exercised
- **WHEN** manual, threshold, and overflow are crossed with enabled/disabled, deterministic enabled/disabled, eligible/ineligible, planner success/throw, and rescue policies
- **THEN** every result is one valid compaction envelope or exact `undefined`, and no AILI branch cancels

#### Scenario: Ordinary Pi manual compact has no native permit
- **WHEN** Pi `/compact` enters the manual hook while AILI is enabled without a matching native-only permit
- **THEN** AILI uses deterministic-first planning and falls through with `undefined` if ineligible

### Requirement: Deterministic checkpoint planning proves complete atomic eligibility
The planner SHALL use the exact Pi preparation cut. It SHALL prove a unique `firstKeptEntryId`, whole protocol atoms, exactly-once coverage of every discarded semantic atom by active current-epoch semantic blocks, matching source digests, safe acyclic lineage, no active parent/child contradiction, deterministic source order, and configured section/total bounds. Cooling, prune, and tool-result stubs MUST NOT represent uncovered semantic content. Prior Pi summary SHALL precede source-ordered AILI summaries, and the retained tail MUST NOT be copied into the summary. Any failed proof SHALL make the whole attempt ineligible.

#### Scenario: One discarded atom is uncovered or duplicated
- **WHEN** all but one discarded atom have valid coverage, or one atom has overlapping coverage
- **THEN** the whole attempt returns `undefined` and emits no partial checkpoint transaction

#### Scenario: Protocol atom crosses the cut
- **WHEN** a tool call and its matching result would be split by the preparation cut
- **THEN** planning is ineligible and does not move the cut silently

#### Scenario: Complete coverage is valid
- **WHEN** all eligibility and bound proofs pass
- **THEN** AILI returns the exact validated Pi envelope with preparation `firstKeptEntryId` and `tokensBefore`

### Requirement: Checkpoint attempt identity and cache are deterministic
An attempt ID SHALL be SHA-256 over a fixed schema tag and exact session, deterministic branch, epoch, reason, retry flag, preparation digest, branch-entry digest, replay-state digest, effective checkpoint-config digest, and policy. The session-memory cache SHALL store only immutable terminal eligible-envelope or ineligible-code results for that identity. Cache hits SHALL revalidate the tuple and digests. Exceptions, partial output, source text, display state, callbacks, and cross-branch/epoch/config results MUST NOT be cached.

#### Scenario: Identical hook input repeats
- **WHEN** the exact attempt identity repeats before lifecycle invalidation
- **THEN** the same cloned terminal value is returned without changing history

#### Scenario: Branch or epoch changes
- **WHEN** any identity input changes
- **THEN** a prior cache value is ineligible for reuse

### Requirement: Legacy repair uses standalone aili.compact.repair.v1
A repair entry SHALL have exact type `aili.compact.repair.v1`, deterministic `id`, deterministic `branchId`, exact `epochId`, and 1..16 ordered evidence objects. Each evidence object SHALL contain exactly deterministic `evidenceId`, `blockId`, nonempty ordered `sourceEntryIds`, `sourceDigest`, `gcEntryId`, nonnegative `gcReplayOrdinal`, `lineageDigest`, and `laterStateDigest`. Unknown/missing fields, noncanonical identities, duplicate evidence, or out-of-order evidence SHALL invalidate the entry. Repair MUST NOT be encoded as a semantic v1/v2 transaction.

Branch ID SHALL hash ordered current-branch source-entry IDs. Root epoch SHALL hash the schema tag, session ID, and root branch prefix; later epoch SHALL equal the persisted CompactionEntry ID. Evidence ID SHALL hash schema, branch, epoch, block, ordered source IDs, source digest, GC evidence, lineage digest, and later-state digest. Transaction ID SHALL hash schema, branch, epoch, and ordered evidence IDs using canonical sorted-key JSON.

#### Scenario: Canonical evidence order is stable
- **WHEN** the same eligible candidates are discovered in a different iteration order
- **THEN** ordering by first-source replay ordinal, block replay ordinal, and block ID produces identical evidence and transaction IDs

#### Scenario: Repair envelope uses semantic transaction type
- **WHEN** repair evidence appears inside `aili.compact.tx.v1` or `aili.compact.tx.v2`
- **THEN** it is not accepted as repair state

### Requirement: Repair eligibility is partitioned before deterministic batching
A candidate SHALL be eligible only when it is a current-epoch semantic block inactive for exact reason `gc`, all current-branch protocol atoms and its digest match, no active parent or peer overlaps effective source, lineage is acyclic and compatible, and no later explicit decompress, restore-all, recompress, nested replacement, checkpoint/epoch, missing, or ambiguous state exists. Every candidate SHALL receive one bounded disposition. Only eligible evidence SHALL be placed into source-ordered contiguous batches of at most 16; ineligible candidates MUST NOT be placed in a transaction.

#### Scenario: Seventeen candidates are eligible
- **WHEN** 17 candidates pass against one branch snapshot
- **THEN** deterministic batching proposes a 16-evidence transaction followed by a 1-evidence transaction

#### Scenario: A mixed candidate set is planned
- **WHEN** eligible and ineligible candidates coexist
- **THEN** they are partitioned before append and no transaction relies on skipping an ineligible member during replay

### Requirement: Repair replay is atomic and concurrency-safe
Replay SHALL revalidate exact branch/epoch, canonical identities/order, all provenance/digests/later-state/lineage facts, unique coverage, and final projection against fresh branch state. It SHALL reduce into temporary state and apply all evidence or none. A canonically identical committed transaction ID SHALL be idempotent; an ID/content mismatch SHALL reject. A stale concurrent batch SHALL reject atomically and MUST NOT be shrunk or partially applied.

#### Scenario: One evidence member fails replay validation
- **WHEN** one member of a valid-shape batch has stale digest or overlap
- **THEN** no member is repaired and projection remains at the pre-transaction state

#### Scenario: Concurrent batches overlap
- **WHEN** two planners race and the first append changes eligibility for the second
- **THEN** fresh replay accepts at most the still-valid whole transaction and rejects any stale whole batch

### Requirement: Branch activation is guarded by repair replay and projection
On `session_start`, `session_tree`, and fork/leaf activation, AILI SHALL snapshot the selected branch, replay semantic and repair entries, plan/append permitted repair batches, replay the resulting branch, reduce/project/validate, and only then publish provider projection, catalog, coordinator tuple, and current-branch doctor values. Failure SHALL activate exact raw fail-open projection with bounded diagnostics. Branch movement during the sequence SHALL restart activation for the new branch.

#### Scenario: Session starts with eligible legacy state
- **WHEN** startup selects a branch containing repairable GC blocks
- **THEN** repair and final replay complete before the first provider projection sees that branch

#### Scenario: Fork excludes a repair entry
- **WHEN** navigation selects a fork before an appended repair
- **THEN** the fork derives only its own ancestry and independently evaluates repair without leaked state

### Requirement: Age never deactivates a top-level semantic block
Age SHALL affect only promotion, cadence, telemetry, and checkpoint eligibility. It MUST NOT make a top-level semantic block inactive. `maxBlockAge` SHALL remain parseable in v0.1.x as a deprecated no-op and emit a bounded diagnostic.

#### Scenario: Block exceeds legacy maximum age
- **WHEN** an active top-level semantic block survives repeated lifecycle passes beyond `maxBlockAge`
- **THEN** it stays active and raw source remains hidden while telemetry may change

### Requirement: Public rescue uses one coordinated compact invocation and no normal turn
`/aili-compact rescue` and `/aili-compact rescue native` SHALL each call public `ctx.compact()` exactly once for an accepted idle request and SHALL call `sendUserMessage()` zero times. Default rescue SHALL be deterministic-first. Native rescue SHALL arm one matching native-only permit. `/aili-compact rescue status` SHALL be read-only. Re-entry while non-idle SHALL call neither API.

#### Scenario: Default rescue is accepted
- **WHEN** the active tuple is idle
- **THEN** the coordinator schedules one request and invokes public compact exactly once without a normal agent turn

#### Scenario: Rescue is already active
- **WHEN** another rescue arrives in scheduled, invoking, in-flight, or awaiting-epoch state
- **THEN** it is rejected with bounded status and no second invocation

### Requirement: NativeOnlyCompactPermit is matching and one-use
The permit SHALL contain one request identity, exact session/branch/epoch tuple, manual reason, and reserved next-hook ordinal. It SHALL match only the current request's next exact manual event and SHALL be consumed before returning `undefined`. It MUST NOT match threshold, overflow, ordinary `/compact`, another tuple, another ordinal, or a later request. Nonmatching manual events and every request/lifecycle terminal path SHALL invalidate it.

#### Scenario: Threshold arrives while native permit is armed
- **WHEN** a threshold event is observed
- **THEN** it does not consume the permit and follows deterministic-first semantics

#### Scenario: Matching manual event repeats
- **WHEN** the matching manual hook is observed twice
- **THEN** only the first consumes native-only policy and the second has no permit

### Requirement: Checkpoint coordinator owns all states and cleanup
The coordinator SHALL have exact states `idle`, `scheduled`, `invoking`, `inFlight`, `awaitingEpoch`, `succeeded`, `failed`, and `invalidated`. It SHALL adopt unowned host compaction before planning, suppress duplicates, handle synchronous/asynchronous callbacks, and terminalize a request once. `session_compact` with a new epoch SHALL be authoritative success; `onComplete` without an observed epoch SHALL wait. Error, invocation throw, settled-without-epoch, start/replacement/shutdown, tree/fork/leaf change, and epoch change SHALL perform the cleanup defined by design.

#### Scenario: Callback and event race
- **WHEN** `onComplete` and `session_compact` arrive in either order
- **THEN** one request succeeds once and all permit/in-flight state is cleared

#### Scenario: External overflow starts first
- **WHEN** overflow enters the hook before an idle auto-rescue
- **THEN** it is adopted as external in-flight and no duplicate public compact call occurs

#### Scenario: Stale callback arrives
- **WHEN** a callback belongs to an invalidated tuple/request
- **THEN** it cannot alter current state and only bounded stale telemetry changes

### Requirement: Pressure cycles bound semantic and checkpoint attempts
AILI SHALL derive `NORMAL`, `PRESSURE`, `FORCE_SEMANTIC`, `CHECKPOINT_REQUIRED`, and `OVERFLOW_RECOVERY` from context window, host reserve, and a conservative semantic-attempt budget. A session/branch/epoch/serial cycle SHALL permit at most one semantic attempt and one checkpoint invocation. Reset SHALL require a new persisted epoch or verified usage at least one semantic budget below the force boundary. Programmatic compact SHALL run only at a user-command or idle-settled boundary.

#### Scenario: Pressure remains high across settled events
- **WHEN** no epoch or sufficient verified token drop occurs
- **THEN** AILI does not repeat semantic or checkpoint invocation in that cycle

#### Scenario: Overflow reaches production entry
- **WHEN** Pi `AgentSession` delivers overflow with retry metadata
- **THEN** the registered Extension returns a valid deterministic envelope or undefined and never cancels the host retry path

### Requirement: Bootstrap and enabled-false behavior preserve host ownership
New install/refresh SHALL not write `compaction.enabled=false`. Absent settings SHALL retain Pi defaults; unrelated settings SHALL remain unchanged; unmarked false SHALL be preserved with unknown provenance. Under effective false, automatic threshold/overflow is unavailable at the host, but manual `/compact` and `ctx.compact()` remain host manual paths. AILI disabled SHALL always return undefined and SHALL not claim automatic events occurred.

#### Scenario: Existing unmarked false is found
- **WHEN** settings inspection finds explicit false without a prospective ownership marker
- **THEN** it is not changed and doctor reports `disabled-config` with provenance `unknown`

#### Scenario: AILI disabled with host manual compact
- **WHEN** the user invokes Pi `/compact`
- **THEN** AILI returns undefined and Pi owns the manual result

### Requirement: Successful checkpoint creates query-only ancestry
A persisted custom or native `CompactionEntry.id` SHALL become the current epoch. Prior blocks SHALL derive inactive query-only epoch ancestry without transaction rewrites and MUST NOT project, repair, decompress, recompress, or satisfy deterministic coverage. Exact current-branch source search SHALL remain available.

#### Scenario: Native checkpoint completes then reloads
- **WHEN** a native CompactionEntry is persisted and the session reloads
- **THEN** current state begins at that epoch and prior source remains searchable but not projectable

### Requirement: Recovery doctor fields have exact owners and values
Doctor SHALL expose `pressureStage`, `headroomTokens` with estimate source, `checkpointCoordinatorState`, `checkpointInFlight`, `deterministicCheckpointEligible`, `nativeAutomaticFallback`, `nativeAutomaticFallbackProvenance`, `legacyRepairStatus`, `lastRecoveryErrorCode`, and deterministic/native/rescue/repair counters using the owners and value domains in design. Unknown effective settings, origin, host ordering, or provider behavior SHALL be `Unverified`, not PASS. No repair field SHALL contain source text.

#### Scenario: Native origin is not observable
- **WHEN** a persisted compaction cannot be classified safely as native or deterministic
- **THEN** native count does not increment and origin remains `Unverified`

### Requirement: Release evidence covers fake, production-entry, and live recovery
Stable `v0.1.14` SHALL require exhaustive fake-provider evidence, production-entry `AgentSession` overflow/retry evidence, copied-session repair/reload/tree/fork evidence, deterministic batching/atomic reject/concurrency evidence, and separately authorized live Pi 0.82.1 deterministic rescue, native rescue, threshold, overflow, disabled/manual, copied repair, and extension composition gates. Static inspection MUST NOT substitute for a named live gate.

#### Scenario: Sequential merged-spec validation is absent
- **WHEN** either delta passes alone but the base plus deltas has not been validated sequentially in release order
- **THEN** DEFINE/release validation remains non-pass

#### Scenario: Live overflow evidence is unavailable
- **WHEN** automated evidence passes but controlled real overflow/retry evidence is absent
- **THEN** stable release remains blocked and the item stays `Unverified`
