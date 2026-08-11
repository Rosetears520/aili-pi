## Why

`@rosetears/aili-pi@0.1.13` can deadlock a full session: it installs Pi automatic compaction as disabled, cancels Pi manual/threshold/overflow compaction, and may require another model turn to create semantic compression. Age-based GC can separately deactivate a semantic block and expose its raw source again. The independently releasable `v0.1.14` P0 repair must restore a production recovery path without rewriting Session history or depending on another successful normal agent turn.

## What Changes

- Replace exclusive compaction ownership with deterministic-first cooperation: AILI may provide one validated Pi compaction envelope; otherwise it returns exactly `undefined` and Pi owns native checkpoint/retry.
- Define deterministic compaction attempt identity, per-attempt cache behavior, complete eligibility validation, and an exact return matrix for manual, threshold, overflow, disabled mode, planner errors, and native-only rescue.
- Introduce standalone `aili.compact.repair.v1` append-only transactions containing 1..16 ordered evidence blocks with deterministic branch, epoch, evidence, and transaction identities. Planning partitions eligible from ineligible blocks; replay validates and applies each transaction atomically.
- Run repair replay/reduction/projection before branch activation on `session_start`, `session_tree`, and fork activation. Preserve explicit user state, branch isolation, current epoch, digests, and unique coverage.
- Remove age-only top-level deactivation. Keep `maxBlockAge` parseable as a deprecated no-op.
- Add a session-scoped checkpoint coordinator, a one-use matching `NativeOnlyCompactPermit`, lifecycle/race cleanup, token-headroom pressure cycles, and public rescue commands. Each rescue invokes `ctx.compact()` exactly once and `sendUserMessage()` zero times.
- Stop new bootstrap/refresh runs from writing `compaction.enabled=false`. Preserve ambiguous existing false values. AILI disabled always falls through; manual `/compact` and public manual rescue remain host-available even when automatic host compaction is disabled.
- Define exact doctor recovery fields and ownership, plus the command matrix for model `aili_compact`, `/aili-compact compress`, rescue, rescue-native, status, and Pi-native `/compact`.
- Require fake-provider, production-entry `AgentSession` overflow/retry, copied-session repair, reload/tree/fork, concurrency, and separately authorized live Pi 0.82.1 evidence before release.

## Capabilities

### New Capabilities

- `aili-compact-checkpoint-recovery`: repair schema/replay, deterministic checkpoint validation, native fallthrough, coordinator/permit, rescue, pressure, epoch transition, diagnostics, migration, and release evidence.

### Modified Capabilities

- `reversible-context-compression`: remove the exact exclusive-owner requirement; modify the exact `Manual mode and commands have functional semantics` and `Configuration and diagnostics fail safely` requirements while preserving all other accepted reversible-context invariants.

## Impact

- Future BUILD scope: `src/runtime/aili-compact/`, Extension lifecycle wiring, bootstrap/settings merge, tests/fixtures, docs, doctor, evidence validators, and release notes.
- Compatibility: v1/v2 semantic transactions and Pi JSONL/tree remain append-only. Repair uses a standalone additive envelope and creates no raw-conversation sidecar.
- Settings: absent settings retain Pi defaults; an unmarked explicit false is preserved and diagnosed as unknown provenance.
- Release: `v0.1.14` remains blocked on accepted DEFINE artifacts, sequential merged-spec validation, BUILD authorization, fresh automated evidence, and separately authorized live gates.
- Authorization: this DEFINE change authorizes no production, dependency, lockfile, version, settings/HOME, Git, network, publish, or release mutation.
