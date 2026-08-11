# MiMo-Style Dynamic Context Recovery Proposal

## Status

Draft for DEFINE. The user selected MiMoCode's dynamic context-recovery route rather than a custom fixed 70/80/90 policy. This document specifies the proposed Pi adaptation. It does not authorize runtime, configuration, dependency, lockfile, or release changes.

## Goal

Keep normal ACP-inspired range/block compression model-driven. Independently, use MiMoCode's window-size-dependent checkpoint ladder to prepare durable recovery state before pressure. At the actual reserved safe budget or a provider overflow, rebuild from that checkpoint first and use bounded Pi-native compaction only when a rebuild is unavailable.

## Reference boundary

- Reference project: [XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code)
- Reviewed local research copy: `main` commit `eef8206d80441117a28b0c208730c9c375c7be04`
- Relevant evidence: `packages/opencode/src/session/overflow.ts`, `session/prune.ts`, `session/compaction.ts`, `session/checkpoint.ts`, and `config/config.ts`

No MiMoCode source, prompts, configuration, state schema, or dependencies are to be copied. The proposal extracts only the architectural pattern.

## What MiMoCode actually does

MiMoCode does **not** make a semantic summary directly at 90% as its first action.

1. It derives a safe usable window from the provider input limit or configured reduced working budget, after reserving room for output and compaction.
2. It schedules background checkpoint writers at configured percentage thresholds. For long-context models, the default ladder includes 90%.
3. Its configured context budget can only lower the provider window; it cannot increase the provider's accepted limit.
4. When compaction is needed, it first tries to rebuild from a successful checkpoint while preserving a bounded recent tail.
5. Only when no usable checkpoint exists or the checkpoint writer failed does it fall back to a direct compaction path.
6. Its direct compaction scopes history since the previous compaction boundary, keeps recent user turns within a token budget, and marks the result as a new boundary.

The useful pattern is therefore: **prepare durable recovery before pressure, rebuild first, compact only as a bounded fallback, and never use the raw model window as the trigger without reserves.**

## Proposed Pi adaptation

### Safe working budget

Compute one session-local working budget for every provider request:

```text
hardInputLimit = Pi getContextUsage().contextWindow
outputReserve = min(model.maxTokens, 20_000)
recoveryReserve = min(model.maxTokens, 20_000)
effectiveLimit = hardInputLimit
safeBudget = effectiveLimit - outputReserve - recoveryReserve
recoveryThreshold = safeBudget
checkpointCeiling = safeBudget - 13_000
```

Rules:

- Unknown, zero, invalid, or reserve-exhausted limits disable automatic recovery rather than guessing.
- Pi exposes one context-window value rather than a separate provider input cap. Therefore it follows MiMoCode's combined-window branch: reserve bounded output room and recovery room separately, each capped at 20K.
- This DEFINE delta exposes no new user configuration surface. A future per-model reduced working budget is separate scope; it would only lower the provider limit.
- Thresholds above `checkpointCeiling` are reduced once to that ceiling, and later over-ceiling thresholds are dropped; a non-positive ceiling disables checkpointing.
- Output, recovery, and checkpoint reserves must remain explicit diagnostics, not be hidden inside the 90% number.
- The observed provider-context token count is authoritative when Pi exposes it; any estimate is a clearly marked fallback and cannot silently authorize a destructive transition.

### MiMo checkpoint ladder

The checkpoint writer uses the effective working window, not a fixed percentage selected by AILI:

| Effective working window | Default thresholds |
|---|---|
| `< 25K` | Disabled |
| `25K–200K` | `20%`, `40%`, `60%`, `80%` |
| `> 200K–500K` | `10%` through `90%` in 10% increments |
| `> 500K` | `5%` through `90%` in 5% increments |

Each newly crossed threshold starts at most one background writer per session. A writer that is running prevents a duplicate start; after it settles, the newest crossed boundary may start another writer. A checkpoint is usable only when its persisted content and source boundary commit together. Failed writers leave the last valid checkpoint and watermark intact.

The final 90% threshold exists only for windows above 200K. It is the last proactive checkpoint opportunity, **not** a direct request for a semantic summary or immediate native compaction.

### MiMo pressure pruning

Separately from checkpoint scheduling, pressure is `normal` below 50% of the safe budget, `low` from 50% to below 70%, `high` from 70% to below 85%, and `critical` at or above 85%. A future Pi implementation may use these stages only to consider bounded old tool-output trimming when cache freshness is known. It must not delete the protected tail, first user message, complete tool-call/result pairs, active-block descriptors, or source-proof ledger.

### Recovery sequence at the safe budget or overflow

