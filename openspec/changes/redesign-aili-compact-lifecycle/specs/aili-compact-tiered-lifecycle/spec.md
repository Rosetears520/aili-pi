## ADDED Requirements

### Requirement: Schema v3 is a complete closed tagged transaction union
AILI SHALL accept append-only `aili.compact.tx.v3` while replaying valid v1/v2 exactly. Every arm has `header:{schema:"aili.compact.tx.v3",txId,sessionId,branchLeafId,epochId,catalogId,createdAt,projectionVersion}` and exactly one tag/payload: `semantic-create`, `decompress`, `recompress`, `cooling`, or `control`. Unknown tags/fields or mixed payloads fail closed. `semantic-create` contains tier/topic/run/anchor, summary/digest, token/quality metadata, and exactly one mutually exclusive source arm: `{kind:"messages",entryIds,firstEntryId,lastEntryId}` or `{kind:"blocks",childBlockIds}`. Empty dual-source placeholders are forbidden.

Leaf coverage SHALL be represented recursively as ordered child digests: message leaves hash exact ordered durable message identities; a parent hashes `tier + leafCount + each child leafDigest in canonical source order`. Parents record immediate child IDs, recursive digest, and total count, never a full parent leaf-ID array. The tagged transaction atomically derives parent activation and all child deactivations; callers cannot submit state booleans. `decompress`, `recompress`, `cooling`, and `control` carry their operation-specific bounded target/provenance/reason payloads and use the existing closed reason set; invented reasons fail closed. Loading or migration MUST NOT rewrite prior Session entries.

#### Scenario: Source arms are mixed
- **WHEN** a semantic transaction contains both message IDs and child IDs, neither arm, extra state flags, or a full parent leaf array
- **THEN** the entire transaction is rejected without partial replay

#### Scenario: Mixed v2 and v3 branch reloads
- **WHEN** valid v1/v2 transactions precede valid tagged v3 transactions
- **THEN** replay is deterministic and preserves the original byte prefix

### Requirement: T1 blocks cover exact contiguous safe message atoms
A T1 semantic block SHALL have `source.kind="messages"`, cover one exact current-epoch contiguous safe protocol-atom range, contain no child block, and satisfy token benefit and T1 quality policy. Its leaf digest/count SHALL equal its direct source.

#### Scenario: T1 source skips an interior atom
- **WHEN** selected message refs have a gap in provider projection
- **THEN** T1 mutation rejects rather than presenting discontiguous source as one block

### Requirement: T2/T3 promotion and bounded T3 restilling are explicit
A T2 parent SHALL consume 2–16 T1 children. A T3 parent SHALL consume 2–16 T2 children. T3-to-T3 restilling SHALL also be enabled by default and may consume 2–16 contiguous active T3 children to create a replacement T3; it is rank-preserving consolidation, not T4. Defaults are `restill.enabled=true`, `minChildren=2`, `minSourceTokens=8000`, `minSavingsTokens=1024`, `minSavingsRatio=0.25`, `maxSummaryTokens=3000`, and `minTurnsSinceCreate=8`. All children SHALL be semantic v3, active, current epoch, queryable, projection-contiguous, same-tier, parentless, old enough, and pass recursive digest/count, quality, and production-projected benefit checks. Parent creation and child deactivation are one atomic derived transition. The stricter restill thresholds bound churn while allowing long-lived T3 runs to reduce wrapper/reference overhead.

#### Scenario: Mixed T1 and T2 children are requested
- **WHEN** `mode:"blocks"` names children of different tiers
- **THEN** mutation rejects cross-tier merge and recommends normalizing adjacent lower-tier blocks first

#### Scenario: Child has an active parent
- **WHEN** a requested block is already consumed by an active parent
- **THEN** selection rejects it and does not create two active parents

#### Scenario: Valid T2 parent commits
- **WHEN** two or more active contiguous T1 blocks pass all checks
- **THEN** one v3 transaction appends the T2 parent and atomically deactivates exactly those children for nested lineage

#### Scenario: T3 restill defaults are not met
- **WHEN** T3 children are fewer than two, younger than eight turns, below 8000 source tokens, exceed 3000 summary tokens, or miss 1024/0.25 savings
- **THEN** no T3 replacement is created

#### Scenario: Valid T3 restill commits
- **WHEN** 2–16 eligible contiguous T3 children pass all default gates
- **THEN** one T3 replacement is atomically activated, its children deactivate, and recursive leaf digest/order remains exact

### Requirement: Lineage is proved structurally rather than by summary text
AILI SHALL establish lineage only through child IDs, tier rank, current epoch, effective leaf interval, leaf count/digest, source order, transaction identity, and cycle/single-active-parent validation. Literal containment or similarity between parent and child summaries MUST NOT prove lineage.

#### Scenario: Parent repeats every child summary literally
- **WHEN** text includes child summaries but IDs/digests/contiguity are invalid
- **THEN** mutation rejects and appends nothing

#### Scenario: Summary is a valid paraphrase
- **WHEN** text does not literally include a child summary but structural lineage and quality coverage are valid
- **THEN** text non-inclusion alone does not reject the parent

### Requirement: The active semantic graph is acyclic with one active parent
Every accepted promotion parent SHALL have rank exactly one above its children; an accepted T3-restill parent SHALL have the same T3 rank and satisfy the stricter restill gates. Replay and mutation SHALL run deterministic cycle detection and SHALL ensure each child has at most one active parent. Historical inactive parent edges MAY remain append-only, but projection SHALL select only maximal active nodes and never both a parent and descendant.

