## ADDED Requirements

### Requirement: Agent model resolution follows one fixed precedence
Before every Agent turn, AILI SHALL resolve the model in this order: one-shot `task.model`, stable-instance override, trusted project role override, user-global role override, selected profile frontmatter model, then parent active/fallback model. The resolved source and model SHALL be recorded in turn metadata.

#### Scenario: All override layers are present
- **WHEN** a task supplies a one-shot model and the instance, project role, user role, and profile also define models
- **THEN** AILI uses the one-shot model for that turn and records `one-shot` as the source

#### Scenario: One-shot is absent and instance override exists
- **WHEN** an existing Agent starts a turn with an instance override and lower layers also exist
- **THEN** AILI uses the instance override

#### Scenario: Trusted project and user role overrides exist
- **WHEN** no one-shot or instance override exists and the project is trusted
- **THEN** AILI uses the project role override instead of the user-global override

#### Scenario: No override is configured
- **WHEN** none of the first five layers supplies a model
- **THEN** AILI uses the parent active/fallback model through official Pi model resolution

### Requirement: One-shot model override affects only one turn
A `model` supplied on a flat task or batch item SHALL affect only that Agent turn. It MUST NOT write role configuration, instance registry override, profile frontmatter, user settings, project settings, or the parent model.

#### Scenario: One-shot model completes
- **WHEN** a task runs with `model:provider/model-a`
- **THEN** that turn records and uses model-a while persistent configuration bytes and parent model remain unchanged

#### Scenario: Same Agent receives a later message
- **WHEN** `hub send` starts the next turn without a model argument
- **THEN** AILI re-runs normal precedence and does not reuse the prior one-shot value unless another persistent layer selects it

#### Scenario: Batch items choose different models
- **WHEN** two batch items specify distinct one-shot models
- **THEN** each turn uses its own model without modifying the other item or shared persistent configuration

### Requirement: Stable-instance override is parent-scoped and persistent
An instance override SHALL be stored in the owning parent coordinator registry and SHALL survive idle, park, parent resume, and process restart. It SHALL apply only to the exact stable Agent ID and its later turns.

#### Scenario: Instance override is set
- **WHEN** an authorized operation sets a model for Agent `Scout`
- **THEN** the parent registry durably records it and later turns for `Scout` use it above role/profile layers

#### Scenario: Same role has another instance
- **WHEN** `Scout-2` uses the same role but has no instance override
- **THEN** `Scout-2` does not inherit `Scout`'s instance override

#### Scenario: Parked Agent is revived
- **WHEN** an Agent with an instance override is revived after process restart
- **THEN** AILI validates and selects the same override before starting the new turn

### Requirement: Role overrides support user-global and trusted project scopes
AILI SHALL support role-level model overrides in AILI-owned user-global and project-local configuration. Trusted project scope SHALL outrank user-global scope. Project configuration MUST NOT be read as authoritative or written before Pi project trust is active.

#### Scenario: User-global override exists
- **WHEN** a role has a valid user-global override and no higher layer
- **THEN** all instances of that role use the user-global model

#### Scenario: Trusted project override exists
- **WHEN** the project is trusted and defines a role override
- **THEN** the project model applies to that role in the project without changing the global file

#### Scenario: Project is untrusted
- **WHEN** an untrusted project contains a role model configuration
- **THEN** AILI ignores it, reports the trust boundary, and resolves from the next valid layer

### Requirement: Persistent model configuration writes have explicit authority
A user MAY change global, project, or instance overrides through an explicit user command, TUI, or manual configuration operation. A model-facing `task` or `hub` operation MAY only request a persistent change and MUST obtain a new interactive user confirmation for every request. Headless/no-UI, refusal, cancellation, or write failure MUST leave configuration bytes and registry override state unchanged.

#### Scenario: User directly changes a role model
- **WHEN** the user invokes the documented model configuration command and confirms any required scope details
- **THEN** AILI atomically writes only the selected AILI-owned scope and reports the effective precedence

#### Scenario: Agent requests a permanent change
- **WHEN** a model-facing hub call asks to persist a role or instance override
- **THEN** AILI displays the exact target, old value, new value, and scope and writes only after that request receives user confirmation

#### Scenario: Agent repeats the same request
- **WHEN** a later model turn requests the same permanent change again
- **THEN** AILI asks again rather than treating an earlier confirmation as blanket authority

#### Scenario: No interactive UI exists
- **WHEN** a model-facing persistent change request occurs in headless or print mode
- **THEN** AILI fails closed and the pre-request configuration bytes remain identical

