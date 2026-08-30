## Context

The completed observational-memory increment provides an in-process branch-aware ledger, a bounded managed-internal scheduler, deterministic recall projection, promotion decisions, and a MemPalace write-plan adapter. Production still captures assistant text at `turn_end`, defaults off, clears on shutdown, and never invokes MemPalace. MemPalace is already the sole accepted durable provider and the current repository has existing compaction owners that this change must not alter.

## Goals / Non-Goals

**Goals:**
- Proactively extract useful preferences, project decisions, verified solutions, and recovery points without requiring the user to say “remember”.
- Batch observation by token coverage and high-value events, then checkpoint before information is compacted.
- Use one Parent-owned MemPalace execution seam for automatic bounded search and non-destructive checkpoint writes.
- Make memories cross-project searchable while retaining provenance and logical applicability.
- Keep foreground execution, memory use, and memory-resource consumption bounded and observable.

**Non-Goals:**
- Any edit to compaction ownership, thresholds, summary construction, context-pressure policy, routing, triggering, recovery, or output.
- Automatic delete, mining, import, Palace initialization, bulk mutation, transcript mining, or unbounded shared-memory writes.
- A local durable queue, SQLite/Markdown mirror, fallback provider, or guarantee that a process crash cannot lose an uncheckpointed candidate.
- Treating recalled memory as instruction, authorization, verification, or current repository truth.

## Decisions

### 1. Capture is cheap; observation and persistence are batched
Every settled run may append a bounded source envelope and advance local token accounting, but it does not automatically invoke a model or MCP. A token clock cuts immutable source batches; a deterministic high-value detector may advance the next observation; the pre-compaction hook drains the eligible cutoff. One managed-internal Observer runs at a time initially, with coalescing rather than a public subagent or Herdr pane.

**Alternative considered:** run an Observer after every `agent_settled`. Rejected because it adds avoidable latency and cost. **Alternative considered:** observe only at shutdown/compaction. Rejected because process loss and context pressure would create a large unobserved window.

### 2. Hybrid extraction surrounds the model with deterministic policy
A deterministic prefilter removes memory-origin events, provider retry progress, raw logs, large tool bodies, known sensitive patterns, and low-information source. The internal model receives an immutable bounded batch and emits a versioned schema containing kind, concise content, confidence, source IDs, source project, applicability, expiry, and optional supersedes key. A deterministic controller reparses, normalizes, rechecks sensitive/private content, applies kind/scope rules, deduplicates, and either accepts, rejects, or quarantines each candidate.

**Alternative considered:** deterministic heuristics only. Rejected because preferences and reusable solutions require semantic interpretation. **Alternative considered:** let the Observer call MemPalace. Rejected because the model cannot own mutation authority or idempotency.

### 3. Token and high-value triggers share one source-watermark protocol
The runtime tracks the last covered Pi entry and estimated unobserved source tokens. Token-triggered batches use configurable absolute/ratio thresholds derived from the active model context without modifying the model’s compaction threshold. High-value events—confirmed preference, accepted decision, verified solution, material blocker, or recovery-point transition—only schedule the same observer sooner. Every batch has `fromEntryId`, `coversUpToId`, branch/session identity, and a content hash; completion may arrive out of order but commits idempotently by coverage and event IDs.

**Alternative considered:** one timer/debounce alone. Rejected because idle timing neither guarantees coverage before compaction nor captures important short interactions.

### 4. Pre-compaction integration is a side-effect-only barrier
The extension listens to Pi’s existing pre-compaction lifecycle event. It returns no summary, cutoff, replacement message, or routing instruction. For the cutoff selected by the existing owner, it awaits already eligible observation work, consolidates accepted candidates, attempts one bounded MemPalace checkpoint, records a receipt or degraded state, and then returns control. It does not import, edit, or call compaction implementation modules.

If MemPalace fails or remains ambiguous, the hook preserves branch-local observation state where available, performs no tombstone that depends on durability, and returns so the unchanged compaction can proceed. Provider retry progress is not interpreted as terminal; the operation waits for the provider’s explicit final settlement within the bounded lifecycle policy.

**Alternative considered:** replace compaction with an observational-memory compactor. Explicitly rejected by the user. **Alternative considered:** block compaction until durable write eventually succeeds. Rejected because memory-provider failure must not exhaust the model context or deadlock foreground work.

### 5. A Parent-owned MemPalace port reuses the session MCP lifecycle
Introduce a typed internal port for bounded `search`, `checkpoint`, duplicate reconciliation, and supported supersede operations. Its production adapter reuses the configured/session-owned MemPalace MCP connection, approval bridge, cancellation, output guard, provider status, and reconnect behavior; it does not create another MCP client or let a Worker invoke arbitrary tools. Tests use an in-memory fake port and perform no live durable write.

