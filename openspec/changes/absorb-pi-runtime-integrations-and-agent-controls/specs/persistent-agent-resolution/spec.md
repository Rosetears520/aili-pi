## ADDED Requirements

### Requirement: Model arguments from an Agent are authorization requests
A `task.model` value supplied by a model-facing task invocation SHALL be treated as an untrusted model override request. Before any durable Agent/job/turn allocation, a requested model differing from the direct Parent's resolved canonical model SHALL require one fresh interactive Allow-once confirmation identifying the from/to models. A missing UI, dismissal, expiry, denial, or unusable requested model SHALL NOT activate the requested model and SHALL retain normal resolution without that request. User-owned instance, trusted-project-role and user-global-role overrides remain higher precedence than a confirmed task request.

#### Scenario: Main request is denied
- **WHEN** Parent resolves to `openai-codex/gpt-5.6-terra` and a task requests another model and the user denies
- **THEN** the child uses the allowed non-request resolution and no Agent/job/turn is created with the denied model

#### Scenario: No UI is available
- **WHEN** a task requests another model in a no-UI Parent
- **THEN** the request is not silently applied and the child inherits or applies only existing user-owned configuration

#### Scenario: User confirms one request
- **WHEN** the user confirms the exact requested model before allocation
- **THEN** exactly that turn uses the confirmed one-shot model and records `confirmed-one-shot` evidence

### Requirement: Direct Parent resolution precedes profile fallback
Resolution SHALL evaluate user-owned instance override, trusted project role override and user-global role override, then a confirmed one-shot override, then direct Parent resolved state, profile fallback and runtime fallback. The direct Parent's model/thinking/speed state SHALL precede a profile fallback and runtime fallback. A profile model SHALL NOT independently switch a child that has a resolved Parent model. This requirement modifies the predecessor model-selection precedence where it would place profile before the Parent.

#### Scenario: Profile differs from Parent
- **WHEN** Parent resolves to A and the selected profile specifies B without a user-owned override
- **THEN** the child resolves to A with `inherited-parent` source evidence

#### Scenario: Independent child has no Parent model
- **WHEN** the runtime has no direct resolved Parent model
- **THEN** profile fallback may be considered and its source is recorded as `profile-fallback`

### Requirement: Direct Parent model and thinking state are inherited
Nested Persistent Agents SHALL inherit the direct Persistent Parent's resolved canonical model and active thinking level when no higher authorized override applies. The inherited model and thinking SHALL be applied to the actual child `createAgentSession` call, not merely rendered. A frozen `{ canonical, thinking, speedTier, source }` Parent-resolution snapshot SHALL be stored with accepted work, passed in `TaskAncestry`, and used for a direct nested turn. A revived/hub turn SHALL not reuse a prior one-shot request; it re-resolves current user-owned policy and then the direct Parent snapshot. Historical journal records retain legacy layer values as historical evidence.

#### Scenario: Direct nested inheritance
- **WHEN** a direct Parent is Terra at `high` and starts a nested Worker without override
- **THEN** the Worker runs Terra at `high`, regardless of Root Main model

#### Scenario: Unsupported inherited thinking
- **WHEN** the selected inherited model cannot support the inherited active thinking level
- **THEN** preflight fails with an explicit compatibility error and does not silently select a model or thinking replacement

### Requirement: Resolved source is observable
Every newly accepted task, turn audit, hub inspection, settlement and revival decision SHALL expose one source from `confirmed-one-shot`, `instance-override`, `project-role-override`, `user-role-override`, `inherited-parent`, `profile-fallback`, or `runtime-fallback`. No `main-agent-selected` source may exist. Existing journal records with legacy `one-shot`, `instance`, `project-role`, `user-role`, `profile` or `parent-fallback` layer values remain readable without being misrepresented as newly issued source evidence.

#### Scenario: Source traceability
- **WHEN** an async task is accepted
- **THEN** its visible effective model, thinking and source match the frozen child request or an explicit preflight failure

#### Scenario: Direct user configuration wins over a confirmed task request
- **WHEN** a direct user instance, project-role or user-role override exists and the user confirms a different `task.model` request
- **THEN** the child uses the direct user configuration and records its user-owned source

#### Scenario: Revived turn omits a past one-shot
- **WHEN** a prior turn used a confirmed one-shot model and a hub continuation starts later
- **THEN** the continuation does not reuse that one-shot and records its current resolution source
