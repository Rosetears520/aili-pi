## ADDED Requirements

### Requirement: Emergency checkpoint coordination uses only public Pi seams
AILI SHALL coordinate emergency checkpoints through the public `session_before_compact`, `ctx.compact()`, `session_compact`, usage, and lifecycle surfaces. It SHALL NOT require an Extension-bound active `ModelRuntime`, private AgentSession API, direct credential read, duplicated provider client, `node_modules` edit, Pi fork, synthetic continuation receipt, or undocumented provider-dispatch veto.

#### Scenario: Public summary runtime is not Extension-bound
- **WHEN** AILI cannot access the active Agent's complete provider runtime through a supported Extension operation
- **THEN** AILI does not issue a secondary summary request and preserves deterministic-or-native recovery

### Requirement: Emergency hook arbitration is deterministic-or-native
For manual, threshold, and overflow compaction, AILI SHALL return one completely validated deterministic `CompactionResult` when complete accepted current-epoch semantic coverage exists. Every disabled, deterministic-off, native-permit, empty-catalog, ineligible, stale, invalid, over-bound, or exception path SHALL return exact JavaScript `undefined`, perform no partial mutation, and preserve Pi native compaction/retry. AILI MUST NOT return cancel, null, a partial envelope, or false success.

#### Scenario: Empty active catalog reaches overflow
- **WHEN** the discarded prefix has no complete accepted current-epoch semantic coverage and `activeBlocks=0`
- **THEN** AILI returns exact `undefined` and Pi remains free to generate and persist a native summary

#### Scenario: Complete deterministic coverage exists
- **WHEN** all discarded protocol atoms have exactly-once accepted coverage and every tuple, source, quality, lineage and bound proof passes
- **THEN** AILI returns one complete custom envelope using the exact Pi preparation cut

#### Scenario: Planner throws
- **WHEN** deterministic planning raises an exception
- **THEN** the exception is reduced to bounded diagnostics, no partial state is committed, and the hook returns exact `undefined`

### Requirement: Proactive pressure scheduling is bounded by public lifecycle boundaries
AILI MAY use observed usage, conservative estimates, the active context window, host reserve, and an unrounded policy threshold no later than 90 percent to enter `CHECKPOINT_REQUIRED`. Programmatic checkpoint invocation SHALL occur only at an accepted user-command or idle/settled boundary, at most once per unchanged session/branch/epoch/pressure cycle. Reset SHALL require a new persisted epoch or verified usage at least one semantic-attempt budget below the force boundary. This policy SHALL NOT be represented as a synchronous veto of every provider dispatch.

#### Scenario: Pressure remains high across settled events
- **WHEN** repeated settled events occur without a new epoch or verified pressure reset
- **THEN** AILI schedules at most one public `ctx.compact()` invocation for that cycle

#### Scenario: Provider dispatch is already in progress
- **WHEN** pressure is observed while the host is busy or dispatching
- **THEN** AILI records bounded pressure state without claiming that the current public API blocked that dispatch

#### Scenario: Usage drops by less than one semantic-attempt budget
- **WHEN** usage decreases but remains within one semantic-attempt budget of the force boundary
- **THEN** the current pressure cycle is not reset and no second checkpoint invocation is authorized

### Requirement: Persisted epoch is the durable checkpoint authority
A checkpoint SHALL be reported as durable success only after a matching `session_compact` event identifies a newly persisted `CompactionEntry` and the new epoch is adopted. A callback, tool result, suffix string, planned candidate, or projected message reduction SHALL NOT independently prove durable success. Valid custom and native persisted checkpoints SHALL both be accepted and their origin SHALL be classified only from observable evidence.

#### Scenario: Completion callback arrives before persistence
- **WHEN** `ctx.compact()` reports completion but no matching new persisted epoch has been observed
- **THEN** the coordinator remains awaiting epoch or terminates with bounded failure rather than reporting durable success

#### Scenario: Pi persists a native checkpoint
- **WHEN** `session_compact` reports a new native `CompactionEntry`
- **THEN** AILI adopts the new epoch, clears stale cycle state, and records native origin without treating it as a contract violation

### Requirement: Overflow retry and task continuation remain host-owned
AILI SHALL observe the Pi event's `willRetry` state for diagnostics and SHALL NOT synthesize a continuation through `sendMessage()` or `sendUserMessage()`. Manual or threshold checkpoints SHALL NOT invent work. The contract SHALL NOT claim a durable exactly-once receipt where the public host exposes only lifecycle intent.

#### Scenario: Pi reports overflow retry
- **WHEN** a persisted overflow checkpoint reports `willRetry=true`
- **THEN** AILI emits no continuation turn and leaves original-request retry to Pi

#### Scenario: No host retry is reported
- **WHEN** a checkpoint reports `willRetry=false`
- **THEN** AILI records the host-reported state and does not create a synthetic task continuation

### Requirement: Emergency state is isolated and guidance is truthful
Checkpoint attempt, cache, coordinator, pressure, and suffix state SHALL bind the exact session, branch, epoch, reason, preparation, policy and pressure-cycle identity. Tuple mismatch SHALL invalidate stale results. Transient provider guidance SHALL advertise only actions executable in the current state and SHALL remain non-authoritative.

#### Scenario: Epoch changes before a stale callback
- **WHEN** a callback or suffix belongs to the prior epoch
- **THEN** it cannot alter current coordinator state or advertise an executable current-epoch checkpoint action

#### Scenario: New epoch has no post-checkpoint usage
- **WHEN** persistence has completed but no valid assistant usage has been observed in the new epoch
- **THEN** status reports `rebuilding`/`unknown` rather than old headroom or a new success claim

### Requirement: Branch and tree summary ownership remains with Pi
AILI SHALL NOT cancel, replace, or privately reimplement Pi branch/tree summary generation. After a public branch, tree, fork, or leaf lifecycle event, AILI SHALL rebuild only its own session/branch/epoch/catalog/coordinator state. If AILI projection identity is uncertain, it SHALL return the exact host input rather than block the host operation or emit approximate projected content.

#### Scenario: Pi completes a tree operation with a native summary
- **WHEN** the host changes the active tree or branch and emits the public lifecycle event
- **THEN** AILI accepts host ownership, rebuilds state for the selected branch, and does not classify the host summary as an AILI deterministic checkpoint

#### Scenario: Rebuild cannot prove projection identity
- **WHEN** AILI cannot align the selected branch to exact current state after the host operation
- **THEN** provider projection fails open to the exact host input with bounded diagnostics
