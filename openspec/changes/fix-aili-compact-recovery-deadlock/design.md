## Context

The released exclusive-owner behavior can prevent both another semantic model turn and Pi checkpoint/retry. Age GC can also reactivate raw source. Official Pi 0.82.1 exposes public fire-and-forget `ctx.compact(options)` and `session_before_compact`. The design must work at the production Extension entry inside `AgentSession`, preserve append-only history, and fall through rather than invent recovery success.

## Goals / Non-Goals

**Goals:** guarantee REC-001..REC-008; repair eligible legacy state before branch projection; make planning, batching, replay, permissions, and races deterministic; expose bounded operational truth; require real Pi evidence.

**Non-goals:** no Pi fork, non-public SessionManager call, raw-history sidecar, history rewrite, provider-quality claim, dependency/version/lock/settings mutation during DEFINE, or P1 indexing/tiering.

## Decisions

### 1. Standalone `aili.compact.repair.v1` schema

Repair entries use a standalone custom envelope, never a semantic v1/v2 transaction. The exact fields are:

- `type`: exact literal `aili.compact.repair.v1`;
- `id`: `rpr_` plus SHA-256 of the canonical identity payload;
- `branchId`: `br_` plus SHA-256 of ordered current-branch source-entry IDs;
- `epochId`: latest `CompactionEntry.id`, or the deterministic root epoch;
- `evidence`: 1..16 evidence objects in strict deterministic order.

Each evidence object has exactly `evidenceId`, `blockId`, nonempty ordered `sourceEntryIds`, `sourceDigest`, `gcEntryId`, nonnegative integer `gcReplayOrdinal`, `lineageDigest`, and `laterStateDigest`; unknown or optional fields are invalid. Canonical JSON is UTF-8 with sorted object keys, preserved array order, and decimal integers.

The root epoch hashes the schema tag, session ID, and root branch prefix. An evidence ID hashes the schema tag, branch ID, epoch ID, block ID, ordered source IDs, source digest, GC entry/ordinal, lineage digest, and later-state digest. A transaction ID hashes the schema tag, branch ID, epoch ID, and ordered evidence IDs. Evidence order is first-source replay ordinal, block replay ordinal, then block ID.

Planning assigns every candidate exactly one disposition before append. Only eligible evidence is grouped into deterministic contiguous batches of at most 16. Ineligible items never enter a transaction. Replay validates shape, bounds, canonical identities/order, exact branch/epoch, provenance, all digests, later state, lineage, within-batch and active overlap, and projected unique coverage. It reduces into a temporary state and commits all evidence or none. A duplicate ID is a no-op only for canonically identical content; an ID/content mismatch rejects. Concurrent planners recheck fresh replay state; a stale batch rejects atomically and is never silently shrunk.

### 2. Eligibility partition and branch activation guard

A block is eligible only when it is semantic, current epoch, inactive for exact reason `gc`, backed by complete current-branch protocol atoms with matching digest, uncovered by active parent/peer state, acyclic and lineage-compatible, and has no later explicit decompress, restore-all, recompress, nested replacement, checkpoint/epoch, missing, or ambiguous state.

Disposition precedence is: `eligible`, `blockedByParent`, `digestMismatch`, `explicitUserState`, `oldEpoch`, `ambiguousLineage`, `otherIneligible`. Counts contain no source text.

`session_start`, `session_tree`, and fork/leaf activation use this guard: snapshot selected branch; replay semantic and repair entries; partition and append eligible repair batches when permitted; replay resulting branch; reduce, project, and validate; only then publish branch state, catalog, coordinator tuple, and doctor current-branch values. No provider projection can observe an intermediate state. Failure activates exact raw fail-open projection with a bounded diagnostic. A branch change during append abandons activation and restarts for the newly selected branch.

### 3. Deterministic planner and attempt cache

Attempt identity is SHA-256 over the `checkpoint-attempt-v1` tag and exact session ID, branch ID, epoch ID, reason, `willRetry`, preparation digest, branch-entry digest, replay-state digest, effective checkpoint-config digest, and policy. The preparation digest includes exact first-kept ID, tokens-before, prior-summary values, and every public preparation value used by planning. Policy is deterministic-first or native-only.

