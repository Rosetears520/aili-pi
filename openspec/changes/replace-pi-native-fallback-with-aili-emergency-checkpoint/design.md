# Design: Pi-Compatible AILI Emergency Checkpoint

## 1. Contract State

**State:** Revised final test plan and repository-local BUILD authorization were granted on 2026-08-02. The prior AILI-only acceptance/BUILD authorization remains superseded. BUILD proceeds only within this revised contract and its separately governed operation boundaries.

This change is layered after the reversible-compression base, `fix-aili-compact-recovery-deadlock`, and `redesign-aili-compact-lifecycle`. It preserves Pi native recovery rather than reversing those predecessor invariants.

## 2. Goals and Non-Goals

### Goals

1. Use only Pi's documented public Extension surface.
2. Prefer deterministic AILI checkpoints when complete accepted current-epoch coverage exists.
3. Preserve Pi native summary/persistence/epoch/retry as final recovery.
4. Bound proactive checkpoint scheduling to one attempt per pressure cycle.
5. Treat persisted epoch evidence as durable success and classify custom/native origin truthfully.
6. Preserve append-only history, branch/epoch/session isolation and bounded transient guidance.

### Non-Goals

- No AILI-owned provider summary request or duplicated runtime/auth transport.
- No raw-prefix model planner for `activeBlocks=0`.
- No per-provider-dispatch veto or zero-dispatch-at-90% claim.
- No synthetic continuation or exactly-once receipt claim.
- No three-retry command, AILI-only mode or HOME migration.
- No Pi fork, private API, `node_modules` modification or dependency/version change.

## 3. Public Interface Mapping

| Needed behavior | Public Pi surface | Design use |
|---|---|---|
| intercept compaction | `session_before_compact` | return complete custom envelope or `undefined` |
| request checkpoint | `ctx.compact()` | one fire-and-forget invocation at accepted idle boundaries |
| durable completion | `session_compact`/persisted entry | authoritative epoch success and origin classification |
| pressure observation | `getContextUsage()` plus conservative estimate | proactive policy/diagnostics, not dispatch veto |
| overflow continuation | `willRetry` and Pi AgentSession flow | host-owned; AILI emits no turn |
| branch/tree lifecycle | public lifecycle events | rebuild AILI state after host operation |

Low-level exported summary helpers and `ModelRuntime` are not treated as an Extension-bound active-runtime seam.

## 4. Exact Hook Arbitration

For manual, threshold and overflow, the hook has two legal outcomes:

```text
complete accepted current-epoch coverage -> { compaction: validatedEnvelope }
anything else                           -> undefined
```

“Anything else” includes AILI disabled, deterministic disabled, a matching native-only permit, `activeBlocks=0`, a coverage gap/overlap, protocol split, stale tuple/digest, quality/source mismatch, bounds failure and caught planner exception. The hook never returns `{cancel:true}`, `null`, a partial envelope or a false-success object.

AILI deterministic summary means deterministic ordering and composition of already accepted semantic summaries. It does not mean generating new summary text through a provider inside the hook.

## 5. Pressure and Proactive Scheduling

Pressure is derived from the active context window, observed usage when available, conservative fallback estimates, host reserve and semantic-attempt budget. The unrounded 90% threshold may force the policy into `CHECKPOINT_REQUIRED` and cannot be configured above 90%, but the public Extension contract does not prove a synchronous veto before every provider dispatch.

Programmatic compaction therefore runs only at user-command or idle `agent_settled` boundaries. Each `(session, branch, epoch, pressureCycle)` permits at most one semantic attempt and one checkpoint invocation. Reset requires a new persisted epoch or verified usage at least one semantic-attempt budget below the force boundary. A smaller drop, busy state, repeated settled events and stale callbacks do not create another invocation.

## 6. Coordinator and Durable Truth

The coordinator reuses the bounded states:

```text
idle -> scheduled -> invoking -> inFlight -> awaitingEpoch
     -> succeeded | failed | invalidated
```

`ctx.compact()` completion is not durable success. A matching `session_compact` with a new persisted entry is authoritative. The new entry ID becomes the current epoch, closes prior pending state and makes prior blocks query-only ancestry.

Origin is classified as:

- deterministic AILI checkpoint when the persisted event reports extension/custom origin and AILI details validate;
- Pi native checkpoint when the persisted event reports native origin;
- `Unverified` when origin cannot be safely observed.

Both custom and native checkpoints are valid recovery outcomes.

## 7. Host-Owned Retry and Continuation

Pi owns overflow retry after successful compaction. AILI records the event's `willRetry` as host-reported intent and never calls `sendMessage()` or `sendUserMessage()` to continue interrupted work. Manual and threshold checkpoints do not invent work. The contract does not elevate `willRetry` into a durable exactly-once receipt; production `AgentSession` evidence supports only the named tested sequence.

## 8. Guidance and Usage State

The provider-only suffix remains transient and bounded. It binds current session/branch/epoch/pressure identity, reports only actions executable in the current pressure/coordinator state and is never transaction/checkpoint/retry evidence. Stale or unverified identity yields status-only guidance or no suffix.

After a new epoch is persisted and before valid post-checkpoint assistant usage arrives, usage is `rebuilding`/`unknown`; old pre-checkpoint high-water values are not presented as new usage.

## 9. Commands, Configuration and Branches

- `/aili-compact rescue` performs deterministic-first public compaction once when idle.
- `/aili-compact rescue native` retains its one-use matching native permit.
- `/aili-compact rescue status` is read-only.
- Pi `/compact` remains host-owned and uses deterministic-first/undefined behavior.
- Configuration remains `mode=hybrid`, `deterministic=true`, `nativeFallback=true`, `autoRescue=true`; runtime does not write or migrate config.
- Pi owns branch/tree summary generation. AILI rebuilds branch/epoch state from public lifecycle events and fails open to exact host input if projection state is uncertain.

## 10. Risks and Evidence Limits

- Proactive pressure scheduling can reduce risk but cannot prove a zero-dispatch firewall on the current public API.
- Static declarations and fake providers cannot prove real provider tokenization, billing, transport, retry order or installed extension composition.
- Pi `0.83.0` source inspection supports API-shape compatibility only; runtime compatibility remains `Unverified` until separately run.
- If future product requirements again demand AILI-only summary ownership or synchronous pre-dispatch blocking, that is a new material DEFINE change requiring new upstream public seams.
