## MODIFIED Requirements

### Requirement: T2/T3 promotion and bounded T3 restilling are explicit
A T2 parent SHALL consume 2–16 T1 children. A T3 parent SHALL consume 2–16 T2 children. T3-to-T3 restilling SHALL also be enabled by default and may consume 2–16 semantically adjacent active T3 children to create a replacement T3; it is rank-preserving consolidation, not T4. Defaults are `restill.enabled=true`, `minChildren=2`, `minSourceTokens=8000`, `minSavingsTokens=1024`, `minSavingsRatio=0.25`, `maxSummaryTokens=3000`, and `minTurnsSinceCreate=8`. All children SHALL be semantic v3, active, current epoch, queryable, semantic-leaf-adjacent, same-tier, parentless, old enough, and pass recursive digest/count, quality, and production-projected benefit checks. Parent creation and child deactivation are one atomic derived transition. The stricter restill thresholds bound churn while allowing long-lived T3 runs to reduce wrapper/reference overhead.

Semantic-leaf adjacency SHALL preserve each child's exact leaf interval and SHALL treat a raw effective-provider-ordinal gap as transparent only when the immutable current branch proves that every intervening provider message belongs to complete, well-formed AILI-owned `aili_compact_status` or `aili_compact` planning protocol. Transparent protocol remains persisted and auditable but MUST NOT become semantic source, a parent leaf, digest/count input, summary content, or recent-tail input. Lifecycle status and mutation validation SHALL use the same classifier. Any ordinary user/assistant message, third-party tool protocol, incomplete or malformed AILI atom, unknown ordinal, or mixed gap SHALL split the run and fail closed.

Raw epoch-local provider-message intervals SHALL remain authoritative. Every accepted non-empty gap SHALL have exactly one closed `TransparentPromotionGapV1 {version:1,leftChildBlockId,rightChildBlockId,leftLeafEntryId,rightLeafEntryId,messageCount,gapDigest}` in child order, with at most 15 proofs and a bounded message count per gap. The proof is not authority: planner preflight, pure replay, and BranchIndex replay SHALL independently locate the boundary leaves in the immutable branch, derive the exclusive raw message slice, recompute the canonical digest/count, and rerun the strict classifier. Unknown versions/fields, missing or reordered endpoints, duplicate/non-adjacent bindings, oversized slices, count/digest mismatch, classifier mismatch, or pure/index disagreement SHALL reject atomically. Proof omission is valid only when adjacent child raw intervals are already `+1`, preserving strict-adjacent existing v3 transactions.

A block parent SHALL retain the raw hull from its first child leaf through its last child leaf. For block-source parents that hull width MAY exceed recursive semantic `leafCount` only by independently proven transparent gaps. Recursive leaf order, `leafCount`, and `v3ParentLeafDigest` SHALL contain child semantic leaves only and SHALL remain exact.

#### Scenario: Mixed T1 and T2 children are requested
- **WHEN** `mode:"blocks"` names children of different tiers
- **THEN** mutation rejects cross-tier merge and recommends normalizing adjacent lower-tier blocks first

#### Scenario: Child has an active parent
- **WHEN** a requested block is already consumed by an active parent
- **THEN** selection rejects it and does not create two active parents

#### Scenario: Valid T2 parent crosses only AILI planning protocol
- **WHEN** two or more active T1 blocks pass all checks and every ordinal between child leaf intervals is complete AILI-owned status/compact planning protocol
- **THEN** status recommends the group and one v3 transaction appends the T2 parent, atomically deactivates exactly those children, and excludes the transparent protocol from recursive leaves

#### Scenario: Promotion gap contains non-AILI source
- **WHEN** a child gap contains an ordinary message, third-party tool atom, malformed or incomplete AILI protocol, unknown ordinal, or mixed ownership
- **THEN** status does not recommend the group and direct mutation rejects without append

#### Scenario: Gap proof is forged or unavailable during replay
- **WHEN** a non-empty child gap has an unknown, missing, oversized, endpoint-mismatched, count-mismatched, digest-mismatched, or non-AILI proof, or pure and indexed replay disagree
- **THEN** the parent transaction is rejected atomically and no transparent protocol becomes a semantic leaf

#### Scenario: Strict-adjacent existing parent has no proof
- **WHEN** adjacent child raw intervals are already `+1` and the otherwise valid transaction has no gap proof
- **THEN** replay accepts it without inventing a proof or changing recursive leaf identity

#### Scenario: T3 restill defaults are not met
- **WHEN** T3 children are fewer than two, younger than eight turns, below 8000 source tokens, exceed 3000 summary tokens, or miss 1024/0.25 savings
- **THEN** no T3 replacement is created

#### Scenario: Valid T3 restill commits
- **WHEN** 2–16 eligible semantically adjacent T3 children pass all default gates
- **THEN** one T3 replacement is atomically activated, its children deactivate, and recursive leaf digest/order remains exact
