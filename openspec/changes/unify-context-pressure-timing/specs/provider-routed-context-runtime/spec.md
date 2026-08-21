## ADDED Requirements

### Requirement: Context relief timing is unified behind the ACP pressure decision
AILI SHALL use the bundled `billion-context-pi` / `acp-kernel` pressure decision (the exact `processTurn` nudge verdict, unmodified) as the normal automatic context-relief trigger for both provider routes. AILI MUST NOT reimplement threshold, growth, tier-cadence or emergency arithmetic, and MUST NOT carry a second copy of the WHEN policy.

#### Scenario: Codex turn reports pressure
- **WHEN** a `codex-remote-v2` turn ends and the ACP evaluator returns `shouldInject`
- **THEN** the runtime triggers exactly one `ctx.compact()` (reason `manual`) so `pi-codex-compact` performs Remote V2 compaction, and repeated `turn_end` events in the same epoch do not trigger again

#### Scenario: Codex turn reports no pressure
- **WHEN** the ACP evaluator returns no `shouldInject`
- **THEN** no compaction is triggered and no message is injected into the Codex context

#### Scenario: Observation fails
- **WHEN** the evaluator throws or usage is unavailable
- **THEN** the runtime records a diagnostic and neither guesses usage nor forces compaction

### Requirement: Codex relief resets its pressure epoch on completed compaction
After any successful compaction on a `codex-remote-v2` route (pressure-triggered or user manual), the runtime SHALL rebuild the pressure decision baseline so post-compaction observations start a fresh epoch. Pi's built-in threshold auto-compaction SHALL NOT compete with the Codex pressure policy: `session_before_compact` with reason `threshold` on a Codex-owned turn SHALL be cancelled before the codex-compact handler acts, while `manual` and `overflow` reasons SHALL pass through and overflow recovery remains the final safety fallback.

#### Scenario: Pi threshold auto-compaction on a Codex turn
- **WHEN** Pi emits `session_before_compact` with reason `threshold` while the frozen route owner is `codex-remote-v2`
- **THEN** the compaction is cancelled and no remote compaction runs for that event

#### Scenario: Overflow recovery
- **WHEN** Pi emits `session_before_compact` with reason `overflow` on a Codex turn
- **THEN** the event is allowed through to the existing compaction owners

## MODIFIED Requirements

### Requirement: Compaction ownership is selected by provider
AILI SHALL route an exactly compatible canonical `openai-codex` model using API `openai-codex-responses` to one pinned `@narumitw/pi-codex-compact` runtime. Every other canonical provider/model, including direct `openai`, Azure, custom OpenAI-compatible endpoints and non-OpenAI providers, SHALL route to the complete `billion-context-pi` runtime. The route key is the turn-frozen canonical provider/API/model identity. Missing or internally contradictory identity SHALL fail before context, payload, transport or compaction mutation. Exactly one runtime SHALL own context rewriting and compaction for each provider turn. Relief timing (WHEN) SHALL come from the shared ACP pressure decision on every route; the relief actuator (HOW) SHALL remain provider-routed — `pi-codex-compact` remote compaction for Codex turns, `billion-context-pi`'s model-driven compression for every other turn. The non-Codex `billion-context-pi` behavior (nudge injection, `compress` tool, T1/T2/T3) SHALL remain unchanged.

#### Scenario: Compatible Codex turn begins
- **WHEN** the active provider is `openai-codex`, the API is `openai-codex-responses`, and the model satisfies the pinned package compatibility contract
- **THEN** `pi-codex-compact` may own Remote V2 compaction/replay, ACP context projection/compaction cancellation does not act, and automatic relief timing comes from the shared ACP pressure decision driving `ctx.compact()`

#### Scenario: Direct OpenAI turn begins
- **WHEN** the active canonical provider is `openai`
- **THEN** `billion-context-pi` owns context/compaction with its existing WHEN and HOW, and no Codex Remote V2 marker, checkpoint or provider hook acts

#### Scenario: Other provider begins
- **WHEN** the canonical provider is not an exactly compatible Codex route, including Azure or a custom OpenAI-compatible endpoint
- **THEN** `billion-context-pi` owns context rewriting/compaction with unchanged behavior and Codex Remote V2 hooks return no changes

#### Scenario: Provider route is ambiguous
- **WHEN** no canonical provider/API/model identity can be frozen or later hooks observe a contradictory turn token
- **THEN** the turn fails before either runtime mutates context, payload, transport, compaction or persisted state
