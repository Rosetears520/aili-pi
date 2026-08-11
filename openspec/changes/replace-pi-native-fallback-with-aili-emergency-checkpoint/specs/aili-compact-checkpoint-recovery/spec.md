## MODIFIED Requirements

### Requirement: Lifecycle redesign preserves every P0 recovery invariant
The lifecycle SHALL preserve REC-001 through REC-008 from `fix-aili-compact-recovery-deadlock`: AILI deterministic planning or exact `undefined`, no cancel-only path, Pi final native checkpoint/retry, AILI-off fallthrough, no normal-agent-turn dependency for rescue, no age-only top-level deactivation, append-only/no raw sidecar, and one storm coordinator. This change SHALL use only the public Pi Extension surface and SHALL NOT replace native recovery with an Extension-owned provider request or synthetic continuation.

#### Scenario: A new emergency layer fails
- **WHEN** pressure, planning, quality, suffix, origin, or lifecycle state cannot prove a safe deterministic custom checkpoint
- **THEN** manual, threshold, and overflow compaction still return a valid custom envelope or exact `undefined`, never cancellation

### Requirement: Deterministic checkpoints prefer the highest accepted current layer
Checkpoint planning SHALL use complete maximal current-epoch active semantic coverage, choosing the highest accepted current layer without parent/descendant duplication. A block with stale provider/model bounds, disabled/failed quality metadata, unhealthy index-only evidence, source gap, overlap, or cooling-only representation SHALL be ineligible. Ineligibility, including `activeBlocks=0`, SHALL return exact `undefined` and preserve Pi native fallback; AILI SHALL NOT issue a secondary provider request to fill the gap.

#### Scenario: Active catalog is empty
- **WHEN** the Pi preparation contains discardable content but no complete accepted current-epoch semantic coverage
- **THEN** deterministic planning is ineligible and native fallback remains available

#### Scenario: Complete current-layer coverage exists
- **WHEN** the highest accepted layer exactly covers every discarded semantic atom and all bounds pass
- **THEN** one source-ordered deterministic custom envelope is returned

### Requirement: BranchIndex and checkpoint coordinator share lifecycle identity
The coordinator, pressure cycle, catalog, index, token calibration, deterministic planner, attempt cache and suffix SHALL agree on session, branch leaf, epoch, reason, preparation and source/config/policy digests. A persisted custom or native `CompactionEntry` SHALL atomically clear pending semantic/rescue state, close the old epoch index, and initialize/rebuild the new current state. Any mismatch SHALL invalidate stale work rather than applying it to another branch or Session.

#### Scenario: Branch changes while rescue is scheduled
- **WHEN** the branch leaf changes before `ctx.compact()` completes
- **THEN** stale one-shot state cannot supply or terminalize a result for the new leaf and the new branch is rebuilt safely

### Requirement: Pressure suffix cannot create a compaction storm
The transient suffix MAY recommend one safe semantic action in pressure/force stages, but pressure-cycle fields remain authoritative. Repeated suffix generation MUST NOT reset semantic or checkpoint attempt state. Quality rejection at checkpoint pressure SHALL yield to inherited deterministic-or-native recovery. An action SHALL be omitted when it is not executable in the advertised pressure/coordinator state.

#### Scenario: Provider ignores guidance repeatedly
- **WHEN** several calls occur in the same high-pressure cycle without semantic reduction or a new epoch
- **THEN** AILI emits no duplicate semantic authorization and schedules at most one public checkpoint

### Requirement: Release proves the production AgentSession overflow retry
AILI SHALL verify overflow through the production Pi `AgentSession` path: a real provider/context-length failure triggers `session_before_compact(reason="overflow")`, AILI returns custom or exact `undefined`, Pi persists the resulting custom or native checkpoint, retries the original request when host `willRetry` applies, and later work succeeds. A synthetic CompactionEntry, directly invoked hook, fake retry event, controlled local substitute, or substitute harness sequence MUST NOT satisfy this stable-release gate. Evidence SHALL classify custom/native origin truthfully and SHALL NOT infer a durable exactly-once continuation receipt from `willRetry` alone.

#### Scenario: Native fallback completes production overflow recovery
- **WHEN** deterministic coverage is unavailable and production `AgentSession` persists a native checkpoint before retrying
- **THEN** the recovery evidence is valid for the cooperative contract and is not reported as AILI deterministic success

#### Scenario: Only synthetic overflow evidence exists
- **WHEN** tests inject a compaction entry or manually replay callbacks without production AgentSession retry
- **THEN** the overflow production-entry gate remains FAIL/Unverified