The session-memory cache is keyed by attempt ID and stores one immutable terminal result: eligible envelope or ineligible code. It never stores exceptions, partial output, source text, display state, callbacks, or cross-branch/epoch/config results. A hit rechecks tuple and digests and returns a clone.

`planMajorGc()` is pure for those inputs. It proves unique first-kept identity, whole protocol-atom cut, exactly-once semantic coverage by active current-epoch blocks, no stub-only coverage, exact digests, safe acyclic lineage, deterministic source order, prior summary before AILI summaries, retained tail excluded from summary, and section/total bounds. Failed proof is ordinary ineligibility.

The hook catches all planner/validation failures. Its only values are exactly `{ compaction: validatedCompactionResult }` or JavaScript `undefined`; cancellation, null, empty/partial/error envelopes are forbidden.

| Effective condition | manual | threshold | overflow |
|---|---|---|---|
| AILI disabled | undefined, no plan/cache mutation | same | same |
| matching native-only permit | consume; undefined | cannot match | cannot match |
| deterministic disabled | undefined | undefined | undefined |
| eligible deterministic-first | valid envelope | valid envelope | valid envelope |
| ineligible, invalid, or throw | undefined | undefined | undefined |

Ordinary Pi `/compact` has no permit and is deterministic-first when AILI is enabled.

### 4. One-use matching `NativeOnlyCompactPermit`

A native rescue arms one permit containing `permitId`, `requestId`, exact session/branch/epoch tuple, expected manual reason, reserved next before-compact ordinal, and state `armed`. The ordinal is reserved atomically immediately before the sole `ctx.compact()` call.

The permit matches only while its coordinator request is current and the next observed hook has the exact tuple, manual reason, and ordinal. Matching marks it consumed before the hook returns undefined. Threshold/overflow cannot consume it. A nonmatching manual hook, invocation throw, callback error/completion, `session_compact`, terminal `agent_settled`, start/replacement/shutdown, tree/fork/leaf change, epoch change, or coordinator invalidation marks it invalid. It is not persisted, cached, reused, or applied to ordinary `/compact`.

### 5. Full checkpoint coordinator and cleanup

One coordinator belongs to the active session tuple and monotonic request serial. States are `idle`, `scheduled`, `invoking`, `inFlight`, `awaitingEpoch`, and terminal `succeeded`, `failed`, or `invalidated`; terminal details become bounded telemetry before returning to idle. Sources are rescue, auto-rescue, and external; policies are deterministic-first and native-only.

- Idle scheduling atomically enters scheduled; re-entry is rejected.
- Invocation enters invoking, creates any permit, calls `ctx.compact(options)` exactly once, calls `sendUserMessage` zero times, then enters inFlight unless a synchronous callback already terminalized it.
- Each hook gets a monotonic ordinal. An unowned event is adopted as external inFlight before planning, suppressing duplicate auto-rescue.
- `onComplete` cannot fabricate success: it enters awaitingEpoch unless the matching new CompactionEntry is already observed.
- `session_compact` with a new exact epoch is authoritative; callback/event races terminalize once.
- `onError` or invocation throw fails once and clears permit/in-flight state. Stale callbacks only increment a bounded stale count.
- An external event with no new epoch clears as failed at matching `agent_settled`; its pressure cycle records an attempt and does not auto-loop.
- Start, replacement, shutdown, tree/fork/leaf change, and epoch change invalidate nonterminal state, permit, attempt cache, pressure tuple, and pending semantic trigger before new-branch activation.

### 6. Pressure, checkpoint, and epoch

Use `ctx.getContextUsage()` when available, otherwise a conservative message estimate. `hardCheckpointAt` is context window minus host reserve; `forceSemanticAt` is hard boundary minus semantic-attempt budget; `pressureAt` subtracts that budget once more, all clamped at zero. Budget includes discovery input, summary output, tool protocol, recap projection, and continuation safety. Unknown values use conservative upper bounds.

Stages are `NORMAL`, `PRESSURE`, `FORCE_SEMANTIC`, `CHECKPOINT_REQUIRED`, and `OVERFLOW_RECOVERY`. A cycle is session/branch/epoch/serial plus semantic-attempted, checkpoint-scheduled, checkpoint-in-flight, and checkpoint-attempted flags. It allows at most one semantic attempt and checkpoint invocation. Reset needs a persisted epoch or verified usage at least one semantic budget below the force boundary. Programmatic compact runs only from a user command or idle `agent_settled`, never active provider/tool handling.

