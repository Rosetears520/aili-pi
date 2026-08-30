## Purpose

让父代理在调用子代理前看到与当前 Pi 会话一致的可用模型、thinking 和输入模态，同时保持“能力可见”与“当前轮授权”严格分离，并避免换模时继承不兼容的父级 thinking。

## ADDED Requirements

### Requirement: Parent receives a current subagent model capability snapshot
The system SHALL expose a read-only Subagent Model Catalog to the Parent for each direct user turn. The catalog SHALL derive from the current Pi model catalog, include only models that are available and have configured authentication, respect the current session model scope, and include canonical model identity, supported thinking levels, effective default-thinking semantics, and declared text/image input modalities.

The snapshot SHALL use cached/local runtime state and SHALL NOT execute credential commands, refresh remote catalogs, mutate authentication, or create a child session.

#### Scenario: Authenticated scoped models are visible
- **WHEN** a Parent user turn begins with an active model scope
- **THEN** the Parent receives only available, authenticated models permitted by that scope, with canonical ids and supported thinking levels

#### Scenario: Unavailable model is not advertised
- **WHEN** a model exists in the registry but is unavailable or lacks configured authentication
- **THEN** it is absent from the advertised Subagent Model Catalog

#### Scenario: Catalog changes between user turns
- **WHEN** the local available/authenticated snapshot changes after one Parent user turn settles
- **THEN** the next Parent user turn receives a newly derived snapshot and the prior turn snapshot grants no continuing authority

### Requirement: Capability discovery does not grant model authority
The system MUST present model capability data as discovery evidence only. Current-turn model authority SHALL continue to be derived exclusively from the corresponding trusted Pi input event whose source is `interactive` or `rpc`, and SHALL be represented separately as `inherit-only`, `explicit`, or `delegated-choice`, including any model, thinking, and selector restrictions. Extension-originated inputs SHALL NOT create direct-user authority.

#### Scenario: Visible model is not authorized
- **WHEN** the catalog advertises a model but the current user message does not authorize that model for subagents
- **THEN** the Parent MUST NOT treat catalog visibility as permission to pass that model or thinking value to `sub`

#### Scenario: Current message authorizes one selector
- **WHEN** the current user message authorizes a model and thinking level only for one selector
- **THEN** the authorization summary identifies that selector and a request for a different selector fails before allocation

### Requirement: Omitted thinking uses the target model default after a model switch
When the winning model-bearing resolution layer selects a model different from the inherited Parent model and no user-owned or configured thinking layer supplies a value, the system SHALL NOT inherit the Parent thinking level and SHALL NOT automatically choose the target model's highest supported level.

The system SHALL calculate the same target default that the current isolated persistent child would use with its empty in-memory settings: Pi's default `medium`, followed by Pi's exported target-model capability clamp. It SHALL freeze that concrete effective value before child startup while recording its source as `model-default` rather than as a user override. File-backed Parent/project per-model or global thinking settings SHALL NOT be imported into the isolated child.

#### Scenario: Parent xhigh switches to GLM without thinking
- **WHEN** the Parent is using `xhigh`, the current user authorizes `zai-coding-cn/glm-5.3-flash` for a subagent, and the `sub` call omits thinking
- **THEN** preflight selects the GLM target default without inheriting `xhigh`, without selecting `max` merely because it is highest, and without creating a Herdr pane or managed child before validation completes

#### Scenario: Model and thinking are both omitted
- **WHEN** a `sub` call omits both model and thinking
- **THEN** the existing instance/project/user/profile/Parent inheritance rules remain in effect

#### Scenario: Only thinking is specified
- **WHEN** a `sub` call specifies thinking but omits model under valid current-turn authority
- **THEN** the system applies that thinking to the inherited effective model and fails before allocation if the inherited model does not support it

#### Scenario: Both values are specified
- **WHEN** a current user message authorizes an exact model and thinking combination and `sub` supplies both
- **THEN** preflight uses exactly that combination or fails strictly without substituting another value

### Requirement: Dispatch revalidates the frozen effective loadout
The informational snapshot SHALL NOT replace execution-time checks. Before durable Agent/job/turn allocation, the shared preflight SHALL revalidate selector, model identity, session scope, availability, authentication, thinking compatibility, and current-turn authority, then freeze one effective loadout for managed and Herdr.

#### Scenario: Catalog becomes stale before dispatch
- **WHEN** an advertised model becomes unavailable, unauthenticated, or out of scope before `sub` preflight
- **THEN** dispatch fails with zero durable Agent/job/turn allocation and no Herdr pane or managed child process

#### Scenario: Managed and Herdr receive the same resolution
- **WHEN** the same authorized request is dispatched through managed and Herdr backends
- **THEN** both backends consume the same frozen canonical model and effective-thinking decision

### Requirement: Model errors provide current-turn corrective guidance
Model-selection failures SHALL use one non-duplicated error code and SHALL explain the failed model/thinking or authorization constraint. When correction requires user authority, the error SHALL include a bounded example that asks the user to name the canonical model, supported thinking, and selector in one current message.

#### Scenario: Unsupported explicit thinking
- **WHEN** an authorized explicit model/thinking combination is unsupported
- **THEN** the system returns `SUB_THINKING_UNSUPPORTED` once and lists supported thinking values without allocating a child

#### Scenario: Model value was not authorized
- **WHEN** a model-generated `sub` request supplies a model or thinking outside current-turn authority
- **THEN** the system returns `SUB_MODEL_DENIED` once and states that availability does not equal authorization

### Requirement: Input modality and tool capability remain distinct
The catalog SHALL describe only model-declared input modalities. The system MUST NOT infer video, audio, ASR, filesystem, network, browser, or other tool capability from a model's text/image declaration. Any effective tool or media claim SHALL come from the actual role/backend/tool policy used by dispatch.

#### Scenario: Image model receives a video transcription task
- **WHEN** a model advertises `text,image` but the selected role/backend has no video or ASR tool
- **THEN** the model catalog does not claim MP4/audio/ASR availability; a definitive tool-capability result is produced only after selector/backend/tool policy is known

### Requirement: Snapshot output is bounded and non-sensitive
The injected capability and authority context SHALL be deterministic, bounded, and free of credentials, tokens, headers, secret-bearing provider configuration, raw auth diagnostics, and protected paths. If the model catalog exceeds the rendering bound, the output SHALL report deterministic truncation and SHALL instruct the Parent not to guess omitted identities.

#### Scenario: Large model catalog is truncated
- **WHEN** the available authenticated model catalog exceeds the configured entry or byte bound
- **THEN** the system emits a deterministic subset plus an omitted-count marker and does not silently imply completeness

#### Scenario: Provider has secret-bearing configuration
- **WHEN** a catalog model is backed by credential or provider configuration
- **THEN** the Parent sees only the allow-listed capability fields and no secret-bearing values
