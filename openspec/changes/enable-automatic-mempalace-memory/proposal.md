## Why

The current Observational Memory implementation remains session-only and stops at an authorized MemPalace write plan, so it cannot proactively preserve or reuse stable preferences, project decisions, verified solutions, or work recovery points across sessions and projects. The next increment should retain the existing branch-aware observation layer while adding bounded automatic durable promotion and semantic recall through the already selected MemPalace provider.

## What Changes

- **BREAKING**: Replace default-off, per-write durable promotion with default-on proactive observation and narrowly bounded standing authority for automatic MemPalace recall and non-destructive checkpoint writes.
- Add hybrid observation: deterministic pre/post filters around a managed-internal model observer that extracts only stable, source-linked memory candidates.
- Add token-volume and high-value-event triggers; aggregate candidates and perform a durable checkpoint before an existing compaction begins.
- Preserve all existing compaction implementations, owners, thresholds, summaries, and routing unchanged; memory may only use a pre-compaction hook/barrier and may not replace, wrap, initiate, suppress, or rewrite compaction.
- Store user habits/preferences as global memories, reusable solutions as cross-project searchable memories with source scope, project decisions as project-scoped memories, and recovery points as project/session/branch-scoped memories.
- Automatically recall relevant MemPalace and active-session observations under deterministic token budgets while treating all recalled material as non-authoritative historical context.
- Keep delete, import, mining, Palace initialization, and other destructive or bulk mutations separately operation-gated. Create no SQLite, Markdown, transcript-mining, or disk-cache fallback.

## Capabilities

### New Capabilities
- `automatic-mempalace-memory`: Proactive hybrid observation, scoped standing read/checkpoint authority, token/event triggers, pre-compaction checkpoint coordination, cross-project semantic recall, and bounded failure behavior.

### Modified Capabilities

None. The prior change-local observational-memory contract remains historical evidence for its completed scope; this change supersedes its default-off and per-write-promotion behavior through a new capability contract.

## Impact

- Runtime: `src/runtime/observational-memory/`, `src/runtime/mempalace.ts`, and the session-owned MCP integration seam.
- Pi extension: `extensions/observational-memory/index.ts` command/status lifecycle and Pi event hooks.
- Tests: memory unit/integration fixtures, mocked MemPalace port, branch/session lifecycle, trigger, failure, and compaction-boundary compatibility tests.
- Documentation/capabilities: README, doctor/capability status, and change-local migration notes.
- No new dependency, lockfile change, alternate durable store, Browser work, or compaction implementation change is included.
