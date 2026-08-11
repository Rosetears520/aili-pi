# Migration: redesign-aili-compact-lifecycle

## Preconditions

- [ ] Human acceptance remains explicit and separate from BUILD.
- [ ] Materialize and strict-validate in order: accepted base; base plus `fix-aili-compact-recovery-deadlock`; base plus fix plus this redesign. Do not validate the redesign against an unmaterialized base or mutate historical contracts.
- [ ] Freeze P0 recovery evidence before PR2 and rerun it after every PR.

## PR2 additive state

Old count/character/nudge/config keys remain parseable with bounded deprecation diagnostics. `planning.enabled` defaults true; false disables only automatic discovery, recommendation/attempt, promotion/restill, and proactive suffix. Manual range/message/block mutation, decompression/recompression/restoration, hard protection, quality, BranchIndex correctness, checkpoint/native fallback/rescue/overflow remain enabled.

Callers retain existing range/message inputs and summary and submit no manifest. Runtime selects and freezes exact source in memory before extraction. PR2 may append bounded v2 `qualityEvidence` containing versions, digests, exact durable refs, UTF-16 spans, classes/counts/codes/verdict only. It never stores raw source or fact text. This replaces the former absolute no-session-schema-change claim.

## PR3 cutover

PR3 introduces the complete closed tagged v3 union with shared header and semantic-create/decompress/recompress/cooling/control arms. It maps valid PR2 `qualityEvidence` deterministically into v3 quality fields; absent, stale, malformed, ambiguous, or unknown-version evidence is checkpoint-ineligible and fails closed for new writes.

v1/v2 readers remain unchanged. Legacy blocks are maximal leaves and can never be v3 children. There is no compatibility-child marker. Upgrade is explicit: decompress the legacy block, discover exact safe raw messages, then create a new v3 T1 under current quality/economics gates. No old entry is rewritten or auto-redistilled.

## PR4 index and cooling

Run the production event/update table beside the pure oracle before cutover. Prefix reuse requires exact canonical ancestry proof. A healthy request performs zero full reducer/replay/hash/protocol/protection/catalog rebuilds and at most one provider-message pass. Any mismatch uses a declared rebuild or exact pure/fail-open path.

Old cooling decisions replay prospectively. New cooling requires a successful later request that observed the exact result identity. Unique unresolved errors remain raw until explicit same-identity resolution; five-turn grace is not resolution. Durable task/hub references remain hard across stubs, quality, tier, checkpoint, and open-work surfaces.

## Copied-session matrix

- [ ] Clean v1, v2, mixed v2/v3, interrupted tagged transaction, fork, and prior epoch.
- [ ] PR2 qualityEvidence valid/invalid mapping.
- [ ] Legacy child rejection and explicit decompress-then-T1 upgrade.
- [ ] One/raw 1–16 roots and 256 closure boundary.
- [ ] T1→T2→T3→T3 restill and reload.
- [ ] Index absent/corrupt fallback and exact prefix preservation.
- [ ] Rollback opens raw JSONL/CompactionEntries with no rewrite/delete.

All rehearsals use sanitized copies in disposable HOME. Acceptance boxes remain unchecked until evidence exists.