1. **Re-observe and lock.** Re-read current usage, effective limit, reserves, session/branch identity, and the active block graph. A per-session pressure cycle prevents parallel or repeated forced recovery.
2. **Prefer checkpoint rebuild.** If a fresh, successfully persisted checkpoint covers the current recovery boundary, insert one Pi-visible rebuild boundary that contains the checkpoint, the active-block index, and only the configured recent raw tail.
3. **Preserve ACP-style blocks.** The rebuilt provider request uses the active-block graph and protected raw tail. It does not restore every covered raw message or every historical full summary.
4. **Fallback only when rebuild is unavailable.** If no valid checkpoint can be used, invoke Pi's existing bounded checkpoint/native-compaction owner under a dedicated recovery reason. Its output must obey the existing native summary cap and produce an auditable result.
5. **Fail closed.** If checkpoint rebuild and bounded fallback both fail, return a visible recovery diagnostic and do not dispatch another oversized ordinary provider request in the same pressure cycle.
6. **Re-arm from the rebuilt state.** A verified rebuild resets the whole threshold ladder for its new boundary. A failed recovery cannot spin indefinitely in the same context position. If the final checkpoint writer failed transiently, its only retry gate is one normal ladder step of additional growth, clamped to the checkpoint reserve; deterministic, unclassified, and still-in-flight failures do not re-arm a retry.

## Relationship to the ACP-style route

The normal and forced paths have different jobs:

| Concern | Normal ACP-inspired route | MiMo-style recovery |
|---|---|---|
| Trigger | Model judges that a visible range is no longer needed. | Runtime reaches the reserved safe budget or observes provider overflow. |
| Summary author | Model submits a range/block summary. | Prefer previously persisted checkpoint; otherwise use the existing Pi recovery owner. |
| State change | Add/consume active blocks. | Insert one recovery boundary or native checkpoint result. |
| Context view | Protected raw tail plus active summaries. | Same view after rebuild; no all-history reconstruction. |
| Failure | Reject stale/invalid selection without mutation. | Do not send another over-budget ordinary request; surface a bounded recovery failure. |

This separation removes the need to force T2/T3/restill economics to serve as overflow recovery. It also keeps model-driven semantic compression distinct from checkpoint-based continuity preservation.

## Safety invariants

1. The first user message, protected recent tail, and complete tool-call/result pairs remain provider-valid after rebuild.
2. Checkpoint contents, active-block index, and recovery boundary bind to the same session, branch, and source revision.
3. A forced recovery is idempotent within one pressure cycle; duplicate callbacks, stale callbacks, and branch/epoch switches do not append a second boundary.
4. A recovery checkpoint becomes usable only after its write is complete and its source boundary is verified.
5. A failed checkpoint writer does not overwrite the last usable checkpoint.
6. No automatic fallback may silently restore unlimited raw history, every active full summary, or unbounded tool output.
7. Recovery artifacts contain no provider credentials, raw provider payloads, or unredacted private session dumps.

## Verification plan

The revised test plan should include:

1. Each model-window category yields MiMo's exact default checkpoint ladder, including a 90% threshold only for windows above 200K.
2. Pi's sole context-window value applies MiMo's combined-window reserve branch: separate 20K-capped output and recovery reserves, plus a 13K checkpoint ceiling, never an unreserved 90% trigger.
3. Crossing 90% starts or confirms final checkpoint preparation; it does not issue a direct summary or compaction request.
4. Reaching the reserved safe budget or observing provider overflow uses a fresh checkpoint rebuild first.
5. A fresh checkpoint rebuild preserves the first user message, configured tail, active-block representations, and complete tool pairs.
6. A stale, missing, or failed checkpoint selects the bounded Pi fallback exactly once.
7. A fallback failure blocks the next oversized request and produces a bounded diagnostic rather than a loop.
8. A verified rebuild resets the threshold ladder and allows later normal work.
9. Search, recap, and decompression still operate on the active-block graph after a rebuild.
10. A branch/epoch/session change invalidates a pending recovery cycle and cannot consume its callback.

## Decisions still required

Before implementation, DEFINE must settle:

1. What constitutes a fresh enough checkpoint and how its source revision is bound.
2. Whether old tool-output pruning is enabled and which tools are protected.
3. The exact user-visible status/diagnostic contract for checkpoint preparation, rebuild, fallback, and failure.
4. The historical fixed hierarchy, its tier economics, and its 50-transaction fixture are retired from new writes and release evidence; legacy v3 records remain readable for source proof and rollback only.

## Recommendation

Adopt MiMoCode's **dynamic checkpoint ladder** and rebuild-first recovery order. Treat 90% as the final proactive checkpoint stage for long-window models, not as a forced model-authored semantic-summary call. Recover only at the reserved safe budget or actual overflow; use the existing Pi-native recovery owner only when no verified checkpoint rebuild is available. This retains ACP-style active blocks for normal compression and Pi ownership for recovery.
