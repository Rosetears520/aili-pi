## MODIFIED Requirements

### Requirement: Production events have one exact index update contract
The production extension entry SHALL route events through this table: `session_start|session_switch` => discard prior session identity and cold-build selected branch; `session_tree` with cached leaf and verified ancestry-prefix digest => snapshot switch, otherwise one cold rebuild; `message_end|tool_execution_end|custom_entry` with matching parent/tip => one incremental append; `session_before_compact` => read-only frozen snapshot; `session_compact` => atomically archive old epoch and cold-build new tail; provider/model change => estimator/calibration invalidation only; projection/quality/config version change => owned derived-index invalidation only; shutdown => discard. Parent/tip mismatch, malformed/duplicate IDs, impossible lineage, or digest mismatch marks unhealthy and invokes the exact pure fallback.

Official Pi `0.82.1` represents the actual root Session entry with `parentId: null`. The index SHALL accept and normalize that sentinel only for the first entry of a cold build or the first append to an empty index. A null parent on any later entry or non-empty-index append remains malformed and SHALL mark the index unhealthy without partial state. Empty-string, non-string, parent-tip mismatch, and impossible lineage behavior remain unchanged.

Prefix proof SHALL hash canonical ordered `(entryId,parentId,entryKind,payloadDigest)` records from the shared prefix and compare length, tip, and digest before structural sharing. On a healthy steady request, the full reducer, transaction replay, hash recatalog, protocol rebuild, protection rebuild, and catalog rebuild counters SHALL all remain zero; after projection there may be exactly one bounded monotonic pass over provider messages. Production extension-entry integration tests, not adapter-only tests, SHALL assert this table and counters.

#### Scenario: Cached branch ancestry mismatches
- **WHEN** length, tip, or canonical ancestry-prefix digest mismatches
- **THEN** AILI rejects reuse and performs one declared rebuild

#### Scenario: Healthy provider request
- **WHEN** no production event invalidated the selected snapshot
- **THEN** all full rebuild/reducer/hash/protocol/protection/catalog counters are zero and provider messages are visited at most once

#### Scenario: Index is unhealthy
- **WHEN** consistency validation fails
- **THEN** exact pure/fail-open output is used and every fallback/rebuild counter increments visibly

#### Scenario: Official Pi root uses a null parent
- **WHEN** cold build or the first append to an empty index receives the actual root entry with `parentId: null`
- **THEN** the index records a parentless root, remains healthy, and can reach one bounded provider-message alignment pass

#### Scenario: A later entry uses a null parent
- **WHEN** a non-root entry or append to a non-empty index carries `parentId: null`
- **THEN** the index rejects the lineage without exposing a partial append or controlled-production PASS