#### Scenario: Malformed history introduces a cycle
- **WHEN** replayed IDs would form a cycle despite tier metadata
- **THEN** affected v3 lineage is rejected/fail-open and no cyclic block projects

#### Scenario: Parent is active
- **WHEN** a valid T2/T3 parent and its inactive nested children are replayed
- **THEN** provider projection includes only the parent summary for that leaf interval

### Requirement: Block mode resolves bounded current-catalog references
`aili_compact` SHALL accept additive `mode:"blocks"` with exact current `catalogId`, 2–16 `blockRefs` matching `^b\\d{6}$`, `topic` of 1–200 characters, `summary` of 1–10,000 characters, and optional `summaryMaxChars` of 256–10,000. It SHALL resolve refs under the supplied current catalog, sort by effective source ordinal, and reject duplicates, stale/query-only/inactive/non-v3-semantic refs, mixed tiers, active parents, non-contiguous coverage, protected-tail overlap, or failed benefit/quality. T3 inputs are accepted only by the T3-restill defaults. It MUST NOT infer blocks from summary text.

#### Scenario: Catalog is stale
- **WHEN** block refs were issued for a prior branch, epoch, or catalog
- **THEN** block mode rejects the full mutation and returns bounded fresh-discovery guidance

#### Scenario: Caller order differs from source order
- **WHEN** valid same-tier refs are supplied out of order
- **THEN** validation uses deterministic effective source order and records canonical child order

### Requirement: One-level decompression restores immediate children atomically
For a v3 parent, decompression with `depth:"one"` SHALL validate leaf digest and current lineage, atomically deactivate the parent for explicit decompression, and reactivate exactly its immediate children. If any child cannot be restored without overlap or multiple active parents, the operation SHALL append nothing.

#### Scenario: T3 one-level decompression succeeds
- **WHEN** a valid active T3 has unchanged inactive T2 children
- **THEN** the T3 becomes inactive and exactly those T2 children become active in one transaction

### Requirement: Raw decompression restores bounded original source
Decompression with `depth:"raw"` SHALL accept 1–16 root block refs, reject duplicates/overlapping ancestor roots, compute the recursive ordered descendant closure from those roots using stored child IDs plus recursive digests, and validate every digest without requiring a full parent leaf array. The unique closure, including roots, SHALL be at most 256 blocks. It SHALL atomically deactivate each selected root and every descendant covering those closures so original raw messages become visible; an over-bound request rejects before append.

#### Scenario: Raw closure exceeds the bound
- **WHEN** a parent reaches more than the configured maximum descendants
- **THEN** raw decompression appends nothing and reports only bounded IDs/counts

#### Scenario: Explicit raw restoration is replayed
- **WHEN** Session reloads after a valid raw-decompression transaction
- **THEN** raw source remains visible and automatic lifecycle work does not reactivate it

### Requirement: Recompression restores only an unchanged prior parent
Recompression SHALL reactivate the exact explicitly decompressed parent only when leaf digest, child closure, tier, accepted quality metadata, projection version, and explicit provenance remain unchanged and no overlapping active parent exists. It SHALL atomically hide/deactivate the exposed child/raw coverage and MUST NOT generate or silently alter a summary.

#### Scenario: Source changed after decompression
- **WHEN** any leaf source or lineage digest differs
- **THEN** recompression rejects and leaves the explicit decompressed view unchanged

### Requirement: Deterministic checkpoints use the maximal safe active layer
For each discarded segment, deterministic checkpoint planning SHALL choose maximal active accepted semantic nodes in priority T3, T2, T1 without including a parent and descendant. Nodes SHALL provide exact complete coverage and accepted current quality/token metadata. Any uncovered, overlapping, unevaluated, stale, or mixed-epoch segment SHALL make deterministic planning unavailable and preserve Pi native fallback.

#### Scenario: T3 exactly covers one discarded segment
- **WHEN** an accepted active T3 covers the segment completely
- **THEN** its summary enters deterministic checkpoint input and its T2/T1 descendants do not

#### Scenario: One gap exists between maximal nodes
- **WHEN** active maximal blocks leave any discarded semantic atom uncovered
- **THEN** deterministic planning returns `undefined`

### Requirement: Checkpointed blocks become query-only ancestry without source loss
After a persisted custom or native CompactionEntry, every prior v1/v2/v3 block SHALL derive inactive `epoch`/query-only status. It MUST NOT be projected, repaired, decompressed, recompressed, or consumed by a current parent. Bounded archived metadata/summary lookup and exact current-branch source search SHALL remain available from unchanged Session history.

#### Scenario: New epoch catalog is built
- **WHEN** compaction completes
- **THEN** current refs begin in the new epoch and old block refs cannot be used for mutation

#### Scenario: User searches old source
- **WHEN** source still belongs to the selected current Pi branch
- **THEN** exact-source search may return bounded excerpts even though the old semantic block is query-only

### Requirement: v1/v2 blocks remain maximal legacy leaves
AILI SHALL not rewrite, automatically re-summarize, or consume v1/v2 blocks as children of any v3 semantic transaction. Legacy blocks remain maximal leaves for projection/checkpoint only when their existing proof is valid; otherwise deterministic planning falls back to Pi. No compatibility-child marker exists. The only upgrade is explicit decompression exposing raw messages followed by a new exact v3 T1 operation.

#### Scenario: Caller selects a legacy block as child
- **WHEN** block mode names any v1/v2 block with v3 children
- **THEN** the operation rejects without fabricated lineage

#### Scenario: User upgrades legacy coverage
- **WHEN** the user explicitly decompresses a legacy block and then selects exact safe raw messages
- **THEN** a new T1 may be created under normal quality/economics gates without rewriting legacy history

