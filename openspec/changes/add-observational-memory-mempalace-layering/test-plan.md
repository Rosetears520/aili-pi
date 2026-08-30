# Test Plan — Observational Memory

Status: accepted by the user on 2026-08-27. Repository-local BUILD authorized; real MemPalace durable writes remain separately operation-gated.

1. Ledger: idempotency, branch/fork/rollback views, retention and durable non-rollback.
2. Isolation: managed-internal only, no Herdr pane/public Agent/spawn/recursion; bounded concurrency.
3. Promotion: credential rejection, redaction, dedupe, conflict/supersedes, exact authority, no fallback store.
4. Recall: deterministic order/hash, token budget, omitted count, current evidence precedence.
5. Context: Codex and billion-context retain their sole compaction owner.
6. Controls: default off; status/on/off/compact/consolidate, cancellation and session lifecycle.
7. Provider unavailable: explicit unavailable state; non-memory work continues.
8. Provenance: IDs/hashes/cost only, no private memory body.

Focused verification: typecheck, new unit/integration memory tests, doctor/capability tests, strict OpenSpec validation. No real MemPalace write occurs without separately granted exact authority.

Fresh result (2026-08-28): memory unit/static/runtime tests PASS; full repository suite 767 passed/2 skipped; capabilities/generated/package/audit/doctor and strict OpenSpec PASS. No real MemPalace write was executed.
