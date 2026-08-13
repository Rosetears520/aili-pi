## ADDED Requirements

### Requirement: Content-free Analytics schema
Analytics SHALL persist only versioned content-free event metadata: timestamps and durations, response and LLM-call counts, normalized and length-bounded provider/model identifiers, Pi-reported token and cost totals, normalized and length-bounded tool/skill/Agent/MCP identity classes or canonical names, outcomes, and categorized provider or tool errors. The schema SHALL bound field length, category cardinality, and unknown-value handling so user-controlled names cannot create unbounded aggregate keys. The ingestion boundary MUST reject or omit prompts, assistant or thinking text, tool arguments/results, raw error bodies, credentials, cwd, paths, labels, titles, and raw Pi session identifiers.

#### Scenario: Content-bearing event is rejected
- **WHEN** an event offered to Analytics contains prompt text, a tool result, a raw error body, or another forbidden field
- **THEN** the forbidden content is not persisted and the schema failure is surfaced without reproducing the content

#### Scenario: Allowed metadata is aggregated
- **WHEN** a completed Pi or AILI operation emits allowed category, timing, identity-class, count, usage, or outcome fields
- **THEN** Analytics appends the versioned metadata and makes it available to aggregate queries

### Requirement: Opaque per-session attribution
Analytics SHALL generate an independent random opaque scope for each Pi session and store its mapping as a Pi custom entry outside model context. Persisted Analytics MUST NOT derive or store the scope from the raw session ID, path, cwd, title, or label.

#### Scenario: Session aggregate uses opaque scope
- **WHEN** Analytics attributes events to one Pi session
- **THEN** records use only the random opaque scope and the mapping is excluded from model context

### Requirement: Append storage and bounded memory
Analytics SHALL use append-oriented local storage with multi-process-safe locking or single-writer serialization, atomic segment finalization, schema-version migration, corruption quarantine, and streaming or bounded aggregation rather than permanently loading all historical records into memory. Cleanup SHALL coordinate with concurrent appenders and SHALL either commit atomically or report a non-success without losing unrelated records. Exact memory and disk behavior MUST be measured with a long-running fixture before release readiness is claimed.

#### Scenario: Long history remains bounded in memory
- **WHEN** a fixture produces a growing Analytics history over an extended run
- **THEN** runtime memory stays within the accepted profiled bound without retaining the complete history in memory

#### Scenario: Concurrent append and cleanup
- **WHEN** one process appends while another performs an authorized range cleanup
- **THEN** locking and atomic replacement preserve accepted records, report the exact cleanup outcome, and leave no partially rewritten segment

#### Scenario: Corrupt segment is encountered
- **WHEN** startup or query encounters a truncated or schema-invalid segment
- **THEN** Analytics quarantines or skips it with a visible non-success diagnostic and does not treat corrupted data as a valid aggregate

### Requirement: Retention, size, and explicit cleanup
Analytics SHALL retain local metadata until the user explicitly deletes it, SHALL report total store size, and SHALL support deletion by selected time range or all data. Normal operation MUST NOT silently auto-delete accepted history.

#### Scenario: Time-range cleanup
- **WHEN** the user confirms deletion of an Analytics time range
- **THEN** only matching records are removed, the operation reports its outcome, and unrelated retained history remains

#### Scenario: Complete cleanup
- **WHEN** the user confirms deletion of all Analytics data
- **THEN** the Analytics store becomes empty without deleting Pi conversation JSONL or other AILI stores
