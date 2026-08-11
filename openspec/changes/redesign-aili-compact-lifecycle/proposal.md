## Why

The `v0.1.14` recovery release removes extension-induced deadlock, but it does not by itself provide bounded long-session semantics, source/summary quality assurance, cache-stable guidance, tiered re-distillation, or scalable branch indexing. Version `0.2.0` is the mandatory architectural completion line for all accepted P1, P2, and P3 behavior; none of those packages is optional or future-only.

## What Changes

- Require the completed `fix-aili-compact-recovery-deadlock` contract as the release and implementation base. Every PR and the final `v0.2.0` release must preserve manual/native fallback, non-cancelling overflow, append-only Session history, and no age-only top-level deactivation.
- Replace message-count-only protection with complete protocol-atom protection using proposed defaults `preserveRecentAtoms=8`, `preserveRecentTokens=12000` capped at 10% of the active model window, and `preserveLastUserMessage=true`; unfinished turns remain hard-protected.
- Split protected tails during planning and expose exact recommended safe ranges. A mutation must reject any source/summary mismatch rather than silently filtering source after the model wrote the summary.
- Replace character-only benefit decisions with provider/model-aware token bounds, steady-state savings, one-time cost, break-even turns, pressure-stage policy, and bounded rolling calibration.
- Add a default-enabled pre-commit catastrophic-information-loss gate: runtime alone freezes exact source, extracts versioned manifests, validates exact UTF-16 spans/normalization/durable refs, and fails closed. Callers submit no manifest; PR2 may persist bounded additive v2 `qualityEvidence` without raw text and PR3 maps it into v3.
- Move dynamic guidance out of the system prompt into a deterministic provider-only suffix containing pressure/headroom, current catalog identity, safe ranges, eligible block references, and allowed actions without JSONL/reference/search persistence.
- Introduce a complete closed tagged `aili.compact.tx.v3` transaction union for semantic-create, decompress, recompress, cooling, and control; strict source arms, recursive ordered digests, derived atomic state, 1–16 roots/256 closure, T1/T2/T3 plus bounded default T3 restill, and bounded restoration. v1/v2 remain maximal legacy leaves and never v3 children.
- Add `mode:"blocks"` to `aili_compact`; remove literal `summary.includes(child.summary)` as lineage proof; require same-tier, current-epoch, active, projection-contiguous children and deterministic cycle/single-active-parent validation.
- Build a production-event-driven session/branch BranchIndex with ancestry-prefix proof, zero healthy full rebuild paths and one provider pass; exact counters/scan tripwires; and result-only cooling requiring successful later-request observation, exact identity, permanent unresolved-error and durable task/hub protection.
- Deliver the accepted PR2–PR5 sequence while keeping main usable after every merge, then complete migration, fake-provider, provider-backed Pi 0.82.1, docs/provenance/package, performance, and release evidence for `v0.2.0`.

## Capabilities

### New Capabilities

- `aili-compact-safe-planning`: protocol-atom/tail protection, safe range splitting, token-aware benefit, pre-commit quality gates, provider-only guidance, and cache identity.
- `aili-compact-tiered-lifecycle`: schema v3 T1/T2/T3 lineage DAG, block compression, atomic parent/child lifecycle, recursive restoration, and checkpoint-aware archival/search.
- `aili-compact-branch-index`: incremental branch state/indexing, monotonic duplicate alignment, tool-specific result cooling, performance budgets, and operational telemetry.

### Modified Capabilities

- `aili-compact-checkpoint-recovery`: integrate the inherited hybrid recovery state machine with v3 blocks, highest-tier deterministic checkpoint planning, quality rejection, provider suffix pressure, and BranchIndex rebuild rules.
- `reversible-context-compression`: replace v2-only lineage, recent-user protection, character benefit, dynamic system-prompt guidance, broad tool exclusions, full replay/hash hot paths, and old cache identity semantics.

## Impact

- Runtime: every `src/runtime/aili-compact/` layer plus registration/doctor integration in `src/runtime/index.ts`.
- Public contracts: `aili_compact` gains additive `mode:"blocks"`; decompression gains bounded `depth:"one"|"raw"`; configuration gains safe-planning, tier, token, quality, index, cooling, and checkpoint fields while preserving v1/v2 replay.
- Tests/evidence: existing AILI Compact unit/integration/bootstrap fixtures, new v3 migration/lineage/fault fixtures, 10K-message and 100K-reference deterministic operation budgets, benchmark reports under `artifacts/test-results/`, fake-provider recovery, and provider-backed Pi 0.82.1 evidence.
- Documentation/provenance: README, config reference, migration and release notes, doctor/telemetry docs, packaged provenance/notices updated to exact `ranxianglei/opencode-acp@v1.14.3` commit `00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb` only for behavior actually adopted; no direct upstream source/prompt/schema/fixture/asset copy is authorized.
- Delivery: PR2 safe planning, PR3 schema/tiering, PR4 index/cooling/performance, and PR5 integration/release are all mandatory. Dependency/lockfile, Git, provider credentials, version mutation, publish, and release operations retain separate exact gates.
