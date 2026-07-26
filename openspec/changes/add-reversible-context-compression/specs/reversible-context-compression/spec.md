## ADDED Requirements

### Requirement: AILI Compact is one owned Pi runtime component
AILI SHALL register one default-enabled AILI Compact component through the existing owned Extension entry, after native integrations. It SHALL expose only `/aili-compact` and the `aili_*` model-tool namespace; it MUST NOT create another Package/Extension entry or user-facing ACP/DCP alias.

#### Scenario: Runtime loads the complete namespaced surface
- **WHEN** Pi loads `extensions/index.ts`
- **THEN** one owned AILI Extension registers `aili_compact`, `aili_decompress`, `aili_prune`, `aili_search_context`, `aili_compact_status`, `aili_context_recap`, and `/aili-compact` without duplicate registration

### Requirement: Pi-persisted Session entries remain the source of truth
AILI Compact SHALL NOT rewrite, delete or replace any previously persisted Pi Session JSONL/tree entry. It SHALL append only normal tool results or versioned custom automatic/control entries and generate compression only as a provider-time projection.

#### Scenario: Compression does not mutate persisted source
- **WHEN** a semantic/message compression, prune, search, decompression, control or automatic action completes
- **THEN** every pre-existing JSONL line remains byte-identical and any state change is represented only by appended Pi entries

### Requirement: Current-branch state and references replay deterministically
The component SHALL rebuild state from valid transactions on `sessionManager.getBranch()`. Model mutations SHALL commit exactly once in successful matching tool-result details. Automatic and direct human controls SHALL append one versioned custom envelope but SHALL NOT create semantic/prune blocks or model-authored summaries. Invalid, incomplete, off-branch, wrong-epoch, digest-mismatched or protocol-invalid entries SHALL not alter projection.

It SHALL derive bounded branch/epoch-scoped references that resolve to exact current-branch Pi entry IDs and block identities. Message refs SHALL use `m` plus a six-digit 1-based current-epoch message ordinal; block refs SHALL use `b` plus a six-digit 1-based accepted-block replay ordinal. Same-transaction block order SHALL follow its block array. References SHALL remain stable across reload on the same branch/epoch and SHALL never replace source IDs/digests as persisted authority. Status SHALL return a `catalogId`, page replay-ordered candidates with integer `offset >= 0`, `limit` 1..64 and `nextOffset`, plus at most 32 active blocks. `catalogId` SHALL be the SHA-256 digest of epoch and eligible source/block IDs; mutations consuming refs SHALL echo it, and stale catalog IDs SHALL fail without state.

New mutations SHALL use `aili.compact.tx.v2` with validated mode/topic/anchor/run/child lineage and lifecycle fields. Existing `v1` entries MAY be upgraded deterministically from replay evidence; any legacy block whose anchor/lineage cannot be proved SHALL remain query-only and SHALL NOT affect provider projection.

#### Scenario: Reload and fork preserve branch isolation
- **WHEN** a session reloads or branches before/after a valid transaction
- **THEN** each current branch rebuilds only its valid ancestry, references and active state without relying on in-memory cache

#### Scenario: Model submits an unknown reference
- **WHEN** a mutation names an ambiguous, off-branch, archived or unknown message/block reference
- **THEN** the tool returns an error result with no transaction details and the next projection is unchanged

### Requirement: AILI Compact supports bounded range and message compression
`aili_compact` SHALL be a sequential sole-call mutator with explicit `range` and `message` modes. Range mode SHALL accept bounded start/end reference and summary batches. Message mode SHALL accept bounded individual message reference/topic/summary batches. Both SHALL validate current epoch, complete protocol atoms, protected content, non-overlap, nested lineage, summary bounds and material projected benefit before returning a transaction.

#### Scenario: Requested range splits a protocol atom
- **WHEN** a range includes only part of a tool-calling assistant message and its matching results
- **THEN** the operation commits no transaction and reports the incomplete atom

#### Scenario: Compression would not save material context
- **WHEN** selected source size does not exceed recap/protocol overhead by the configured minimum benefit
- **THEN** the tool returns a bounded not-worth-compressing error and leaves state unchanged

