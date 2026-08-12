## MODIFIED Requirements

### Requirement: Model selection is validated before allocation and inherited when omitted
A task with no `model` SHALL create no one-shot override and SHALL resolve through instance, trusted project role, user-global role, bundled profile and Parent active/fallback precedence. An explicit canonical provider/model SHALL be validated as written. An explicit bare model SHALL first match an authenticated available model on the Parent provider, otherwise require exactly one authenticated available catalog match.

#### Scenario: Omitted model has no configured override
- **WHEN** no higher-precedence layer specifies a model
- **THEN** the turn inherits the official Pi Parent active/fallback model and records the Parent fallback layer

#### Scenario: Explicit high-precedence model is unavailable
- **WHEN** a configured or requested model cannot authenticate or run
- **THEN** preflight fails at that layer rather than silently falling back to a lower layer

### Requirement: Model preflight is atomic with selector and thinking validation
Exact selector, role profile, requested model format, resolution, provider availability/authentication and thinking compatibility SHALL be checked before durable Agent/job/turn allocation. Batch preflight SHALL allocate nothing if any item fails.

#### Scenario: Thinking level is incompatible
- **WHEN** the resolved model cannot support the requested effective thinking level
- **THEN** the task fails with thinking-compatibility classification before allocation

#### Scenario: Unknown selector is supplied
- **WHEN** selector validation fails
- **THEN** the error lists canonical selectors and no model request or Agent identity is created

#### Scenario: Canonical solution-architect selector is supplied
- **WHEN** a task selects `aili.solution-architect` from the pinned `rose-aili@0.4.7` catalog
- **THEN** selector and role preflight recognize it as one of 20 canonical Specialized Agents and apply its read-only role ceiling before allocation

### Requirement: Effective model remains identical across runtime surfaces
The effective provider/model and thinking level SHALL be frozen at turn allocation and represented identically in task result, hub, async delivery, settlement and audit. Availability is revalidated immediately before provider request without switching identity.

#### Scenario: Accepted async task is displayed
- **WHEN** task returns before execution completes
- **THEN** its visible effective model is the same model the child will request or the child later fails explicitly because that frozen model became unavailable

#### Scenario: A later hub turn starts
- **WHEN** `hub send` creates a new turn after a prior one-shot model override
- **THEN** the prior override does not stick and the new turn resolves current effective configuration again
