# Test Plan: replace-pi-native-fallback-with-aili-emergency-checkpoint

**State:** Revised final test plan and repository-local BUILD authorization were granted on 2026-08-02. The 2026-08-01 acceptance and BUILD authorization covered only the superseded AILI-only contract.

**Host baseline:** official Pi `0.82.1`; Pi `0.83.0` source compatibility is informative, not runtime evidence.

**Evidence rule:** unit/fake evidence proves local state and return contracts only. Production `AgentSession` evidence is required for host persistence/retry sequencing. Real provider, installation and interactive claims remain separately authorized.

## 1. Acceptance Invariants

| ID | Required outcome | Status |
|---|---|---|
| ECP-A | Every compaction hook returns a complete custom envelope or exact `undefined`, never cancel/partial success | not run |
| ECP-B | Complete accepted current-epoch coverage yields deterministic custom checkpoint; `activeBlocks=0`/gaps yield native fallthrough | not run |
| ECP-C | Pressure scheduling invokes public compact at most once per unchanged cycle and does not claim a pre-dispatch veto | not run |
| ECP-D | Durable success requires a persisted custom or native entry and new epoch | not run |
| ECP-E | Overflow retry remains Pi-owned and AILI emits no synthetic continuation | not run |
| ECP-F | Callback/event/branch/epoch races cannot terminalize stale state or duplicate invocation | not run |
| ECP-G | Provider-only guidance is current-state executable, transient and non-authoritative | not run |
| ECP-H | Hybrid/native-fallback config remains read-only; no HOME/Pi settings migration occurs | not run |
| ECP-I | Parent/child/branch/epoch state remains isolated and prior epochs become query-only | not run |
| ECP-J | Session history remains append-only and no raw sidecar is created | not run |
| ECP-K | Production AgentSession proves both custom persistence and native overflow/retry paths | not run |

## 2. DEFINE and Contract Gates

Before BUILD:

1. Validate the reversible-compression base.
2. Materialize and validate `fix-aili-compact-recovery-deadlock`.
3. Materialize and validate `redesign-aili-compact-lifecycle`.
4. Apply this change against the merged predecessor and strict-validate the result.
5. Inspect the merged contract for exact custom-or-undefined behavior, Pi final native recovery, no cancel path, append-only history and branch/epoch isolation.
6. Reinspect the exact Pi `0.82.1` public types used by the implementation.

Missing Extension-bound provider runtime, continuation receipt and synchronous dispatch veto are not blockers because the revised design does not depend on them.

## 3. Hook Total Matrix

Cross manual, threshold and overflow reasons with:

- AILI enabled/disabled;
- deterministic enabled/disabled;
- ordinary Pi compact, deterministic rescue and matching one-use native rescue permit;
- complete coverage, `activeBlocks=0`, one gap, overlap, protocol split, stale tuple/digest, quality failure, bounds failure and planner throw.

Assertions:

- eligible cells return exactly one complete cloned `CompactionResult`;
- every other cell returns exact JavaScript `undefined`;
- no cell returns cancel, null, partial/error envelope or false success;
- ineligible/exception paths append no partial mutation and perform no extension-owned provider summary call.

## 4. Deterministic Coverage Matrix

Cover exact Pi preparation cut, whole protocol atoms, current epoch, source digests, acyclic lineage, parent/descendant exclusivity, source order, prior Pi summary ordering, retained-tail exclusion and section/total bounds.

`activeBlocks=0`, one uncovered atom and one duplicated atom must be wholly ineligible and preserve native fallthrough. Complete accepted maximal current-layer coverage must persist as `fromExtension=true` with exact `firstKeptEntryId` and `tokensBefore`.

## 5. Pressure and Coordinator Matrix

Cover observed/fallback/unknown usage, below/at/above the configured proactive threshold, repeated settled events, busy state, command-triggered rescue, host compaction entering first, callback before/after event, invocation throw, settled-without-epoch, branch/tree movement and shutdown.

Assertions:

