## ADDED Requirements

### Requirement: Recent context is protected as complete protocol atoms
AILI SHALL classify provider-visible messages into complete protocol atoms and SHALL protect the newest whole atoms until both `preserveRecentAtoms=8` and the effective token tail `min(12000, floor(0.10 * contextWindow))` are covered. It SHALL always protect the unfinished current turn, incomplete/malformed protocol groups, binary/secret/protected atoms, and the newest user message. Config MAY increase protection but MUST NOT weaken hard protocol or secret protection.

#### Scenario: Token boundary cuts a tool atom
- **WHEN** the effective recent-token limit falls between an assistant's sibling tool calls and their matching results
- **THEN** the entire tool-call/result atom remains protected

#### Scenario: Last user is older than the atom tail
- **WHEN** the newest user message is outside the count/token tail because of later complete tool iterations
- **THEN** it remains protected because `preserveLastUserMessage` is true

#### Scenario: Small model window is active
- **WHEN** 12,000 tokens exceeds ten percent of the active model context window
- **THEN** token-tail protection uses the ten-percent cap without reducing the eight-atom or hard-protection rules

#### Scenario: Context window is unavailable
- **WHEN** the active model window is missing or invalid
- **THEN** AILI protects the full configured 12,000-token tail, reports fallback provenance, and does not invent a smaller cap

### Requirement: Runtime selects exact source and owns quality extraction
AILI SHALL split eligible source at protected atom boundaries into maximal contiguous safe ranges and return exact current refs, catalog/scope/source digests, token bounds, and bounded exclusion counts. The mutation input remains the existing range/message input plus the unchanged caller-authored summary; callers submit no fact manifest, spans, source digest, or derived quality evidence. After resolving the exact supplied refs against the current catalog, the runtime SHALL freeze an in-memory canonical source snapshot, verify that it equals one recommendation, and only then extract facts and evaluate the summary. It MUST NOT re-read a moving source, silently filter source, or append on mismatch.

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

### Requirement: Semantic benefit uses conservative token economics
For canonical provider serialization of `N` UTF-8 bytes, `M` messages, and `P` tool parts, AILI SHALL compute profile baseline bounds as `ceil(N/maxBytesPerToken) + M*messageOverheadLower + P*toolOverheadLower` and `ceil(N/minBytesPerToken) + M*messageOverheadUpper + P*toolOverheadUpper`. Unknown providers SHALL use the wide fallback bytes/token `1..8`, message overhead `1..16`, and tool-part overhead `4..64`; binary/image/unknown protocol or saturated arithmetic SHALL be ineligible. For each candidate, AILI SHALL then compute:

`steadySavingsLower = max(0, sourceLower - replacementUpper)`;

`oneTimeCostUpper = discoveryInputUpper + resentSourceUpper + modelOutputUpper + toolCallUpper + toolResultUpper + cacheInvalidationEstimateUpper + safetyReserveUpper`;

`breakEvenTurnsUpper = ceil(oneTimeCostUpper / steadySavingsLower)`;

`netSavingsLower(H) = H * steadySavingsLower - oneTimeCostUpper`.

`replacementUpper` SHALL be obtained from the production projector and provider serializers and SHALL include every recap request/result and wrapper; all message/reference/topic/mode/tier/count/summary fields; separators; prior-summary and parent/child lineage surfaces; suffix; and provider serializer overhead. `oneTimeCostUpper` includes discovery, resent exact source, model output, tool call, tool result, a conservative cache-invalidation estimate, and an explicit safety reserve. No omitted or double-counted component may be hidden in a handwritten test formula. A candidate MUST have known finite bounds, positive steady savings, minimum savings `{T1:256,T2:512,T3:768}`, savings ratio at least 0.20, non-negative net savings, and break-even at most `{NORMAL:8,PRESSURE:4,FORCE_SEMANTIC:1}` turns. Checkpoint-required/overflow stages MUST NOT begin another semantic attempt.

#### Scenario: Character count looks beneficial but guaranteed tokens do not
- **WHEN** source and replacement characters imply a gain but `sourceLower <= replacementUpper`
- **THEN** AILI rejects semantic compression as token-benefit-ineligible

#### Scenario: One-time cost cannot break even under pressure
- **WHEN** steady savings are positive but break-even exceeds the current pressure horizon
- **THEN** AILI does not recommend or commit the candidate

#### Scenario: Checkpoint is already required
- **WHEN** pressure reaches `CHECKPOINT_REQUIRED` or `OVERFLOW_RECOVERY`
- **THEN** benefit planning yields to inherited deterministic/native checkpoint recovery

### Requirement: Token calibration is bounded and provider/model scoped
AILI SHALL key estimator state by provider, model, and estimator version. It SHALL accept only completed usage samples with known full input identity and reconcilable non-negative token fields, no image/binary, overflow, cancellation, retry, or compaction ambiguity, and observed/baseline ratio within `[0.25,4.0]`. From the latest 20 eligible samples after at least 5, lower and upper multipliers SHALL use clamped 0.90-min and 1.10-max ratios and move at most 25 percent per accepted window. Invalid/unavailable samples MUST retain conservative baseline bounds.

#### Scenario: Model changes
- **WHEN** provider or model identity changes
- **THEN** the prior calibration window is not reused for candidate eligibility

#### Scenario: Cache token semantics are ambiguous
- **WHEN** provider usage cannot be reconciled into total prompt tokens
- **THEN** the sample is excluded, a bounded reason count increases, and existing upper bounds are not narrowed

#### Scenario: Calibration outlier is observed
- **WHEN** actual-to-baseline ratio is outside the accepted range
- **THEN** the sample is rejected rather than expanding or shrinking policy without bound