### Requirement: Active compression summaries have deterministic recap anchors
For every active semantic block, provider projection SHALL remove its complete source atoms and insert at the original anchor a deterministic assistant tool-call plus successful `aili_context_recap` tool-result pair containing the persisted summary and bounded block/range/topic metadata. Historical compact calls SHALL not duplicate an already-active summary through stale tool arguments. `aili_context_recap` SHALL have schema `{ blockRef?: string }`: omission lists at most 32 active blocks in replay order with 200-character previews; an active ref returns its full committed summary and bounded metadata. Unknown/inactive/archived refs SHALL return explicit errors without raw source or state mutation.

#### Scenario: Active block is projected repeatedly
- **WHEN** unchanged state is projected more than once
- **THEN** the same recap call/result identity and content appear at the same anchor, source atoms and stale compact calls remain absent, and no recap artifact is persisted to JSONL

#### Scenario: Recap is queried directly
- **WHEN** the model calls `aili_context_recap` with an active block reference
- **THEN** it receives that persisted summary and bounded metadata without restoring raw source content

### Requirement: Projection is deterministic and fail-open
The context handler SHALL align Pi context entries to chained messages without modifying source objects. It SHALL preserve unmatched external messages, roles, whole tool-call/result pairs, at least one real user message, protected content and recap anchors. It SHALL validate whole output, idempotence and canonical hash. It SHALL return exact input messages on any unprovable invariant and record only bounded non-content diagnostics.

#### Scenario: Alignment cannot prove identity
- **WHEN** duplicate/ambiguous fingerprints, digest drift, anchor loss or protocol drift prevents safe projection
- **THEN** the handler returns the original messages unchanged and reports a bounded WARN/ERROR diagnostic

#### Scenario: Provider serialization occurs
- **WHEN** projected Pi messages are serialized for any supported provider adapter
- **THEN** transaction `details`, diagnostics, source bodies outside projection and custom prompt snapshots do not become provider message content

### Requirement: Consumed tool results cool safely and in bounded groups
AILI Compact SHALL cool only eligible consumed text-only tool results. Current-turn, image/mixed, context-management, unpaired and policy-protected results MUST remain raw. Stubs SHALL retain protocol identity and bounded metadata. A policy pass SHALL append at most one grouped automatic transaction per assistant turn and only when aggregate projected gain meets the configured threshold.

#### Scenario: Immediate follow-up remains raw
- **WHEN** Pi prepares the first provider call after an assistant produced tool results
- **THEN** those results are still visible in full and no automatic cooling transaction is active for them

#### Scenario: Several old results become eligible together
- **WHEN** a deterministic candidate batch crosses the configured minimum gain
- **THEN** at most one automatic transaction contains the bounded eligible set rather than progressively changing one arbitrary old prefix per request

### Requirement: Prune, dedupe and purge-error are protected and cache-safe
`aili_prune`, deduplication and purge-error SHALL operate only on complete consumed tool-result atoms and SHALL respect hard/configured protected tools and file patterns. Hard protection SHALL include every `aili_*` atom, incomplete/unpaired atoms, image/mixed results, current-turn/unconsumed atoms, at least the two most recent user messages, and unresolved tool/file metadata. Optional all-user and balanced `<protect>...</protect>` policies SHALL apply before strategy selection. Tool names SHALL normalize lowercase; candidate paths SHALL normalize lexically against `cwd` without filesystem access. File globs SHALL support only `*` within a segment, `**` across segments and `?` for one non-separator character. Parse/path uncertainty SHALL fail protected. Arbitrary semantic user/assistant content SHALL require summarized compression instead of prune. Enabling an automatic strategy SHALL not rely on mutation of persisted historical messages or a provider-unsafe in-place rewrite.

#### Scenario: Protected tool or file output is selected
- **WHEN** explicit prune or an automatic strategy encounters hard-protected tool/file content
- **THEN** that atom remains raw and the decision is visible only as bounded counts/reasons

### Requirement: Manual mode and commands have functional semantics
`manual` SHALL be state distinct from `autoCooling`. While manual mode is active, autonomous `aili_compact` calls SHALL fail unless the current turn has one unused `/aili-compact compress [focus]` trigger. The trigger SHALL authorize at most one compact attempt and SHALL be consumed by success, failure or turn completion.

Commands SHALL have these bounded semantics:

