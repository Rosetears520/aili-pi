## REMOVED Requirements

### Requirement: AILI Compact exclusively owns compaction and GC
**Reason:** Exclusive cancellation and bootstrap-managed `compaction.enabled=false` can remove Pi's final checkpoint/retry path while semantic compression still needs another model turn. Age-only GC can also expose source without creating a real checkpoint epoch.

**Migration:** Replace exclusive ownership with `aili-compact-checkpoint-recovery`. New bootstrap does not write false; AILI returns only validated custom compaction or undefined; Pi remains final native recovery owner. Existing unmarked false is preserved with unknown provenance. No prior Session entry is rewritten.

## MODIFIED Requirements

### Requirement: Manual mode and commands have functional semantics
`manual` SHALL be state distinct from `autoCooling`. While manual mode is active, autonomous `aili_compact` calls SHALL fail unless the current turn has one unused matching `ManualCompactPermit` created by `/aili-compact compress [focus]`. That permit SHALL be scoped to session, branch, epoch, command request, and turn; it SHALL authorize at most one semantic compact attempt and SHALL be consumed by success, failure, conflicting completion, turn completion, or lifecycle invalidation. It SHALL be a different type from `NativeOnlyCompactPermit` and the permits MUST NOT satisfy each other.

Commands SHALL have these bounded semantics:

- `context [offset] [limit]` returns current epoch, paged refs/candidates, active blocks and policy; defaults 0/32, limit 1..64.
- `stats` returns distinct current-session/current-branch transaction/block/saving/cache and recovery counters without raw content.
- `sweep [limit]` uses default 8 and range 1..16, appending at most one all-or-nothing grouped cool transaction; no candidate appends nothing.
- `manual [on|off]` reports/toggles dedicated manual state without changing `autoCooling`.
- `compress [focus...]` creates one matching semantic permit and starts one short user-visible agent turn only when no conflicting/busy trigger exists. It SHALL call `ctx.compact()` zero times.
- `rescue` schedules deterministic-first recovery and calls public fire-and-forget `ctx.compact()` exactly once when idle. It SHALL call `sendUserMessage()` zero times.
- `rescue native` schedules native-only recovery, creates one matching one-use `NativeOnlyCompactPermit`, and calls `ctx.compact()` exactly once when idle. It SHALL call `sendUserMessage()` zero times.
- `rescue status` is bounded/read-only and SHALL call neither `ctx.compact()` nor `sendUserMessage()`.
- `decompress <block...>` and `recompress <block...>` accept 1..16 refs all-or-nothing. Direct human controls MAY deactivate/reactivate eligible existing current-epoch blocks but SHALL NOT create summaries or revive archived/GC blocks.

Pi `/compact` remains a host command, is never given an AILI native-only permit, and follows deterministic-first/undefined hook behavior when AILI is enabled. Invalid/unsupported arguments and rejected busy requests SHALL append no state and SHALL NOT start a provider request or compact invocation.

#### Scenario: Model compresses in manual mode without a trigger
- **WHEN** manual mode is active and no matching unused semantic permit exists
- **THEN** `aili_compact` returns an error without a transaction

#### Scenario: Compress permit cannot authorize native rescue
- **WHEN** a semantic permit is pending and a manual compaction hook arrives
- **THEN** it does not select native-only behavior or count as a rescue request

#### Scenario: Rescue avoids a normal agent request
- **WHEN** `/aili-compact rescue` is accepted while idle
- **THEN** one `ctx.compact()` call and zero `sendUserMessage()` calls occur

#### Scenario: Native rescue is one-use
- **WHEN** `/aili-compact rescue native` is accepted
- **THEN** only its exact next matching manual hook bypasses deterministic planning and every later hook has no such permission

#### Scenario: Rescue status is read-only
- **WHEN** status is requested in any coordinator state
- **THEN** bounded state is returned without Session mutation, provider request, or compact invocation

#### Scenario: User recompresses an eligible block
- **WHEN** `/aili-compact recompress` names a current-epoch block previously deactivated by explicit decompression
- **THEN** one append-only control reactivates that existing block and no new summary is created

### Requirement: Configuration and diagnostics fail safely
The component SHALL default to enabled with global < project < session precedence. Objects SHALL deep-merge; scalars replace earlier values; project configurable arrays replace global arrays before deduplication; hard protections are unioned afterward. The normative config keys/defaults SHALL be:

- booleans: `enabled=true`, `manualMode=false`, `autoCooling=true`, `cachePanel=true`, `strategies.dedupe.enabled=true`, `strategies.purgeErrors.enabled=true`, `protection.protectUserMessages=false`, `protection.protectTags=false`, `subagents.enabled=false`, `experimental.customPrompts=false`;
- compression: `compress.mode=range`, `summaryMaxChars=6000` (256..10000), `summaryHardMaxChars=10000` (1000..12000 and at least normal), `minSourceChars=5000` (0..100000), `minSavingsChars=1000` (0..50000);
- protection: `recentUserMessages=2` (2..20), `tools=[]` and `fileGlobs=[]`, each at most 64 before hard-set union;
- purge/nudges: `graceTurns=4` (1..50), min/max/emergency context percentages `45/55/98` with increasing order, `frequencyTurns=5` (1..50), `iterationThreshold=15` (1..100), `minGrowthRatio=0.45` (0..1), `minGrowthChars=5000` (0..100000);
- GC: `promotionSurvivals=5` (1..100), deprecated `maxBlockAge=15` (1..1000), `maxOldSummaryChars=3000` (256..10000), `majorThresholdPercent=100` (90..100);
- checkpoint: `mode=hybrid`, `deterministic=true`, `nativeFallback=true`, `autoRescue=true`.