### Requirement: Catastrophic-information-loss evaluation occurs before append
A default-enabled local evaluator SHALL run after exact runtime source selection and runtime-only fact extraction, and before any semantic transaction append. It SHALL classify goal/constraint, decision, artifact/symbol, failure/blocker, verification, open-work, protocol/provenance, and resolved-detail facts under the tier policy. Callers submit no manifest. All applicable hard facts MUST map to runtime-derived, UTF-16-addressed verified summary spans and exact durable refs; warning facts MAY commit with persisted bounded warning codes. Missing hard coverage, contradictory status, malformed metadata, evaluator error/unavailability, or unclassifiable high-risk source SHALL reject the whole mutation. Golden tests SHALL use independently hand-written expected manifests and SHALL not regenerate expected evidence with the production extractor.

#### Scenario: Summary drops an unresolved blocker
- **WHEN** source contains an unresolved failure/blocker hard fact but the manifest has no valid summary span for it
- **THEN** quality evaluation rejects before Session append and reports refs/codes/counts without source text

#### Scenario: Only warning detail is omitted
- **WHEN** every hard fact is covered but an eligible resolved-detail warning is absent
- **THEN** the block may commit with its tier, evaluator version, source-fact digest, coverage counts, and warning code

#### Scenario: Evaluator throws
- **WHEN** the evaluator is unavailable, times out, throws, or returns malformed metadata
- **THEN** the mutation fails closed, appends nothing, and does not claim quality PASS

### Requirement: Quality policy is tier-specific and cannot block checkpoint recovery
T1 SHALL hard-protect active goals/constraints, decisions, artifacts, failures, open work, and protocol structure; T2 SHALL additionally require release-relevant verification and aggregated coverage provenance; T3 SHALL retain current goal/state/invariants/decisions/artifacts/verification/blockers/Unverified items/next work. Resolved detail MAY downgrade from warning to optional at T3. Under force pressure, at most one semantic attempt occurs; at checkpoint/overflow, any quality rejection SHALL fall through to deterministic checkpoint or Pi native fallback and MUST NOT cancel recovery.

#### Scenario: T3 claims completion contrary to source
- **WHEN** source contains failed or Unverified release evidence but T3 summary says complete/passing
- **THEN** contradiction detection rejects the parent block

#### Scenario: Quality rejects under overflow pressure
- **WHEN** a semantic candidate fails quality while overflow recovery is active
- **THEN** AILI performs no semantic retry and follows the inherited custom-or-`undefined` checkpoint matrix

### Requirement: Quality rejections are redacted and overrides are explicit
Rejection output SHALL contain only evaluator/version/tier, bounded codes and counts, catalog/scope identity, and current refs. It MUST NOT echo source bodies, secrets, credentials, or raw fact text. An expert `quality.enabled=false` override SHALL be explicit in doctor and new transaction metadata; unevaluated blocks MUST NOT enter deterministic checkpoint coverage unless a separately validated migration supplies equivalent accepted metadata. During PR2, existing v2 writes MAY persist only bounded additive `qualityEvidence` (versions, digests, refs, UTF-16 spans, class/count/code verdicts) and MUST NOT persist raw source/fact text. This is the only permitted PR2 Session-schema addition; PR3 SHALL map it deterministically into v3 `quality` fields and reject ambiguous evidence.

#### Scenario: Protected credential-like source fails evaluation
- **WHEN** a quality error concerns protected source
- **THEN** output includes no protected text and the source remains uncommitted/protected

### Requirement: Dynamic guidance is a deterministic provider-only suffix
AILI SHALL keep static system/tool instructions byte-stable and SHALL build dynamic guidance only as one transient provider-context custom message with `customType="aili-compact-provider-suffix"`, `display=false`, and `timestamp=0` after a complete protocol atom. The suffix SHALL never be appended to Session JSONL, assigned a message/block ref, included in replay/search/source coverage, or copied into semantic source. It SHALL be rebuilt per request and bounded to 2,048 characters and 512 estimated tokens.

#### Scenario: Pressure recommends compression
- **WHEN** pressure is not normal and safe ranges exist
- **THEN** the suffix contains stable-ordered version, pressure/headroom, catalog/scope, exact safe refs, eligible block/target tier, allowed actions, and checkpoint state without raw source

#### Scenario: Normal state has no recommended action
- **WHEN** pressure is `NORMAL` and there is no actionable lifecycle recommendation
- **THEN** no dynamic suffix is added and the system prompt remains unchanged

#### Scenario: Optional suffix data exceeds bounds
- **WHEN** eligible refs would exceed the suffix limit
- **THEN** optional refs are deterministically truncated before a bounded status-only fallback, without truncating a ref token or emitting source text

### Requirement: Cache identities separate static logical suffix and full surfaces
AILI SHALL compute four identities: `staticSurfaceIdentity` from provider/model plus byte-exact static system, immutable guidance, and active tool schemas; `logicalProviderPrefixIdentity` from the canonical pre-suffix provider messages produced by AILI's projector/serializer contract; `suffixFingerprint` from the exact rendered suffix or `none`; and `fullProviderInputIdentity` from logical prefix, suffix, branch, epoch, and projection hash. The logical identity describes AILI's pre-suffix request surface and MUST NOT be claimed equal to any provider's private cache-key or wire serializer. Only identical full identities are warm candidates; an actual cache hit requires provider-reported usage. Static/logical-prefix equality and suffix/full changes SHALL be reported separately.

#### Scenario: Only pressure suffix changes
- **WHEN** static system/tools and projection are unchanged but suffix content changes
- **THEN** static and logical-prefix identities remain equal, full identity is state-change, and telemetry does not count an actual hit without provider usage

#### Scenario: Display animation changes
- **WHEN** terminal width, widget animation, or display-only status changes
- **THEN** none of static surface, logical prefix, suffix fingerprint, or full input identity changes