- `context [offset] [limit]` returns current epoch, paged refs/candidates, active blocks and policy; defaults 0/32, limit 1..64.
- `stats` returns distinct current-session/current-branch transaction/block/saving/cache counters without raw content.
- `sweep [limit]` uses default 8 and range 1..16, appending at most one all-or-nothing grouped cool transaction; no candidate appends nothing.
- `manual [on|off]` reports/toggles dedicated manual state without changing `autoCooling`.
- `compress [focus...]` appends one pending trigger and starts one short user-visible agent turn only when no conflicting/busy trigger exists.
- `decompress <block...>` and `recompress <block...>` accept 1..16 refs all-or-nothing. Direct human controls MAY deactivate/reactivate eligible existing current-epoch blocks but SHALL NOT create summaries or revive archived/GC blocks.

Invalid/unsupported command arguments SHALL append no state and SHALL NOT start a provider request.

#### Scenario: Model compresses in manual mode without a trigger
- **WHEN** manual mode is active and no pending one-shot trigger exists
- **THEN** `aili_compact` returns an error without a transaction

#### Scenario: User recompresses an eligible block
- **WHEN** `/aili-compact recompress` names a current-epoch block previously deactivated by explicit decompression
- **THEN** one append-only control reactivates that existing block and no new summary is created

### Requirement: Search and decompression respect Pi branch, nesting and epoch semantics
`aili_search_context` SHALL search only the current active branch and return bounded exact excerpts/source references. `aili_decompress` SHALL restore 1..16 valid active blocks all-or-nothing in the current epoch, preserve nested run/parent-child semantics, and return replay-ordered source refs plus at most 2,000 UTF-8 characters of exact restored excerpts and a truncation flag. Post-compaction archived blocks SHALL be query-only and never reinserted into active provider context.

#### Scenario: Decompression targets an archived block
- **WHEN** a request names a block from an earlier native compaction epoch
- **THEN** the tool returns an explicit archived/query-only response and does not alter the active Pi summary-plus-tail context

#### Scenario: Parent block is decompressed
- **WHEN** a current active parent block contains previously consumed child blocks
- **THEN** its eligible children reactivate deterministically according to lineage without duplicating their source or summaries

### Requirement: Adaptive guidance and custom prompts are bounded
AILI Compact SHALL provide deterministic context-limit, turn and iteration guidance based on configured thresholds, growth/frequency and emergency policy. Guidance SHALL tell the model to obtain valid references from status/search before compression and SHALL use Pi's public system-prompt hook rather than a synthetic hidden user message.

ACP-style custom prompts SHALL be disabled unless `experimental.customPrompts` is explicitly true. Only six fixed slots are recognized under global `~/.pi/agent/aili-compact-prompts/` and project `<cwd>/.pi/aili-compact-prompts/`: `system.md`, `compress-range.md`, `compress-message.md`, `context-limit-nudge.md`, `turn-nudge.md`, and `iteration-nudge.md`. Project files SHALL override same-name global files. Unknown files SHALL be ignored with `prompt-unknown-slot`. Each file SHALL be at most 4 KiB and the snapshot at most 8 KiB. Slot text SHALL not override immutable schema/protocol/safety rules.

#### Scenario: Custom prompts are enabled
- **WHEN** valid global/project slot files exist and custom prompts are enabled
- **THEN** the current session uses a bounded deterministic six-slot snapshot through the corresponding system-guidance sections without writing user files

#### Scenario: Prompt or nudge input changes
- **WHEN** explicit reload or threshold transition changes effective guidance
- **THEN** the request is classified as a cache-input state change and prompt body remains absent from JSONL, diagnostics, widget and tool results

### Requirement: Subagent content is gated fail-open
Subagent compression/cooling SHALL be disabled by default. When explicitly enabled, AILI SHALL use public Pi lineage/status evidence, protect in-flight subagent calls/results, and expose only bounded completed-result summaries. If lineage or completion cannot be proven, content SHALL remain raw.

#### Scenario: Subagent lineage is ambiguous
- **WHEN** AILI cannot prove whether a tool result belongs to a completed subagent run
- **THEN** no compression/cooling transaction covers it and projection remains source-faithful

### Requirement: AILI Compact owns ordinary compaction while Pi retains emergency recovery
AILI Compact SHALL handle threshold/manual compaction according to its safe projection and command policy. It SHALL try deterministic major GC before allowing overflow. Blocks SHALL track bounded generation/age/lineage data for safe promotion, nesting and summary truncation. Pi native recovery SHALL remain available when AILI cannot prove a safe healthy result. Every completed Pi compaction, including an extension-provided AILI major GC, SHALL begin a new epoch from its persisted compaction summary plus kept tail; cancelled events SHALL NOT begin an epoch.