A persisted custom or native `CompactionEntry.id` becomes the epoch. Reload rebuilds state/catalog. Prior blocks derive inactive epoch/query-only state and cannot project, repair, decompress, recompress, or satisfy coverage. Exact branch source search remains available.

### 7. Commands and host setting behavior

| Surface | Meaning | New agent turn | AILI `ctx.compact` calls | Hook policy |
|---|---|---:|---:|---|
| model `aili_compact` | semantic transaction | none beyond current call | 0 | none |
| `/aili-compact compress [focus]` | one matching manual semantic permit | exactly 1 | 0 | none |
| `/aili-compact rescue` | checkpoint recovery | 0 | exactly 1 | deterministic-first |
| `/aili-compact rescue native` | native generation once | 0 | exactly 1 | native-only |
| `/aili-compact rescue status` | read-only recovery status | 0 | 0 | none |
| Pi `/compact` | host manual checkpoint | host-defined | 0 | deterministic-first; no native permit |

The semantic manual permit and native-only permit are distinct and cannot satisfy each other. Rescue works when automatic host compaction is configured false because manual compact bypasses that flag. Under false, host threshold/overflow hooks normally do not occur; AILI never claims they do. If delivered, the non-cancelling matrix applies. AILI disabled returns undefined and performs no AILI rescue; Pi `/compact` remains host-owned.

### 8. Configuration and exact doctor ownership

Stable checkpoint defaults are mode hybrid, deterministic true, native fallback true, and auto-rescue true. Only hybrid is accepted. A false native fallback value is rejected and effective fallback remains true. Auto-rescue controls proactive idle scheduling only. Bootstrap never writes false; ambiguous existing false is preserved.

| Doctor field | Owner | Exact value domain |
|---|---|---|
| `pressureStage` | pressure reducer | five stages or `Unverified` |
| `headroomTokens` | usage estimator | nonnegative integer and source `observed`, `fallback`, or `Unverified` |
| `checkpointCoordinatorState` | coordinator | coordinator state enum |
| `checkpointInFlight` | coordinator | boolean |
| `deterministicCheckpointEligible` | last exact attempt | `eligible`, `ineligible:<code>`, `not-evaluated`, or `Unverified` |
| `nativeAutomaticFallback` | permitted setting inspection | `enabled`, `disabled-config`, or `Unverified-effective` |
| `nativeAutomaticFallbackProvenance` | setting inspection | `explicit-user`, `prospective-marker`, `unknown`, or `Unverified` |
| `legacyRepairStatus` | repair planner/reducer | eligible/repaired and each disposition count |
| `lastRecoveryErrorCode` | owning subsystem | bounded code only |
| recovery counters | coordinator/epoch/reducer | deterministic checkpoint, native fallback, rescue, and repair transaction counts |

Native fallback count increments only for observably native persisted compaction; unknown origin is not guessed. UI-only width, animation, and rendered strings do not enter provider cache identity.

### 9. Settings migration

Bootstrap preserves absent, true, false, malformed, and unrelated settings under existing atomic behavior but never adds or refreshes false. Unmarked false remains unknown provenance. Documentation gives the exact user-owned change to enable automatic threshold/overflow and states that manual `/compact` and public manual compact are independent of that setting.

## Migration Plan

See `migration.md`. Add readers before writers; guard repair activation; land deterministic-or-native behavior atomically; rewrite no prior entry. Rollback preserves new entries but may require AILI-off/no-extensions host rescue if an old binary restores cancellation.

## Risks / Trade-offs

- Pi supplies no public request token; strict next-event matching fails closed rather than leaking native-only policy.
- Native checkpoint can fail due to provider availability; report failure truthfully and retain explicit rescue.
- Unknown later handlers can cancel; live composition is a gate and AILI claims only its own behavior.
- Conservative pressure can checkpoint early, never late.
- Concurrent repair may reject stale batches; reloading/replanning is deterministic, while partial application is forbidden.

## Open Questions

No product decision remains open. Live overflow reproducibility, handler ordering, and unobservable setting overrides remain `Unverified` until their gates run.
