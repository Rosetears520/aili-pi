## 1. Contracts and Ledger

- [x] 1.1 Define versioned observation/candidate/projection/provenance schemas and verify malformed, oversized and content-bearing records fail closed
- [x] 1.2 Implement branch-aware idempotent ledger views and verify fork, rollback, duplicate and retention tests

## 2. Internal Observation

- [x] 2.1 Implement bounded managed-internal observer scheduling with recursion/spawn/Herdr exclusion and verify isolation tests
- [x] 2.2 Implement deterministic consolidation and verify identical inputs produce identical observations and hashes

## 3. Promotion and MemPalace

- [x] 3.1 Implement Parent redaction, dedupe, confidence, conflict/supersedes and exact-authority gates and verify security tests
- [x] 3.2 Adapt authorized candidates to existing MemPalace scope mapping with no fallback store and verify unavailable-provider behavior

## 4. Recall and Controls

- [x] 4.1 Add token-budgeted MemoryContextProvider without changing compaction ownership and verify both context routes
- [x] 4.2 Add `/memory-auto status|on|off|compact|consolidate`, default-off lifecycle and bounded status/provenance tests
- [x] 4.3 Update doctor/capabilities/docs and run focused typecheck, memory tests and strict OpenSpec validation