#### Scenario: Manual Pi compaction is requested while healthy
- **WHEN** a `session_before_compact` event has reason `manual` and AILI Compact is healthy
- **THEN** Pi compaction is cancelled with bounded guidance to `/aili-compact` and no persisted source entry is changed

#### Scenario: Overflow cannot be resolved by major GC
- **WHEN** active summaries do not cover every entry Pi would discard or bounded merge safety cannot be established
- **THEN** Pi overflow recovery proceeds and subsequent active projection starts from Pi's new summary and kept tail

### Requirement: Current Session cache accounting is replayable and low-overhead
AILI Compact SHALL display current-branch Pi Session cache totals separately from its repeated-request stability diagnostic. It SHALL reconstruct assistant usage once from `SessionManager.getBranch()` on session start/reload and explicit tree navigation, update totals in O(1) on each finalized assistant message, and SHALL NOT rescan Session JSONL for these totals from the provider `context` hook or widget rendering. It SHALL show numeric input, output, cache-read, cache-write, response and unavailable counts plus `cacheRead / (input + cacheRead + cacheWrite) * 100` when prompt tokens are nonzero.

#### Scenario: Session resumes after restart
- **WHEN** a persisted Pi Session is resumed or the Extension reloads
- **THEN** current-branch assistant usage is replayed once and the cache panel recovers the same Session totals without a provider request

#### Scenario: Normal provider request
- **WHEN** another assistant response completes without branch navigation
- **THEN** Session totals update from that response in O(1) without another historical usage replay

### Requirement: Cache identity and telemetry are truthful
AILI Compact SHALL provide deterministic canonical projection output and static immutable schema/safety metadata for unchanged state. Cache-input identity SHALL be SHA-256 of sorted-key canonical JSON containing provider ID, model ID, Pi session ID, epoch ID, branch leaf/source digest, projection hash, effective system/custom-guidance fingerprint and a sorted active-tool fingerprint over tool name/description/parameter schema/immutable prompt metadata.

Before response, the first request is cold, a changed identity is state-change and an identity matching the immediately previous completed request is a warm candidate. A warm candidate becomes eligible only when numeric `cacheRead` and `cacheWrite` are both reported. Eligible hit rate SHALL be `cacheRead / (input + cacheRead + cacheWrite) * 100`; zero prompt tokens are unavailable. The gate uses the last 20 eligible responses, requires at least 5 samples and passes only at `>=85%`. Cold, state-change, insufficient-sample and telemetry-unavailable requests SHALL be separately visible and excluded from the rate denominator.

#### Scenario: Provider omits cache fields
- **WHEN** usage exists but cache-read/write telemetry is absent
- **THEN** the request is counted as telemetry-unavailable rather than a zero-hit eligible request

#### Scenario: Full cache identity is unchanged
- **WHEN** provider/model/session, branch/epoch, projection, prompt guidance and tool surface are unchanged after warm-up
- **THEN** canonical input identity and earliest change index remain stable

### Requirement: Cache UI is bounded and responsive
The component SHALL provide concise footer data, on-demand bounded details and a responsive non-capturing below-editor widget enabled by default. The widget is the accepted Pi 0.81.1 public-API fallback for a right-side panel; it SHALL render current Session accounting as a left-aligned column and AILI stability as a right-aligned column across paired numeric-only rows, remain user-toggleable, hide in narrow terminals, rerender only on numeric state changes and never render prompt/tool/source bodies.

#### Scenario: Telemetry is unavailable
- **WHEN** the provider does not report cache telemetry
- **THEN** the UI labels the metric unavailable and never reports a synthetic cache hit rate

### Requirement: Configuration and diagnostics fail safely
The component SHALL default to enabled with global < project < session precedence. Objects SHALL deep-merge; scalars replace earlier values; project configurable arrays replace global arrays before deduplication; hard protections are unioned afterward. The normative config keys/defaults SHALL be:

