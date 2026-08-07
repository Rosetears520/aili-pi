## MODIFIED Requirements

### Requirement: Runtime selects exact source and owns quality extraction
AILI SHALL split eligible source at protected atom boundaries and every effective-provider-ordinal discontinuity into maximal contiguous safe ranges and return exact current refs, catalog/scope/source digests, token bounds, and bounded exclusion counts. Provider-visible AILI status/compact protocol that is intentionally omitted from public source refs and recent-tail aging SHALL remain a hard range boundary through its effective provider ordinals. Current and indexed planning SHALL apply the same discontinuity rule. The mutation input remains the existing range/message input plus the unchanged caller-authored summary; callers submit no fact manifest, spans, source digest, or derived quality evidence. After resolving the exact supplied refs against the current catalog, the runtime SHALL freeze an in-memory canonical source snapshot, verify that it equals one recommendation, and only then extract facts and evaluate the summary. It MUST NOT re-read a moving source, silently filter source, bridge omitted provider protocol, or append on mismatch.

The handoff uses versioned closed types: `QualityInputV1 {version:1,tier,catalogId,sourceKind,orderedRefs,sourceDigest,summary}`, runtime-only `QualityManifestV1 {version:1,extractorVersion,sourceDigest,facts[]}`, and `QualityResultV1 {version:1,evaluatorVersion,verdict,codes,counts,qualityEvidence}`. Each fact records class, durable source refs, normalized anchors/digests, and half-open `summarySpanUtf16:{start,end}` measured in JavaScript UTF-16 code units. Unknown versions/fields, invalid surrogate boundaries, overlap where prohibited, out-of-bounds spans, stale refs, or any extraction/evaluation exception fail closed.

Normalization is exact: Unicode NFC; CRLF and lone CR become LF; no case folding; no whitespace trim/collapse; digest input is UTF-8 of `class + "\u0000" + durableRef + "\u0000" + normalizedText`. A span is verified by slicing the unchanged summary by UTF-16 offsets, applying that normalization, and comparing its digest/required anchors. Durable refs match exactly by kind and identity: agent=`sessionId/agentId`, job=`sessionId/jobId`, turn=`branchLeafId/turnEntryId`, message=`branchLeafId/epochId/entryId`, history=`canonicalSessionPathDigest/branchLeafId/entryId`; aliases, display refs, substring/fuzzy matches, and cross-branch/epoch refs are rejected.

#### Scenario: Caller submits broader source
- **WHEN** supplied range/message refs do not exactly equal one current recommendation
- **THEN** mutation rejects `source-summary-scope-mismatch`, appends nothing, and returns bounded fresh refs

#### Scenario: Runtime extraction fails
- **WHEN** exact source was selected but extraction, normalization, span validation, or durable-reference matching fails
- **THEN** evaluation fails closed and no transaction is appended

#### Scenario: Caller attempts to provide evidence
- **WHEN** a caller includes a manifest or derived quality fields
- **THEN** the closed public input rejects those fields rather than trusting caller-authored facts

#### Scenario: Omitted AILI protocol creates an ordinal gap
- **WHEN** persisted AILI status or compact caller/result messages are omitted from public source refs between two otherwise eligible messages
- **THEN** current and indexed planning split the safe ranges at that effective-provider-ordinal discontinuity while leaving the omitted protocol outside recent-tail aging

#### Scenario: Caller bridges omitted provider protocol
- **WHEN** a caller supplies refs on both sides of an omitted AILI protocol ordinal gap
- **THEN** exact mutation validation rejects `non-contiguous-source`, appends nothing, and does not reinterpret filtered catalog positions as provider ordinals