`mempalace_checkpoint` is the preferred batch write because it semantically deduplicates items and can append one Agent diary entry in a single provider operation. A receipt records candidate/fingerprint/provider IDs, target, outcome, and timestamps, never the body.

**Alternative considered:** ask the foreground model to call MCP tools. Rejected as nondeterministic, context-consuming, recursive, and impossible to guarantee before compaction.

### 6. Standing authority is explicit once and narrow thereafter
Automatic observation can default on locally, but external recall/write becomes armed only under a user-granted standing policy containing Palace identity, trusted project mapping, MemPalace server, exact search/checkpoint operations, eligible classes, and revocation state. That policy authorizes repeated covered non-destructive operations without per-candidate prompts. It never covers delete, mining, import, initialization, arbitrary update, or bulk/unscoped mutation.

**Alternative considered:** treat enabling observation as implicit authority for all MCP writes. Rejected because local observation and external mutation are separate permission classes. **Alternative considered:** prompt for every candidate. Rejected because it defeats proactive memory.

### 7. One Palace, globally searchable records, logical applicability
All eligible durable memories use the configured Palace and remain cross-project searchable. Records carry one of four applicability kinds:
- `global-preference`: normally applicable across projects;
- `reusable-solution`: cross-project reference with source project and verification provenance;
- `project-decision`: searchable globally but applicable as a rule only when project identity matches;
- `recovery-point`: searchable globally but automatically injected only for the matching project/session lineage.

The existing deterministic project Wing and stable Agent diary mapping remain available as provider organization, but search is not artificially limited to one project. Cross-project retrieval always preserves source and applicability labels.

**Alternative considered:** put all content into one untyped shared bucket. Rejected because project versions and architecture decisions would contaminate unrelated work. **Alternative considered:** prohibit cross-project search. Rejected by the user’s default-sharing requirement.

### 8. Recall is task-scoped and cache-minimal
At a new task or material topic change, the Parent derives a keyword-only query plus separate context, performs at most one bounded MemPalace search, and combines sanitized durable results with current branch observations. Global preferences, current-project records, and relevant reusable solutions rank above foreign project references; unresolved conflicts and expired/superseded records are excluded. Durable and session projections have separate token budgets and are injected once as hidden historical context.

A single active-task projection may be reused during the run and is invalidated by task/topic change, project/session switch, automatic disable, relevant checkpoint, or shutdown. No disk cache is used.

**Alternative considered:** search before every model turn. Rejected because it adds provider latency and duplicate prompt tokens.

### 9. Pending state contains references, not duplicated bodies
The ledger remains the only in-process body owner. Pending promotion is a bounded set of observation/candidate IDs and one immutable active batch. Success, deterministic rejection, expiry, or shutdown removes pending references; ledger retention removes bodies later. Temporary failures use bounded coalesced retry/reconciliation. No durable local outbox is introduced; a crash may lose an uncheckpointed batch.

**Alternative considered:** persist candidate bodies in Pi custom entries or a local outbox. Deferred because it creates a second durable sensitive-data surface and materially complicates exactly-once behavior.

## Risks / Trade-offs

- **Observer stores a plausible but false conclusion** → require source IDs, accepted/verified status classification, confidence, current-evidence precedence, and conflict quarantine.
- **Cross-project contamination** → retain applicability and source project; foreign project decisions are reference-only.
- **Secret/private-data leakage** → prefilter source, postfilter normalized output, reject rather than log bodies, and test adversarial candidates.
- **MCP timeout after a successful remote write** → reconcile by canonical fingerprint/provider duplicate search before retry; never blindly replay.
- **Compaction waits too long** → one bounded pre-compaction operation; degraded memory never replaces or deadlocks compaction.
- **Extra model/provider cost** → token batching, high-value early scheduling, coalescing, one observer concurrency initially, one checkpoint per batch, and status/cost counters.
- **Crash loses pending memory** → accept a bounded loss window in this increment; checkpoint during normal idle/pre-compaction operation rather than relying on shutdown.
- **MemPalace schema/tool behavior differs from assumptions** → isolate provider behavior behind the port and verify schemas/capabilities before enabling live automatic operations.

## Migration Plan

1. Add versioned source-envelope, candidate, policy, receipt, cutoff, and status contracts with deterministic tests.
2. Replace raw assistant-only capture with bounded source coverage and hybrid extraction behind a fake observer/port; keep external operations unarmed.
3. Add the Parent MemPalace port and fake-provider integration tests for search, checkpoint, ambiguity, dedupe, supersedes, and unavailability.
4. Add token/high-value scheduling and side-effect-only pre-compaction hook; prove existing compaction files, return values, owners, and behavior are unchanged.
5. Add standing-policy controls, default-on local observation, automatic task-scoped recall, status/revocation, docs, and doctor evidence.
6. Enable real automatic MemPalace operations only after the exact standing policy is granted in the target environment. Rollback disables automation and leaves existing Palace data untouched.
