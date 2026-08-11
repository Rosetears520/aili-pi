# Migration: fix-aili-compact-recovery-deadlock

## Principles

- Add readers before writers; preserve all v1/v2 semantic readers.
- `aili.compact.repair.v1` is standalone, append-only, branch/epoch-bound, and safe for older readers to ignore/reject without rewriting history.
- Land removal of cancellation, deterministic planning, and native fallthrough together so no intermediate production state lacks recovery.
- Never infer ownership of an unmarked `compaction.enabled=false`; never mutate it during migration.
- Use copied Sessions and disposable HOME first. No migration step authorizes real HOME, version, lockfile, Git, publish, or release mutation.

## Ordered Forward Migration

1. Accept and sequentially validate the base plus both deltas.
2. Add repair schema reader, deterministic identity validation, atomic reducer, and unknown-entry behavior without enabling writer.
3. Add guarded branch activation on start/tree/fork and prove exact raw fail-open.
4. Remove age-only top-level deactivation; retain deprecated/no-op parsing.
5. Enable eligibility partition and deterministic repair batches after reducer/projector/reload tests pass.
6. Add checkpoint config, attempt identity/cache, exact hook matrix, native permit, coordinator, and epoch reload.
7. In one reviewable integration step, remove cancellation and enable deterministic-envelope-or-undefined for every reason.
8. Stop bootstrap false writes while preserving existing values and malformed-file atomicity.
9. Add rescue/pressure/doctor/command surfaces and production-entry overflow evidence.
10. Update public docs and candidate identity only under their separate gates.

## State Matrix

| Input state | Forward behavior | Required proof |
|---|---|---|
| clean v0.1.13 | replay unchanged; no repair append | replay/projection hash |
| 1..16 eligible GC blocks | one canonical atomic repair | ID golden + byte prefix |
| 17+ eligible blocks | deterministic contiguous 16-sized batches | reload equivalence |
| mixed eligible/ineligible | partition first; only valid batches | disposition + no partial replay |
| explicit user state | never repaired | reducer/projector unchanged |
| old epoch | query-only; never repaired | reload/search evidence |
| sibling forks | independent branch IDs/state | tree/fork activation evidence |
| interrupted append/activation | either full valid entry or none; raw fail-open | fault injection |
| interrupted rescue | runtime request/permit absent after reload | no fabricated success |
| custom/native checkpoint | CompactionEntry ID becomes epoch | ancestry + search evidence |
| setting absent/true/false | no AILI false write; preserve existing value | disposable-HOME bytes/value |

## Compatibility

Old runtimes continue to see unchanged Pi history. Their treatment of unknown standalone repair entries must be recorded; they must not mutate older entries. New runtime validates old v1/v2 transactions exactly as before. No repair transaction contains source text or replaces a semantic transaction. No epoch migration rewrites block transactions.

## Rollback

Rollback never deletes a repair or CompactionEntry and never rewrites JSONL. A rollback binary may ignore/reject standalone repair state and reconstruct its older projection from unchanged history. Because an old binary may restore exclusive cancellation, release notes SHALL direct operators to disable AILI or run Pi without the extension before host manual `/compact`; this limitation is not described as safe automatic recovery. Settings rollback leaves user-owned values unchanged.

## Migration Evidence

A sanitized manifest records fixture ID, old byte-prefix digest, branch/epoch IDs, planned/committed repair IDs, dispositions, projection digest, reload/tree/fork results, setting before/after digest, and rollback result. It contains no source bodies or local private material.

## Acceptance

- [ ] Forward matrix accepted.
- [ ] Rollback limitation accepted.
- [ ] Copied-session and disposable-HOME rehearsal authorized separately for BUILD.