- booleans: `enabled=true`, `manualMode=false`, `autoCooling=true`, `cachePanel=true`, `strategies.dedupe.enabled=true`, `strategies.purgeErrors.enabled=true`, `protection.protectUserMessages=false`, `protection.protectTags=false`, `subagents.enabled=false`, `experimental.customPrompts=false`;
- compression: `compress.mode=range`, `summaryMaxChars=6000` (256..10000), `summaryHardMaxChars=10000` (1000..12000 and >= normal), `minSourceChars=5000` (0..100000), `minSavingsChars=1000` (0..50000);
- protection: `recentUserMessages=2` (2..20), `tools=[]` and `fileGlobs=[]`, each max 64 before hard-set union;
- purge/nudges: `graceTurns=4` (1..50), min/max/emergency context percentages `45/55/98` with increasing order, `frequencyTurns=5` (1..50), `iterationThreshold=15` (1..100), `minGrowthRatio=0.45` (0..1), `minGrowthChars=5000` (0..100000);
- GC: `promotionSurvivals=5` (1..100), `maxBlockAge=15` (1..1000), `maxOldSummaryChars=3000` (256..10000), `majorThresholdPercent=100` (90..100).

Unknown keys, invalid JSONC, invalid type/range or invalid cross-field threshold SHALL produce bounded `config-*` diagnostics and contribute no invalid value. AILI SHALL NOT create, migrate or modify config/prompt files.

`off` SHALL return context input unchanged and suppress AILI guidance without deleting journal state. `restore-all` SHALL deactivate current-epoch blocks and disable auto cooling. Doctor health SHALL inspect reducer/reference/projection/recap/cache/prompt/native-hook state and SHALL NOT report healthy solely because the command is registered.

#### Scenario: User disables AILI Compact
- **WHEN** `/aili-compact off` succeeds
- **THEN** subsequent context events return their input unchanged while prior transactions remain recoverable metadata and AILI guidance is not injected

#### Scenario: Projection invariant has failed
- **WHEN** doctor observes a current reducer/reference/projection invariant error
- **THEN** component health is ERROR with bounded evidence rather than PASS-by-registration

### Requirement: Package-wide AGPL-3.0-or-later disposition is exact and prospective
Beginning with target `@rosetears/aili-pi@0.1.13`, the root Package SHALL declare `AGPL-3.0-or-later` consistently in `package.json`, root lock metadata, complete root `LICENSE` text, README, generated root SBOM record and generated distribution notice. Existing third-party dependencies/adaptations SHALL retain their own license declarations and notices. Previously published versions SHALL NOT be described as retroactively relicensed or revoked.

#### Scenario: Root license metadata drifts
- **WHEN** any release candidate root package, lock, LICENSE, README, generated notice or root SBOM record does not identify the accepted AGPL route
- **THEN** package/release validation MUST fail before publish

#### Scenario: Prior release is documented
- **WHEN** documentation refers to version 0.1.12 or earlier
- **THEN** it MUST preserve the previously granted license history rather than claim retroactive revocation

### Requirement: Packaged provenance records the AGPL reference boundary
Packaged provenance and notices SHALL identify `ranxianglei/opencode-acp@v1.12.6`, commit `f1a33d9f4ce55af808eb4e050717c914ed16084b`, repository and `AGPL-3.0-or-later` license. They SHALL state whether files/symbols were directly copied or only used as a behavioral reference; the current accepted boundary is no direct source/prompt/schema/fixture/asset copy.

#### Scenario: Reference attribution is absent
- **WHEN** the target tarball lacks the exact opencode-acp provenance/notice identity
- **THEN** provenance and release validation MUST fail

#### Scenario: A direct AGPL source copy is proposed
- **WHEN** implementation needs to copy a source file, prompt, schema, fixture or asset from the pinned source
- **THEN** affected work MUST stop until an exact copy/provenance approval records the affected files and local destinations

### Requirement: License resolution does not grant release operations
Resolving the package license SHALL remove only the named AGPL/MIT disposition blocker after deterministic evidence passes. It SHALL NOT convert stale provider/sandbox/external-workspace/TUI evidence to PASS and SHALL NOT itself authorize dependency, Git, version, publish or release operations.

#### Scenario: License checks pass while live evidence is stale
- **WHEN** AGPL package consistency passes but required Pi 0.82.1 live evidence remains stale or unverified
- **THEN** release validation MUST remain non-pass with only the still-applicable named evidence blockers
