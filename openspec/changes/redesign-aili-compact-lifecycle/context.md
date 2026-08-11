# Context: redesign-aili-compact-lifecycle

## Delivery Position

- Release target: `v0.2.0`.
- Mandatory packages: all P1–P3 behavior; none is optional backlog.
- Delivery sequence: PR2 safe planning, PR3 schema/tiering, PR4 index/cooling/performance, PR5 integration/release.
- Hard prerequisite: completed/evidenced `fix-aili-compact-recovery-deadlock` / `v0.1.14` PR1.
- Every PR preserves REC-001 through REC-008 and leaves main usable.

## Proposed Defaults for Explicit Acceptance

- Recent tail: `preserveRecentAtoms=8`, `preserveRecentTokens=12000`, effective cap 10% of active context window, `preserveLastUserMessage=true`.
- Token policy: minimum guaranteed savings T1/T2/T3 = 256/512/768, ratio 0.20, max break-even turns NORMAL/PRESSURE/FORCE = 8/4/1.
- Calibration: last 20 eligible provider/model samples, minimum 5, bounded min/max multipliers and 25% movement.
- Quality: runtime-only extraction after exact in-memory source selection; versioned input/manifest/result; UTF-16 spans and exact normalization/durable refs; callers submit no manifest; fail closed. PR2 v2 `qualityEvidence` is bounded/additive/no-raw-text and maps into PR3 v3.
- Tiers: T1 messages, T2 consumes T1, T3 consumes T2, and default-enabled rank-preserving T3 restill consumes 2–16 T3 children with defaults 8000 source tokens/1024 savings/0.25 ratio/3000 summary tokens/8 turns.
- Restore: one level by default for v3 parent; raw closure bounded to 256 blocks.
- Suffix: provider-only transient custom message, max 2,048 chars/512 estimated tokens.
- Index: pure oracle/fallback retained, branch/epoch snapshot LRU 4, deterministic operation and structural-record budgets in design/test plan.
- Tool cooling: result body only after a successful later request observed the exact result identity; unresolved errors remain protected until explicit durable resolution; five-turn grace alone is insufficient; task/hub refs are hard everywhere.

## Provenance Boundary

Behavioral comparison may cite `ranxianglei/opencode-acp@v1.14.3`, commit `00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb`. No source, prompt, schema, fixtures, tests, docs text, or assets are approved for copying. AILI's implementation/specification remains independently authored around official Pi APIs and its append-only reversible model.

## Verification Truth Boundary

Local declarations and fake-provider tests can prove schemas, planning, state machines, return values, append-only replay, and deterministic operation counts. Real provider tokenization, cache, suffix role handling, semantic quality, threshold/overflow retry ordering, TUI behavior, and known extension composition require the separately authorized LIVE-V2 matrix. Unknown third-party ordering remains `Unverified` and cannot be presented as PASS.

## Fixed Release Boundary

The candidate reruns P0 live gates, all three provider families named by project support, long T1→T2→T3→T3 quality, production AgentSession overflow retry, and a controlled third-party context handler both before and after AILI. Synthetic substitutes do not satisfy live gates. OpenSpec validation materializes base, then P0 fix, then redesign sequentially. Acceptance and BUILD boxes remain unchecked.

## DEFINE State

Proposal, design, five capability deltas, tasks, migration strategy, PR test matrix, deterministic performance budgets, live evidence, and release gates are drafted. No production code, dependency, version, lockfile, Git state, credentials, external settings, publish, or release mutation is authorized. BUILD is blocked pending explicit acceptance of `test-plan.md`.
