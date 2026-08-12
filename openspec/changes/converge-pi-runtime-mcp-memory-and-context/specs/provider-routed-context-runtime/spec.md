## ADDED Requirements

### Requirement: Compaction ownership is selected by provider
AILI SHALL route an exactly compatible canonical `openai-codex` model using API `openai-codex-responses` to one pinned `@narumitw/pi-codex-compact` runtime. Every other canonical provider/model, including direct `openai`, Azure, custom OpenAI-compatible endpoints and non-OpenAI providers, SHALL route to the complete `billion-context-pi` runtime. The route key is the turn-frozen canonical provider/API/model identity. Missing or internally contradictory identity SHALL fail before context, payload, transport or compaction mutation. Exactly one runtime SHALL own context rewriting and compaction for each provider turn.

#### Scenario: Compatible Codex turn begins
- **WHEN** the active provider is `openai-codex`, the API is `openai-codex-responses`, and the model satisfies the pinned package compatibility contract
- **THEN** `pi-codex-compact` may own Remote V2 compaction/replay and ACP context projection/compaction cancellation does not act

#### Scenario: Direct OpenAI turn begins
- **WHEN** the active canonical provider is `openai`
- **THEN** `billion-context-pi` owns context/compaction and no Codex Remote V2 marker, checkpoint or provider hook acts

#### Scenario: Other provider begins
- **WHEN** the canonical provider is not an exactly compatible Codex route, including Azure or a custom OpenAI-compatible endpoint
- **THEN** `billion-context-pi` owns context rewriting/compaction and Codex Remote V2 hooks return no changes

#### Scenario: Provider route is ambiguous
- **WHEN** no canonical provider/API/model identity can be frozen or later hooks observe a contradictory turn token
- **THEN** the turn fails before either runtime mutates context, payload, transport, compaction or persisted state

### Requirement: The selected upstream boundaries remain complete and attributable
AILI SHALL retain the complete tracked source tree, tests, scripts, fixtures, documentation, package metadata, license, copyright and attribution from `billion-context-pi@0.1.34`. AILI SHALL consume one exact verified `@narumitw/pi-codex-compact` package/source identity with its MIT license, package contents, documentation and tests represented in provenance. AILI MUST NOT load, vendor, adapt or register `algal/pi-openai-server-compaction` in the current production runtime. Algal comparison evidence remains documentation-only in `compaction-decision.md`.

#### Scenario: Upstream inventory is validated
- **WHEN** the pinned billion-context tree and pinned Codex package inventory are compared with package/provenance inputs
- **THEN** every required source and license is represented, every local ownership patch has a reason/test, and no excluded algal production file or hook appears

#### Scenario: Pi compatibility needs behavioral change
- **WHEN** Pi `0.84.1` or package composition cannot satisfy the pinned public contract without source adaptation
- **THEN** BUILD stops for material discovery rather than silently forking, deleting behavior or widening a peer range

### Requirement: Codex Remote V2 replay is exact, bounded and fail closed
For compatible Codex models, `pi-codex-compact` SHALL own automatic, manual, threshold and overflow Remote Compaction V2 behavior, persist one versioned opaque checkpoint with bounded replacement history, and replay it only through exact marker replacement. Replay SHALL require matching provider/API/model identity, one expected checkpoint marker, valid bounded checkpoint data and exact retained-message fingerprints. Pi's built-in Codex provider SHALL remain ordinary-turn transport owner.

#### Scenario: Remote compaction succeeds
- **WHEN** the compatible Codex backend returns one valid completed opaque compaction item
- **THEN** Pi persists the bounded checkpoint/replacement history and later compatible requests replace exactly one validated marker

#### Scenario: Checkpoint shape is inconsistent
- **WHEN** the model differs, the marker is missing/duplicated, checkpoint data is malformed/oversized, or a retained-message fingerprint differs
- **THEN** the runtime does not guess or inject opaque history and exposes the truthful marker/fallback context

#### Scenario: Repeated compaction occurs
- **WHEN** a compatible session containing a valid prior checkpoint compacts again
- **THEN** the prior checkpoint is expanded exactly once into the next compaction request and one new bounded checkpoint supersedes it

