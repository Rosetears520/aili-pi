# Automatic memory

AILI observes bounded local session material by default. This local observation is separate from durable MemPalace access and does not itself grant external authority.

## Local observation and recall

The observer is a managed-internal runtime component, not a public tool, Agent, Herdr pane, or child process. Token-volume and deterministic high-value-event triggers feed the same bounded observer pipeline; ordinary low-value runs only add bounded local source envelopes. Sensitive/private material, raw logs, provider-retry progress, memory-origin work, and unsupported inference are rejected by deterministic filters.

Recall is bounded to a task or material topic. At most one durable search is attempted for that task and one hidden projection is injected per Agent run, with separate deterministic durable and session token budgets. Historical memory is non-authoritative: current user instructions, trusted repository state, accepted contracts, permissions, and fresh evidence always take precedence.

## One Palace and logical applicability

All durable records use one configured Palace and remain searchable across projects. Searchability does not erase scope:

- global preferences may apply across projects;
- reusable solutions remain cross-project references with source and verification provenance;
- project decisions found outside their source project are historical references, not current-project rules;
- recovery points are automatically applicable only to matching project/session lineage.

The runtime preserves source and applicability labels when projecting cross-project results.

## Authority and compatibility

`/memory-auto authorize` asks for session-scoped standing authorization bound to the trusted Palace, project identity, MemPalace server, exact search/checkpoint tools, and eligible memory kinds. It does not authorize delete, import, mining, initialization, destructive replacement, arbitrary update, or bulk/unscoped mutation. Authorization is revoked on shutdown or project/session rebinding and can be removed explicitly.

The bridge reuses AILI's existing session MCP adapter. It creates no second MCP client and no local disk cache, durable outbox, SQLite/Markdown mirror, or fallback store. Extension load and session start do not execute a version probe. Only after the user initiates `/memory-auto authorize` and approves its interactive prompt does the runtime execute the no-shell, timeout/output-bounded `mempalace --version` probe. It rebinds the session port and arms durable operations only when the output identifies exact MemPalace `3.7.0`; an absent command, timeout, malformed output, or version mismatch leaves compatibility false and durable memory unarmed. The user-level environment inspected for this change reported exact `3.7.0`, but each session must obtain its own evidence. No live durable write is claimed by repository tests or documentation.

## Pre-compaction checkpoint

The early `session_before_compact` hook is an awaited, side-effect-only checkpoint barrier. It drains eligible observation work, attempts at most one bounded checkpoint, records only truthful provider state, and returns `undefined`. Provider failure, ambiguity, or no candidate does not block the existing compaction lifecycle.

The hook does not return compaction content and does not import, invoke, replace, wrap, initiate, cancel, suppress, reconfigure, or modify any compaction implementation, owner, threshold, trigger, route, summary, or output.

## Commands

The short local controls are:

- `/memory-auto t` — enable local automatic observation (alias of `on`).
- `/memory-auto f` — stop new observation, automatic recall, and checkpoint work without deleting Palace data (alias of `off`).
- `/memory-auto s` — show concise Chinese status (alias of `status`). No argument also shows status.

The compatible full commands remain:

- `/memory-auto status` — bounded local/provider state, counts, hashes, operation costs, outcomes, and a bounded Chinese provider failure category; no memory bodies, raw provider reasons/IDs, secrets, or paths.
- `/memory-auto on` — enable local automatic observation.
- `/memory-auto off` — disable local automatic observation as described above.
- `/memory-auto checkpoint` — request one bounded checkpoint attempt; it still requires compatible provider evidence and standing authority.
- `/memory-auto authorize` — after interactive trusted-project confirmation, probe for exact MemPalace `3.7.0` and grant the narrow session-scoped standing policy only on success. A successful new grant clears stale revoked checkpoint/recall diagnostics but does not claim provider connectivity before an operation succeeds.
- `/memory-auto revoke` — revoke that standing policy without deleting Palace data.

## Migration from the earlier observational-memory preview

The earlier preview was default-off, session-only, and documented `compact`/`consolidate` controls. Automatic memory now defaults local observation on and uses `checkpoint`, `authorize`, and `revoke`. Enabling local observation is not durable-operation authorization. Existing Palace data is left untouched when automation is disabled or revoked, and no local fallback is created. The compaction owner and behavior are unchanged.
