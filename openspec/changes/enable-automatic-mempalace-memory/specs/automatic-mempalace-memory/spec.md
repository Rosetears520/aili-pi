## Purpose

Provide proactive, bounded, cross-session and cross-project memory through MemPalace without changing Pi/AILI compaction behavior or treating historical memory as current authority.

## ADDED Requirements

### Requirement: Proactive hybrid observation is enabled by default
The system SHALL capture bounded source events without invoking an observer model for every Agent run. It SHALL trigger managed-internal observation from accumulated token volume, recognized high-value events, and the pre-compaction boundary. Deterministic pre- and post-filters MUST exclude provider retry progress, memory-origin work, raw logs, ordinary low-value conversation, secrets, private content, unsupported inference, and observer recursion.

#### Scenario: Ordinary settled run
- **WHEN** an Agent run settles without enough new source tokens or a high-value event
- **THEN** the system records only bounded local observation input and starts no observer model or MemPalace mutation

#### Scenario: High-value event
- **WHEN** a settled run contains a confirmed user preference, accepted decision, verified reusable solution, material blocker, or work recovery-point change
- **THEN** the system schedules bounded managed-internal extraction without waiting for the normal token threshold

### Requirement: Token-triggered observation precedes context loss
The system SHALL track unobserved source coverage and invoke observation before covered source content can be removed by an existing compaction. Observation batches MUST carry a stable source cutoff/watermark so out-of-order or retried work cannot omit or duplicate covered source events.

#### Scenario: Token threshold reached
- **WHEN** unobserved source content reaches the configured token threshold
- **THEN** the system schedules a bounded observer batch covering an immutable source interval and leaves foreground execution unblocked

### Requirement: Durable checkpoint occurs before compaction without changing compaction
Before an existing compaction begins, the memory extension SHALL use a pre-compaction hook to finish eligible observations, consolidate durable candidates, and attempt one bounded MemPalace checkpoint for the same source cutoff. It MUST NOT replace, wrap, initiate, cancel, suppress, reconfigure, summarize for, return replacement content to, or otherwise modify any compaction mechanism, owner, threshold, routing, or output.

#### Scenario: Pre-compaction checkpoint succeeds
- **WHEN** an existing compaction reaches its pre-compaction hook and eligible durable candidates exist
- **THEN** the checkpoint receipt is recorded before the hook returns and the unchanged compaction proceeds under its existing owner

#### Scenario: MemPalace is unavailable before compaction
- **WHEN** the bounded checkpoint cannot reach a definitive success before compaction
- **THEN** the system reports degraded memory state, retains branch-local observation coverage when possible, claims no durable write, and allows the unchanged compaction to proceed

#### Scenario: No durable candidate exists
- **WHEN** pre-compaction observation produces no eligible durable candidate
- **THEN** the hook performs no MemPalace write and returns without changing compaction behavior

### Requirement: Automatic MemPalace operations use scoped standing authority
Automatic semantic search and non-destructive checkpoint writes SHALL require a user-granted standing policy bound to the trusted Palace, project identity, allowed MemPalace server/tools, eligible memory classes, and revocation state. The observer model MUST NOT call MemPalace directly or broaden that policy. Delete, bulk import, directory mining, Palace initialization, destructive replacement, and unscoped external mutation MUST remain separately operation-gated.

#### Scenario: Standing policy authorizes automatic checkpoint
- **WHEN** an eligible candidate and trusted scope match an active standing policy
- **THEN** the Parent-owned memory controller may perform the covered checkpoint without a per-candidate prompt

#### Scenario: Policy is absent or revoked
- **WHEN** automatic recall or write lacks matching standing authority
- **THEN** the external operation fails closed, ordinary foreground work continues, and no fallback durable store is created

### Requirement: Memories are globally searchable with explicit logical scope
Eligible memories SHALL be stored in the shared MemPalace and be searchable across projects. Each record MUST identify its kind, source project, source Agent/session references, confidence, status, and logical applicability: global preference, reusable solution, project decision, or recovery point. Cross-project retrieval MUST preserve this scope and MUST NOT silently reinterpret a project-specific record as a rule for another project.

#### Scenario: Global preference is recalled in another project
- **WHEN** a user preference is relevant to a task in a different trusted project
- **THEN** recall may apply it as a global preference with its provenance retained

#### Scenario: Project decision is found from another project
- **WHEN** semantic search finds a project decision whose source project differs from the current project
- **THEN** it is presented only as historical reference and cannot become current project authority without current evidence

### Requirement: Automatic promotion is selective and idempotent
The Parent-owned controller SHALL accept only concise, source-linked, sufficiently supported candidates; revalidate sensitive content after model extraction; semantically deduplicate across sessions; and represent compatible updates, conflicts, and supersedes without blind duplicate writes or automatic deletion. Ambiguous provider completion MUST be reconciled before retry.

#### Scenario: Duplicate candidate
- **WHEN** equivalent durable content already exists
- **THEN** the checkpoint records a no-op result and creates no duplicate memory

#### Scenario: Conflicting candidate
- **WHEN** a candidate conflicts with durable memory and no exact superseded fact is established
- **THEN** automatic promotion quarantines the candidate from authoritative recall and performs no destructive replacement

### Requirement: Recall is proactive, bounded, and non-authoritative
At a new task or materially changed topic, the system SHALL perform at most one bounded semantic recall for that task, merge relevant durable records with active branch observations under separate deterministic token budgets, and avoid repeated searches/injections during the same Agent run. Current user instructions, trusted repository state, accepted contracts, permissions, and fresh verification MUST outrank recalled memory.

#### Scenario: Relevant cross-project memory exists
- **WHEN** a new task has relevant global, reusable, project, diary, or recovery memory
- **THEN** the system injects a bounded hidden historical-context projection with IDs, scope, hash, omitted count, and provider state

#### Scenario: Recall times out
- **WHEN** MemPalace search exceeds its bounded deadline or is unavailable
- **THEN** foreground work continues without durable recall and no stale success claim or alternate-store lookup occurs

### Requirement: Memory buffering remains bounded and non-durable locally
The system SHALL keep active observations and pending promotion references in bounded Parent-process memory, MUST NOT duplicate pending bodies into a local disk cache or durable outbox, and SHALL release pending references after successful checkpoint, deterministic rejection, expiry, or session shutdown. Session shutdown flushing is supplemental and MUST NOT be the sole checkpoint opportunity.

#### Scenario: Pending capacity is reached
- **WHEN** pending observation or promotion capacity is exhausted
- **THEN** the system coalesces or rejects additional low-priority work with bounded degraded status and does not grow without limit

### Requirement: Controls expose automatic-memory state without bodies
The system SHALL expose enable/disable, checkpoint, status, and revocation controls. Status MUST report bounded counts, cutoffs, hashes, costs, last checkpoint/recall outcomes, policy/provider state, and rejection reasons without exposing memory bodies, credentials, or raw conversation.

#### Scenario: Automatic memory is disabled
- **WHEN** the user disables automatic memory
- **THEN** new observation, automatic recall, and automatic checkpoint work stop; active internal work is cancelled or allowed one bounded settlement according to lifecycle policy; existing MemPalace data remains untouched
