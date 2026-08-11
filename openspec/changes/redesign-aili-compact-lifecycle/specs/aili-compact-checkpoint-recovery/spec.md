## ADDED Requirements

### Requirement: Lifecycle redesign preserves every P0 recovery invariant
PR2 through PR5 and final v0.2.0 SHALL preserve REC-001 through REC-008 from `fix-aili-compact-recovery-deadlock`: AILI deterministic planning or `undefined`, no cancel-only path, Pi final fallback/retry, AILI-off fallthrough, no normal-agent-turn dependency for rescue, no age-only top-level deactivation, append-only/no raw sidecar, and one storm coordinator.

#### Scenario: New quality or index layer fails
- **WHEN** any v0.2.0 safe-planning, tier, quality, suffix, index, alignment, cooling, or migration layer cannot prove safe output
- **THEN** manual/threshold/overflow still yields a valid deterministic custom checkpoint or `undefined`, never cancellation

#### Scenario: Each PR is merged independently
- **WHEN** main contains PR2, PR3, or PR4 without later PRs
- **THEN** ordinary v1/v2 Sessions remain usable and P0 rescue/native recovery tests pass

### Requirement: Deterministic checkpoints prefer the highest accepted current layer
Checkpoint planning SHALL use complete maximal current-epoch active semantic coverage, choosing T3 before T2 before T1 without parent/descendant duplication. A block with stale provider/model bounds, disabled/failed quality metadata, unhealthy index-only evidence, source gap, overlap, or cooling-only representation SHALL be ineligible. Ineligibility SHALL return `undefined` and preserve Pi native fallback.

#### Scenario: Quality metadata is absent after expert override
- **WHEN** a new block was committed without accepted quality evidence
- **THEN** it does not enter deterministic checkpoint coverage and native fallback remains available

### Requirement: BranchIndex and checkpoint coordinator share lifecycle identity
The coordinator, pressure cycle, catalog, index, token calibration, and deterministic planner SHALL agree on session, branch leaf, epoch, and source/catalog digest. A CompactionEntry SHALL atomically clear pending semantic/rescue state, close the old epoch index, and initialize/rebuild the new current state. Any mismatch SHALL invalidate the request/index rather than applying it to another branch.

#### Scenario: Branch changes while rescue is scheduled
- **WHEN** the branch leaf changes before `ctx.compact()` completes
- **THEN** stale one-shot state cannot supply a custom result for the new leaf and the new branch is rebuilt safely

### Requirement: Pressure suffix cannot create a compaction storm
The transient suffix MAY recommend one safe semantic action in pressure/force stages, but pressure-cycle fields remain authoritative. Repeated suffix generation MUST NOT reset `semanticAttempted`, `checkpointScheduled`, or `checkpointInFlight`. Quality rejection at checkpoint pressure SHALL immediately yield to inherited checkpoint recovery.

#### Scenario: Provider ignores guidance repeatedly
- **WHEN** several calls occur in the same high-pressure cycle without semantic reduction
- **THEN** AILI emits no duplicate semantic attempt authorization and schedules at most one public checkpoint

### Requirement: Planning disablement is narrow and safe
`planning.enabled` SHALL default true. When false, automatic safe-range discovery, semantic recommendation/attempt, tier promotion/restill, and proactive planning suffix are disabled. It MUST NOT disable manual range/message/block mutation, explicit decompress/recompress/restore, hard protection, quality evaluation, P0 checkpoint/native fallback/rescue/overflow behavior, or BranchIndex correctness/fail-open behavior.

#### Scenario: Planning is disabled during overflow
- **WHEN** `planning.enabled=false` and production AgentSession receives a real overflow
- **THEN** semantic auto-planning is skipped but deterministic checkpoint or Pi native overflow retry remains available

### Requirement: Release proves the production AgentSession overflow retry
AILI SHALL verify overflow through the production Pi `AgentSession` path: a real provider/context-length failure triggers `session_before_compact(reason="overflow")`, AILI returns custom or `undefined`, Pi persists the checkpoint when successful, retries the original request, and later work succeeds. A synthetic CompactionEntry, directly invoked hook, fake retry event, or substitute harness sequence MUST NOT satisfy this gate.

#### Scenario: Only synthetic overflow evidence exists
- **WHEN** tests inject a compaction entry or manually replay callbacks without production AgentSession retry
- **THEN** the overflow release gate remains FAIL/Unverified
