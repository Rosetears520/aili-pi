## MODIFIED Requirements

### Requirement: Production events have one exact index update contract
The production extension entry SHALL route events through this table: `session_start|session_switch` => discard prior session identity and cold-build selected branch; `session_tree` with cached leaf and verified ancestry-prefix digest => snapshot switch, otherwise one cold rebuild; `message_end|tool_execution_end|custom_entry` with matching parent/tip => one incremental append; `session_before_compact` => read-only frozen snapshot; `session_compact` => atomically archive old epoch and cold-build new tail; provider/model change => estimator/calibration invalidation only; projection/quality/config version change => owned derived-index invalidation only; shutdown => discard. Parent/tip mismatch, malformed/duplicate IDs, impossible lineage, or digest mismatch marks unhealthy and invokes the exact pure fallback.

Official Pi `0.82.1` represents the actual root Session entry with `parentId: null`. The index SHALL accept and normalize that sentinel only for the first entry of a cold build or the first append to an empty index. A null parent on any later entry or non-empty-index append remains malformed and SHALL mark the index unhealthy without partial state. Empty-string, non-string, parent-tip mismatch, and impossible lineage behavior remain unchanged.

Prefix proof SHALL hash canonical ordered `(entryId,parentId,entryKind,payloadDigest)` records from the shared prefix and compare length, tip, and digest before structural sharing. BranchIndex SHALL create an immutable source-digested raw epoch projection for proof verification; it MAY retain Session-owned object references only for display and MUST NOT replay proofs from those mutable bodies. `VerifiedV3ReplaySeedV1` SHALL bind lifecycle state to source-prefix digest, epoch-boundary identity, replay digest, and projection/replay version; structural validity alone is insufficient. Every block structural digest and catalog ID SHALL include the source snapshot digest and, where present, each transparent-gap proof's source snapshot digest as well as source IDs/proofs/summary/quality/token metadata/creating transaction digest.

BranchIndex SHALL also derive the AILI-owned provider-facing frontier only from the verified current snapshot and current model/configuration context. The frontier cache SHALL be invalidated by branch, epoch, source/proof, descriptor, projection, model-context, reserve, or configuration identity changes. A healthy steady request SHALL perform no full reducer, transaction replay, hash recatalog, protocol/gap-index rebuild, protection rebuild, catalog rebuild, pre-tip raw-prefix materialization, or omitted-history provider alignment/canonicalization; it may derive one bounded descriptor frontier and one explicitly selected-recap expansion. Every raw entry visit, `entriesThroughOrdinal()` visit, descriptor derivation, selected-recap expansion, omitted raw byte/message count, frontier invalidation, and fallback SHALL increment a truthful counter. Production extension-entry integration tests, not adapter-only tests, SHALL assert this table and counters.

#### Scenario: Cached branch ancestry mismatches
- **WHEN** length, tip, or canonical ancestry-prefix digest mismatches
- **THEN** AILI rejects reuse and performs one declared rebuild

#### Scenario: Healthy provider request
- **WHEN** no production event invalidated the selected snapshot
- **THEN** all full rebuild/reducer/hash/protocol/protection/catalog counters are zero, omitted historical raw provider messages are not aligned/canonicalized, and the request derives at most one bounded descriptor frontier plus explicitly selected recap content

#### Scenario: Frontier cache identity changes
- **WHEN** the selected branch/epoch, verified source/proof revision, block descriptor identity, model context window, request reserve, or Compact configuration changes
- **THEN** the prior frontier is invalidated, no stale descriptor or full recap is reused, and one new bounded frontier may be derived from the verified current index

#### Scenario: Index is unhealthy
- **WHEN** consistency validation fails
- **THEN** exact pure/fail-open output is used and every fallback/rebuild counter increments visibly

#### Scenario: Official Pi root uses a null parent
- **WHEN** cold build or the first append to an empty index receives the actual root entry with `parentId: null`
- **THEN** the index records a parentless root, remains healthy, and can reach one bounded provider-message alignment pass

#### Scenario: A verified source is mutated after indexing
- **WHEN** a Session-owned nested message body is modified after a BranchIndex snapshot is created
- **THEN** the immutable raw projection remains the only proof input, source digest mismatch invalidates reuse, and the altered body cannot validate an old proof

#### Scenario: A replay seed has the wrong source prefix
- **WHEN** an otherwise structurally valid v3 replay seed has a different source-prefix digest or epoch boundary
- **THEN** the index rejects the seed and does not archive or replay it as verified state

#### Scenario: A later entry uses a null parent
- **WHEN** a non-root entry or append to a non-empty index carries `parentId: null`
- **THEN** the index rejects the lineage without exposing a partial append or controlled-production PASS
