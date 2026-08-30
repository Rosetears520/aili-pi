## Purpose

定义子代理 model 与 thinking 的独立优先级、当前轮授权、目标模型默认值、scope/auth 校验和 backend-neutral preflight，使 managed 与 Herdr 在 durable allocation 前得到同一可审计 loadout。

## ADDED Requirements

### Requirement: Model and thinking resolve by user-owned precedence
The system SHALL resolve model and thinking fields independently in this order: current direct-user-turn authority, direct-user instance override, trusted project role override, user-global role override, freshly confirmed one-shot proposal, direct Parent fallback, profile fallback when no Parent identity exists, and runtime fallback.

A higher layer that explicitly supplies a field SHALL block lower-layer substitution for that field when its value is invalid, unavailable, unauthenticated, out of scope, or unsupported.

#### Scenario: Both fields are omitted
- **WHEN** a `sub` request supplies neither model nor thinking
- **THEN** the resolver uses the existing configured precedence and ultimately inherits the direct Parent model and thinking when no higher model/thinking fields exist

#### Scenario: Current user authorizes exact values
- **WHEN** the current direct user message authorizes an exact model and thinking for the selected subagent
- **THEN** those exact fields outrank persistent configuration and either resolve strictly or fail without lower-layer substitution

### Requirement: Model-only selection uses official Pi target defaults
When a winning model field changes the canonical model identity and no non-Parent layer supplies thinking, the Parent thinking fallback SHALL NOT apply. The resolver SHALL calculate the same target-model default that current persistent child creation uses with its isolated empty in-memory settings: Pi's default `medium`, followed by Pi's exported capability clamp for the target model. It MUST NOT import file-backed Parent/project per-model or global thinking settings into the child solely to resolve this default.

This resolution SHALL be recorded as `thinkingSource: model-default`; it SHALL NOT be recorded as user authorization, Parent inheritance, or a highest-level policy.

#### Scenario: GLM uses clamped Pi default
- **WHEN** the Parent uses `xhigh`, the selected target is `zai-coding-cn/glm-5.3-flash`, thinking is omitted, and the persistent child retains its isolated empty in-memory settings
- **THEN** the resolver clamps Pi's default `medium` using the target model's supported levels, does not inherit `xhigh`, and does not choose `max` merely because it is highest

#### Scenario: Non-reasoning target
- **WHEN** model-only selection targets a non-reasoning model
- **THEN** the effective thinking resolves to `off`

#### Scenario: Non-Parent thinking layer exists
- **WHEN** model selection changes identity but an authorized instance/project/user/one-shot layer supplies thinking
- **THEN** that configured thinking remains subject to its normal precedence and target compatibility checks

### Requirement: Input provenance gates current-turn authority
Only an input event whose trusted Pi source is `interactive` or `rpc` SHALL create direct-user-turn model authority. Text already transformed by an earlier installed Extension SHALL remain user-originated when Pi preserves that source; installed Extensions are trusted composition participants. Inputs whose source is `extension`, model-generated tool arguments, queued internal continuation, retry, compaction, catalog text, prior messages, child output, or persisted artifacts MUST NOT create or extend authority.

The authority captured from one qualifying input SHALL be matched to its corresponding Parent turn by one-time, session-local, fail-closed correlation between the normalized input and the final Parent prompt. A later transform that makes the final Parent prompt mismatch, handled input, replacement input, abort, settlement or shutdown SHALL clear the candidate rather than transfer it to another turn.

#### Scenario: Extension prompt names a model
- **WHEN** an Extension-originated input names a model, thinking value, and selector
- **THEN** the system treats the subsequent `sub` arguments as untrusted proposals rather than direct-user authority

#### Scenario: Interactive input authorizes one turn
- **WHEN** an interactive input explicitly authorizes a model/thinking/selector combination
- **THEN** only the corresponding Parent turn can use that authority and a later user turn starts without it

#### Scenario: RPC user input authorizes one turn
- **WHEN** a trusted RPC user input explicitly authorizes a model/thinking/selector combination
- **THEN** it receives the same current-turn authority semantics as interactive input

#### Scenario: An earlier trusted handler transforms user input
- **WHEN** an earlier installed Extension transforms text while Pi preserves source `interactive` or `rpc`
- **THEN** the transformed text remains eligible to create current-turn authority

#### Scenario: A later handler transforms or handles the input
- **WHEN** the final Parent prompt no longer matches the captured qualifying input or no Parent start occurs
- **THEN** the pending authority is cleared and cannot authorize the current or a later turn

#### Scenario: Steering or follow-up input names a model
- **WHEN** an input event has streaming behavior `steer` or `followUp`
- **THEN** it does not create fresh current-turn model authority

### Requirement: One scope-aware catalog predicate governs selection
Projection, canonical resolution, bare-id resolution, runtime fallback and pre-request revalidation SHALL reuse the same effective-scope predicate. An empty Pi scoped-model list SHALL mean unscoped; a non-empty list SHALL permit only those canonical models.

#### Scenario: Model leaves scope after catalog injection
- **WHEN** a model was advertised but is outside the effective scope at preflight
- **THEN** selection fails before durable allocation and does not silently choose another model

#### Scenario: Bare model has an out-of-scope duplicate
- **WHEN** a bare model id matches one in-scope and one out-of-scope available model
- **THEN** only the in-scope match participates in ambiguity resolution

### Requirement: Shared preflight freezes one backend-neutral loadout
Selector, model, thinking, scope, availability, authentication and current-turn authority validation SHALL complete before any Agent/job/turn identity, managed child, Herdr pane or child process is created. Managed and Herdr SHALL consume the same frozen canonical model, effective thinking, thinking source, speed tier and loadout inputs.

#### Scenario: Thinking is unsupported
- **WHEN** the selected explicit or default thinking is unsupported by the target model
- **THEN** preflight fails with zero durable allocation and lists the supported values

#### Scenario: Backend choice changes
- **WHEN** the same valid frozen preflight result is handed to managed and Herdr adapters
- **THEN** both adapters preserve its canonical model, effective thinking, source and speed without independently resolving them
