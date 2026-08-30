## Why

AILI currently exposes MemPalace as an optional durable store but has no session observation ledger, consolidation, controlled promotion, or deterministic recall layer. This change adds those missing layers without turning memory into authority or creating a second durable store.

## What Changes

- Add Tail, Observation, and Durable memory boundaries.
- Add a branch-aware atomic observation ledger with deterministic active views.
- Add a bounded managed-internal observer/consolidator that never creates Herdr panes or recursively observes itself.
- Add Parent-owned candidate redaction, dedupe, conflict/supersedes, and explicit durable-promotion authority.
- Add a deterministic, token-budgeted MemoryContextProvider around the existing context owner; it never owns compaction.
- Add opt-in `/memory-auto` controls and bounded provenance/cost/status reporting.
- Preserve MemPalace as the only durable provider; unavailable MemPalace creates no fallback store.

## Capabilities

### New Capabilities
- `observational-memory-layering`: Session observations, branch-aware ledger, internal consolidation, controlled durable promotion, deterministic recall, and operator controls.

### Modified Capabilities
- None.

## Impact

New runtime modules under `src/runtime/observational-memory/`, integration with context/runtime events, existing `src/runtime/mempalace.ts`, doctor/capability status, TUI commands, and focused unit/integration tests. No dependency or lockfile change is planned.
