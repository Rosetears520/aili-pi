# Context: fix-aili-compact-recovery-deadlock

## Delivery Position

- Target: independently publishable `v0.1.14`, PR1/P0 safety repair.
- Host baseline: official Pi `0.82.1`; production entry is the registered Extension running inside Pi `AgentSession`, not a test-only wrapper.
- Accepted review status entering this revision: `REVISE`. All acceptance boxes remain unchecked.
- Mandatory successor: `redesign-aili-compact-lifecycle` / `v0.2.0` must inherit REC-001 through REC-008 and this repair/checkpoint wire contract.

## Base Contract Read

The reversible base is `openspec/changes/add-reversible-context-compression/specs/reversible-context-compression/spec.md`. This delta uses its exact headings. It removes only `AILI Compact exclusively owns compaction and GC`, and modifies only `Manual mode and commands have functional semantics` and `Configuration and diagnostics fail safely`. Append-only history, deterministic branch replay, digest authority, atomic nested state, exact fail-open projection, explicit decompression, archived query-only behavior, cache identity, and bounded search remain in force.

## User-Approved P0 Decisions

### P0-1 — Standalone repair wire contract

Repair is not a v2 semantic/control variant. It is standalone `aili.compact.repair.v1`, containing 1..16 evidence blocks in deterministic source/replay order. Branch ID, epoch ID, each evidence ID, and transaction ID are deterministic canonical hashes. Planning partitions eligible and ineligible candidates before append. A transaction never contains an ineligible item; replay revalidates the entire transaction and applies all evidence atomically or none.

### P0-2 — Exact compaction return contract

`session_before_compact` returns only a fully validated `{ compaction: CompactionResult }` envelope or JavaScript `undefined`. It never returns `{cancel:true}`, partial output, a false success, or an invalid envelope. Attempt identity and cache are deterministic and scoped to the exact branch/epoch/preparation/reason/policy input.

### P0-3 — Native-only permit and coordinator

`rescue native` creates one `NativeOnlyCompactPermit`. It is consumed by exactly one matching manual event and cannot affect threshold, overflow, ordinary `/compact`, another branch, another epoch, or a later request. The session coordinator owns scheduling, invocation, in-flight adoption, callback/event races, settlement, terminal outcome, and lifecycle cleanup.

### P0-4 — Recovery surface and evidence

Doctor fields have exact owners and bounded/Unverified semantics. Commands distinguish model semantic compression, one-turn user-authorized semantic compression, deterministic-first rescue, native-only rescue, read-only rescue status, and Pi-native `/compact`. Release requires fake and production-entry `AgentSession` overflow evidence, `ctx.compact()` once/`sendUserMessage()` zero assertions, host behavior with `enabled=false`, repair/reload/tree/fork evidence, deterministic batching/atomic rejection/concurrency, and live Pi gates.

## Host Facts and Boundaries

- `ExtensionContext.compact(options?)` returns `void`, accepts `onComplete`/`onError`, enters Pi's manual compaction path, and requires model/auth availability.
- Manual `/compact` and `ctx.compact()` are not gated by effective `compaction.enabled`; threshold/overflow checks are gated and may never reach extensions when false.
- `session_before_compact` supports custom compaction, cancellation, or undefined. AILI uses only custom or undefined.
- A persisted `CompactionEntry.id` is the epoch boundary. On success Pi reloads summary plus retained tail; overflow may retry only under host `willRetry` behavior.
- The public event has no request token. Native-only matching therefore uses the coordinator's next-event ordinal plus exact session/branch/epoch/manual tuple and one-use state; lifecycle or a conflicting event invalidates the permit rather than broadening it.
- Unknown later extension handlers, effective CLI/runtime setting overrides, provider availability/quality, and live event ordering remain `Unverified` until named evidence exists.

## Recovery Invariants

- **REC-001:** AILI owns reversible projection and deterministic planning; Pi owns final native checkpoint/overflow recovery.
- **REC-002:** AILI never unconditionally cancels manual `/compact`.
- **REC-003:** threshold returns one validated deterministic envelope or undefined.
- **REC-004:** overflow returns one validated deterministic envelope or undefined; no cancellation branch.
- **REC-005:** AILI disabled returns undefined for every event and performs no checkpoint planning/mutation.
- **REC-006:** semantic/planner/quality failure cannot block Pi fallback; rescue requires no successful normal agent request.
- **REC-007:** age alone never deactivates a top-level semantic block.
- **REC-008:** Pi JSONL/tree stays append-only and no duplicate raw-history sidecar exists.

## Superseded and Preserved Behavior

Superseded: exclusive cancellation, forced false settings writes, age-only top-level deactivation, and diagnostics that treat those behaviors as healthy. Preserved: every other accepted base requirement, including direct explicit user decompression and exact fail-open behavior. Existing ambiguous false remains byte/value-preserved; this is migration safety, not ownership.

## DEFINE/Authorization State

These artifacts define proposal, context, design, two capability deltas, tasks, test plan, migration, and release gates. BUILD is blocked until explicit human acceptance and separate authorization. Production/dependency/version/lock/settings/HOME/Git/network/release mutation is not authorized.