- one semantic attempt and one checkpoint invocation per unchanged cycle;
- no repeated settled event creates a storm;
- pressure can become `CHECKPOINT_REQUIRED` without a false claim that the current public API synchronously blocked every provider dispatch;
- reset requires a new persisted epoch or verified usage at least one semantic-attempt budget below the force boundary;
- a smaller usage drop does not reset the cycle or authorize another checkpoint invocation;
- stale callback/event cannot alter the current tuple.

## 6. Persistence, Origin and Retry Matrix

| Case | Expected |
|---|---|
| callback without new persisted entry | not durable success |
| custom persisted entry | new epoch; deterministic origin only when details validate |
| native persisted entry | new epoch; native origin; valid cooperative recovery |
| origin ambiguous | `Unverified`; no counter or label guess |
| overflow with `willRetry=true` | Pi retries original request; AILI emits zero continuation messages |
| manual/threshold or `willRetry=false` | AILI emits zero continuation messages and invents no work |
| duplicate callback/event | one terminal request and no duplicate compact invocation |

## 7. Guidance and Usage Matrix

Cover every pressure/coordinator state, stale session/branch/epoch/cycle identity, unavailable catalog/scope identity and new epoch without post-checkpoint usage.

Assertions:

- suffix advertises only currently executable actions;
- stale/unverified identity is status-only or omitted;
- suffix/tool/callback is never checkpoint evidence;
- post-persistence usage is `rebuilding`/`unknown` until a valid new assistant usage arrives;
- old high-water usage is never displayed as the rebuilt usage.

## 8. Commands, Configuration and Isolation

Verify:

- `/aili-compact rescue` calls `ctx.compact()` once and `sendUserMessage()` zero times when idle;
- `rescue native` permit is exact and one-use; `rescue status` is read-only;
- Pi `/compact` remains deterministic-first then native fallthrough;
- `mode=hybrid`, `nativeFallback=true` and `autoRescue` semantics remain unchanged;
- unsafe `nativeFallback=false` is rejected and runtime performs no config/HOME/Pi-settings write;
- parent, child, branch, fork, current/prior epoch and cache state cannot cross-contaminate;
- branch/tree host behavior completes and AILI rebuilds only its own state;
- copied Session byte prefix remains unchanged except append-only new entries; no raw sidecar exists.

## 9. Production Entry and Evidence Limits

Registered production `AgentSession` tests must prove:

1. complete deterministic coverage returns a custom envelope, persists a custom entry, creates a new epoch and allows later work;
2. ineligible/empty coverage returns `undefined`, Pi generates/persists a native entry, and an overflow path retries the original request when host `willRetry` applies.

Direct hook calls and synthetic entries do not satisfy these two production-entry rows. A controlled local provider can prove the registered production code path but does not satisfy the inherited stable-release requirement for a separately authorized real provider/context-length failure, nor prove real tokenization, credentials, billing, transport/SSE or installed-package composition.

## 10. Repository Verification Order

After fresh acceptance and BUILD authorization:

```bash
openspec validate replace-pi-native-fallback-with-aili-emergency-checkpoint --strict
node scripts/validate-aili-compact-openspec-sequence.mjs --json
npx vitest run <focused affected tests>
npm run typecheck
npm run validate:generated
npm run validate:provenance
npm run validate:release
git diff --check
npm test
```

Before the sequence command can satisfy G1, its isolated release order must include this current change as the fourth stage; the predecessor-only form is partial evidence. The focused test command must be resolved from the actual changed files. Broader checks run only after focused evidence passes.

## 11. Separately Authorized / Unverified

- Pi `0.83.0` installed runtime behavior;
- real provider auth/headers/transport/SSE/tokenization/billing;
- real external provider overflow and retry ordering;
- installed Package, third-party extension ordering and interactive TUI behavior;
- dependency/version/lockfile/settings/HOME/install/publish/release operations.

The inherited real provider/context-length overflow row remains blocking for a stable release; separate authorization governs execution, not whether the requirement may be silently excluded.

## 12. Acceptance Record

- [x] 2026-08-01 AILI-only final test plan was accepted; this record is historical and superseded.
- [x] User accepted this revised deterministic-first/Pi-native final recovery test plan on 2026-08-02.
- [x] Repository-local BUILD authorization was granted for this revised contract on 2026-08-02.