#### Scenario: Remote path fails
- **WHEN** authentication, transport, protocol or validation fails without user cancellation
- **THEN** the documented Pi-native plaintext compaction fallback may run and the failure is visible rather than silently reported as Remote V2 success

#### Scenario: User cancels Remote V2
- **WHEN** user-owned cancellation occurs during the remote request
- **THEN** no fallback or duplicate remote request starts and the terminal result remains cancelled

### Requirement: Codex retry has one owner
Pi `0.84.1` SHALL remain the sole attempt-budget and backoff owner. The Codex integration MUST configure extension-owned transport retries to zero or prove an equivalent single-owner arrangement in which one provider failure cannot produce both extension retry attempts and Pi retry attempts.

#### Scenario: Transient Remote V2 transport failure occurs
- **WHEN** the remote request fails with a retryable transport condition
- **THEN** at most one active transport exists for the Pi attempt and any later attempt is attributable to the Pi retry owner

#### Scenario: Retry policy is disabled
- **WHEN** Pi retry is disabled
- **THEN** the Codex integration performs no hidden extension retry and returns the bounded cause/fallback result

### Requirement: Retained-history tuning is evidence-driven
The upstream retained-history default SHALL remain the product baseline until a representative long-session comparison supports a change. A 32K retained-user-history budget MAY be tested against the upstream default for latency, input/cached token usage, checkpoint size and task continuity, but SHALL NOT become the default merely from payload-size reasoning.

#### Scenario: Budget comparison is unavailable
- **WHEN** no approved provider-backed long-session comparison exists
- **THEN** the package retains the pinned upstream default and reports the 32K optimization as Unverified

#### Scenario: Budget comparison is run
- **WHEN** the same representative histories are compacted/replayed under both budgets
- **THEN** the evidence records actual model, latency, input/cached/output usage, checkpoint size and continuity outcomes before a default is selected

### Requirement: ACP delegation remains available across provider routes
`acp_delegate`, wait and cancel SHALL remain registered as the complete upstream delegation surface even when compatible Codex uses Remote V2. Their presence MUST NOT cause ACP context rewriting to handle the Codex parent turn or represent delegates as persistent AILI Agents.

#### Scenario: Codex parent calls ACP delegate
- **WHEN** the delegate tool is invoked under a Codex parent
- **THEN** upstream delegation semantics run while the parent turn's compaction owner remains `pi-codex-compact`

### Requirement: One frozen route token gates every context and compaction hook
AILI SHALL create one immutable turn route token consumed before side effects by the relevant `context`, nudge, `before_provider_request`, `session_before_compact`, compaction, replay and state hooks. Registration or handler order MUST NOT change the selected owner. Router failure SHALL produce zero mutation and zero compaction cancellation.

#### Scenario: Both selected runtimes are loaded
- **WHEN** Codex and billion-context hooks execute in either registration order
- **THEN** the selected owner mutates at most once and the other owner performs zero mutation and zero cancellation

#### Scenario: Concurrent turns or mid-turn model selection occur
- **WHEN** another session/turn selects a different provider or UI changes the next model
- **THEN** the active turn retains its frozen token and later turns receive independent tokens without shared-state contamination

#### Scenario: Router throws
- **WHEN** route-token creation or validation fails
- **THEN** neither runtime changes context, payload, transport, compaction or persisted state

### Requirement: Model switching resets provider-specific ephemeral state
Switching provider family, session, branch, tree, fork, reload or shutdown SHALL clear incompatible route/replay state before another provider turn.

#### Scenario: Session switches from Codex to another provider
- **WHEN** the next turn uses another provider
- **THEN** Codex opaque history is not injected and `billion-context-pi` starts from Pi-visible session context

#### Scenario: Session switches back to Codex
- **WHEN** a compatible persisted checkpoint exists
- **THEN** only state satisfying the exact marker, fingerprint and model compatibility rules is replayed

### Requirement: AILI Compact remains retired
No AILI Compact tool, command, context handler, compaction handler, provider fallback or current runtime claim SHALL remain.

#### Scenario: Runtime surfaces are enumerated
- **WHEN** the package loads under any provider
- **THEN** retired `aili_*` compact tools and `/aili-compact` are absent and no AILI Compact handler executes