`maxBlockAge` SHALL parse but be a no-op and emit bounded `config-deprecated:maxBlockAge`; it MUST NOT deactivate state. Stable checkpoint mode SHALL accept only `hybrid`. `deterministic=false` SHALL select native-only fallthrough. `nativeFallback=false` SHALL be rejected as `config-invalid-unsafe-checkpoint` and effective native fallback SHALL remain true. `autoRescue` SHALL control proactive idle scheduling only; it MUST NOT disable explicit rescue, Pi `/compact`, or overflow fallthrough.

Unknown keys, invalid JSONC, invalid type/range, invalid threshold order, or invalid checkpoint values SHALL produce bounded `config-*` diagnostics and contribute no invalid value. AILI SHALL NOT create, migrate, or modify config/prompt files.

New bootstrap/refresh SHALL NOT add or refresh `compaction.enabled=false`. It SHALL preserve unrelated settings and an existing unmarked false. Runtime/doctor SHALL not infer ownership of old false bytes. `off` SHALL return context input unchanged, suppress AILI guidance, and return exact undefined from every compaction hook without deleting journal state. It SHALL NOT change Pi settings. Manual Pi `/compact` remains host-owned even when AILI is off or automatic host compaction is false. `restore-all` SHALL deactivate current-epoch blocks and disable auto cooling.

Doctor health SHALL inspect reducer, repair, reference, projection, recap, cache, prompt, checkpoint planner, coordinator, epoch, and permitted settings evidence. It SHALL expose exactly:

- `pressureStage`: owned by pressure reducer; one of `NORMAL`, `PRESSURE`, `FORCE_SEMANTIC`, `CHECKPOINT_REQUIRED`, `OVERFLOW_RECOVERY`, or `Unverified`;
- `headroomTokens`: owned by usage estimator; nonnegative integer with source `observed`, `fallback`, or `Unverified`;
- `checkpointCoordinatorState` and `checkpointInFlight`: owned by coordinator;
- `deterministicCheckpointEligible`: owned by last exact attempt; `eligible`, `ineligible:<bounded-code>`, `not-evaluated`, or `Unverified`;
- `nativeAutomaticFallback`: owned by permitted settings inspection; `enabled`, `disabled-config`, or `Unverified-effective`;
- `nativeAutomaticFallbackProvenance`: `explicit-user`, `prospective-marker`, `unknown`, or `Unverified` without backfilled provenance;
- `legacyRepairStatus`: owned by repair planner/reducer, with eligible/repaired, blocked-by-parent, digest-mismatch, explicit-user-state, old-epoch, ambiguous-lineage, and other-ineligible counts and no source text;
- `lastRecoveryErrorCode`: one bounded code from the owning subsystem;
- `deterministicCheckpointCount`, `nativeFallbackCount`, `rescueCount`, and `repairTransactionCount`: monotonic bounded current-session counters owned by coordinator/epoch/reducer.

Native fallback count SHALL increment only when persisted origin is observable; unknown origin SHALL remain `Unverified`. Effective CLI/runtime overrides and unknown extension order SHALL remain `Unverified`, never inferred PASS. UI-only width, animation, and rendered strings SHALL be excluded from provider cache identity. Registration alone, old exclusive cancellation, or a settings value alone MUST NOT make doctor healthy.

#### Scenario: User disables AILI Compact
- **WHEN** `/aili-compact off` succeeds and any host compaction reason arrives
- **THEN** projection returns exact input, guidance is absent, prior transactions remain metadata, and the hook returns undefined without planning or cancellation

#### Scenario: Existing automatic setting is false
- **WHEN** permitted inspection observes unmarked `compaction.enabled=false`
- **THEN** no setting is changed, doctor reports `disabled-config` and provenance `unknown`, and docs distinguish unavailable automatic events from available host manual compact

#### Scenario: Unsafe checkpoint config is supplied
- **WHEN** native fallback is false or stable mode is unsupported
- **THEN** the value is rejected, a bounded diagnostic is emitted, and effective native fallthrough remains enabled

#### Scenario: Projection or repair invariant fails
- **WHEN** doctor observes a current reducer, repair, reference, or projection invariant error
- **THEN** health is ERROR with bounded evidence rather than PASS-by-registration

#### Scenario: Effective setting cannot be observed
- **WHEN** an override is outside permitted public inspection
- **THEN** doctor reports `Unverified-effective` rather than guessing automatic fallback availability