#### Scenario: User rejects the request
- **WHEN** the confirmation is denied or dismissed
- **THEN** AILI reports denial and makes no in-memory or on-disk persistent change

### Requirement: Persistent configuration writes are atomic and scope preserving
AILI SHALL use an AILI-owned schema, lock, validation, and atomic replacement for model override configuration. Updating one role or scope MUST preserve unrelated roles, user content, and the other scope. AILI MUST NOT insert unsupported extension keys into official Pi settings files.

#### Scenario: One global role is updated
- **WHEN** the user changes the model for `aili.implementer`
- **THEN** AILI preserves every unrelated role entry and writes a valid complete global configuration atomically

#### Scenario: Project write is requested without trust
- **WHEN** any caller attempts to write project role configuration before trust
- **THEN** AILI rejects the write and leaves both project and global files unchanged

#### Scenario: Lock or filesystem write fails
- **WHEN** the config path is read-only, locked, or atomic rename fails
- **THEN** AILI reports the failure, keeps the previous valid bytes, and does not update effective in-memory override state

#### Scenario: Configuration is malformed
- **WHEN** an override file fails schema validation
- **THEN** AILI reports the affected scope and does not silently reinterpret malformed data as a valid model choice

### Requirement: Explicit model overrides fail closed when unusable
A model selected by one-shot, instance, project role, user role, or profile layer MUST be resolved through the official Pi model/runtime registry before a turn starts. If the explicit model is unknown, unavailable, unauthenticated, or incompatible with requested thinking, the turn SHALL fail with an actionable source-aware error and MUST NOT silently fall through to a lower-priority model.

#### Scenario: One-shot model is unknown
- **WHEN** a task specifies an unknown provider/model identifier
- **THEN** AILI creates no provider request, reports the one-shot source, and leaves persistent configuration unchanged

#### Scenario: Persistent model lacks authentication
- **WHEN** revive resolves an instance override whose provider has no valid authentication
- **THEN** AILI does not fall back to role or parent model and reports that the instance override blocked startup

#### Scenario: Profile model is incompatible
- **WHEN** a profile model cannot support the effective thinking level and official Pi cannot validly clamp it
- **THEN** AILI fails before the turn and identifies the profile layer and incompatibility

#### Scenario: Parent fallback is unavailable
- **WHEN** no explicit layer exists and official Pi cannot resolve a usable parent/fallback model
- **THEN** AILI surfaces the official resolution failure without writing an override

### Requirement: Model choice is recalculated at every turn boundary
AILI SHALL not permanently bind an Agent to the model chosen when it was created. Every new turn or revive SHALL reload valid instance/role/profile configuration and apply the current precedence. An in-flight turn MUST retain the model recorded at its start.

#### Scenario: Role override changes while Agent is idle
- **WHEN** a valid project or global role override changes after one turn settles
- **THEN** the Agent's next turn uses the new effective model and earlier turn metadata remains unchanged

#### Scenario: Override changes while Agent is running
- **WHEN** persistent configuration changes during an active turn
- **THEN** the active turn continues on its recorded model and the new value is considered only for the next turn

#### Scenario: Instance override is cleared
- **WHEN** an authorized operation clears the instance override
- **THEN** the next turn resolves from project role, user role, profile, or parent layers in order

### Requirement: Model metadata remains auditable without exposing credentials
For each turn AILI SHALL record the canonical provider/model identifier, resolution layer, thinking level, role/profile hashes, and whether the value was one-shot or persistent. It MUST NOT record API keys, OAuth tokens, credential file content, or secret-bearing provider configuration in Agent registry, output, history, or delivery messages.

#### Scenario: Turn metadata is inspected
- **WHEN** `hub history` or durable evidence displays model metadata
- **THEN** it shows model identity and resolution source but no credential values or protected paths

#### Scenario: Provider authentication fails
- **WHEN** a provider returns an auth-related failure
- **THEN** AILI preserves a bounded diagnostic and does not copy auth storage or secret response data into public Agent artifacts

### Requirement: Model behavior is included in release verification
Stable validation SHALL cover every precedence layer, one-shot non-pollution, trusted project gating, instance persistence, turn-boundary reload, unavailable-model failure, no-UI denial, atomic-write failure, and credential-redaction behavior. A live provider probe MAY supplement but MUST NOT replace deterministic fake-runtime coverage.

#### Scenario: One precedence case is unverified
- **WHEN** release evidence omits a required model-selection layer or non-pollution negative case
- **THEN** stable validation fails and does not claim model override readiness

#### Scenario: Live probe is not authorized
- **WHEN** no exact provider authorization exists
- **THEN** offline fake-runtime tests run, the live probe remains explicitly unverified, and no provider request is made
