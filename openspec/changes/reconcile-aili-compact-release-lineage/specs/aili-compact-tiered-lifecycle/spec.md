## MODIFIED Requirements

### Requirement: Active-block compression replaces fixed tier promotion
New AILI Compact mutations SHALL create a source-backed active block from an eligible exact source range, or atomically replace an explicit current selection of two to sixteen semantically adjacent active blocks. New writes SHALL NOT require or assign `T1`, `T2`, `T3`, restill, fixed child-count topology, tier age, tier source-floor, or tier-specific economics. The current model selects compactable ranges and requests summaries through the existing Compact tools; selected full summaries are available only through the bounded recap/decompression path for the relevant request.

Semantic-leaf order and immutable raw epoch proof remain mandatory. A raw ordinal gap may be crossed only when `VerifiedRawEpochSnapshotV1` proves complete, attested AILI planning protocol for every intervening raw message slot. Every `type:"message"` entry consumes one raw ordinal before filtering; malformed messages remain non-semantic and make a gap non-transparent. The verified source index, planner, mutation validator, and replay share the same classifier. Existing v3 tiered entries remain readable for rollback and source verification, but a new active-block mutation neither requires nor produces their tier topology.

An active-block replacement keeps the exact ordered semantic leaves and source proof of its selected children, atomically deactivates them only after the replacement validates, and never credits recursive raw leaves, historical tool output, transaction-authored token fields, or AILI planning protocol as source content. The default 15,000-character target and 18,000-character hard ceiling remain quality limits for any model-authored summary; they no longer constitute a hierarchy gate.

#### Scenario: Current active blocks are composed
- **WHEN** the model explicitly selects two to sixteen current semantically adjacent active blocks and their source proofs are valid
- **THEN** the runtime exposes their bounded recaps for that request and may atomically replace them with one source-backed active block without assigning a tier

#### Scenario: A selection is stale or crosses non-transparent source
- **WHEN** any selected block is inactive, from another branch/epoch, non-adjacent, stale, or separated by ordinary, third-party, malformed, permission-denied, unattested, unknown, or mixed source
- **THEN** planning produces no selectable composition and direct mutation rejects without append

#### Scenario: A legacy tiered record is replayed
- **WHEN** a persisted v3 T1/T2/T3/restill transaction is encountered during replay or rollback
- **THEN** its existing source/digest rules remain readable, but no later active-block write depends on its tier or restill policy

### Requirement: Provider-facing active frontier is bounded and source-independent
AILI SHALL derive a disposable provider-facing frontier separately from the authoritative source-proof ledger. The frontier SHALL contain protected recent raw content, no more than 32 active-block descriptors in semantic-leaf order, and full summary content only for 1–16 current block references explicitly resolved through recap/decompression for that request. It SHALL NOT automatically include historical raw messages, all active full summaries, recursively expanded ancestor summaries, or protected historical tool output.

Every descriptor SHALL bind the current block reference, bounded preview/topic, branch, epoch, source revision, and structural identity without becoming semantic source, proof input, or mutation authority. A unified legacy/v3 descriptor catalog SHALL assign public references and apply the 32-descriptor cap only after ordering blocks by their first verified effective semantic-leaf ordinal. A legacy block without a verifiable current semantic source remains ledger-readable but SHALL be absent from the default frontier rather than assigned a guessed order. A successful active-block replacement SHALL atomically consume its selected blocks in the ledger and replace their frontier descriptors; its source remains retrievable from the ledger only through the ordinary bounded search/decompression path. A frontier omission SHALL NOT change raw ordinals, leaf digest/count, source availability, status eligibility, or replay.

Before an explicit full-summary expansion, AILI SHALL apply the active model context window and current request reserve through the existing conservative token bounds. A retained selection SHALL bind verified branch key, epoch, source revision, proof revision, descriptor identity, configuration identity, model profile, context window, reserve, and selected references. An unknown window, stale descriptor/child binding, unavailable summary, malformed recap pair, branch/cache switch, or over-budget expansion SHALL atomically drop the retained recap call/result pair, return a bounded no-expansion or stale result, append no transaction, and SHALL NOT fall back to projecting omitted historical raw content. A healthy steady provider request SHALL derive at most one bounded frontier from the verified current index and expose truthful descriptor/expansion/omission/invalidation counters.

#### Scenario: Many active blocks remain in the ledger
- **WHEN** more current-epoch active blocks exist than fit as full summaries in one request
- **THEN** planning and search can address every ledger block, while the default provider frontier contains at most 32 descriptors and no automatic full-summary expansion

#### Scenario: Mixed legacy and v3 blocks cross the frontier cap
- **WHEN** an older legacy block and later v3 blocks share a current branch whose active descriptors exceed 32
- **THEN** the legacy block's verified effective semantic-leaf ordinal orders it before later v3 blocks and it is not displaced by schema-family append order

#### Scenario: A legacy block has no verifiable current source position
- **WHEN** a legacy block remains replay-readable but its first source entry has no verified current effective semantic-leaf ordinal
- **THEN** it remains available from the ledger but is absent from the default provider frontier and no source position is guessed

#### Scenario: A replacement needs selected block summaries
- **WHEN** the active model explicitly resolves two to sixteen current blocks through recap/decompression and their exact conservative upper bound fits the current model request budget
- **THEN** those selected summaries are available for that one provider turn and the subsequent ordinary active-block replacement remains bound to exact source proof and summary quality limits

#### Scenario: Selected recap expansion cannot fit
- **WHEN** the model context window is unknown, a selected child is stale, or selected full summaries exceed the current request budget
- **THEN** AILI returns no expansion, appends no parent transaction, exposes the bounded reason, and retains all ledger source/proofs without projecting omitted raw history

#### Scenario: Replacement updates the frontier
- **WHEN** an active-block replacement commits successfully
- **THEN** its selected blocks deactivate in the ledger and disappear from the next active frontier, while the replacement descriptor becomes current and exact source recovery remains available on demand
