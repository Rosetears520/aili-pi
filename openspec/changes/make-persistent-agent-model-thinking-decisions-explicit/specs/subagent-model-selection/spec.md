## ADDED Requirements

### Requirement: Model and thinking decisions are explicit and never silently dropped
Every model/thinking request reaching the persistent-agent runtime SHALL produce one recorded decision: applied directly, applied after one confirmation, rejected with a bounded reason, or inherited. Malformed, unauthorized, ambiguous or incompatible requests MUST NOT be silently discarded; the task SHALL proceed on configured/parent resolution only with an explicit `rejected-*` decision visible in the accepted result and turn audit.

#### Scenario: Unauthorized request under inherit-only authority
- **WHEN** a task carries `model`/`thinking` while the current-turn authority is `inherit-only` and no UI confirmation grants it
- **THEN** the child runs on configured/parent resolution and the decision is recorded as rejected with the reason surfaced to the caller

### Requirement: Direct user-turn instructions rank above persistent configuration
A request validated against the current turn's `explicit` or `delegated-choice` authority SHALL apply directly without a fresh confirmation and SHALL rank above instance, project-role and user-role overrides. Model and thinking SHALL resolve per field: each field takes the first layer that provides it, in the order direct-user-turn, instance, project-role, user-role, confirmed one-shot, direct parent, profile, runtime fallback. An explicit user instruction for one field MUST NOT be shadowed by a persistent override of the other field.

#### Scenario: User overrides the model for this turn
- **WHEN** the user's turn explicitly authorizes model X while a user-role override pins model Y and says nothing about thinking
- **THEN** the child runs on X with the thinking the persistent configuration provides, and both field sources are audited

#### Scenario: Incompatible thinking fails explicitly
- **WHEN** the resolved model does not support the requested thinking level
- **THEN** resolution fails with the offending source and level named; the runtime does not silently downgrade or switch models

#### Scenario: User names the model for current-turn subagents
- **WHEN** the current user message explicitly directs the Parent to use model X for the subagents dispatched in that turn and X is available and compatible
- **THEN** matching managed and Herdr dispatches receive turn-scoped `explicit` authority for X, apply it without another prompt, and audit the source as direct user turn

#### Scenario: Tool arguments exceed the user instruction
- **WHEN** a model-generated `sub` call requests model Y or a thinking level outside the exact values and target scope named by the user
- **THEN** the extra request is unauthorized and fails explicitly; tool arguments alone do not broaden current-turn authority

#### Scenario: Requested model is unavailable
- **WHEN** the user names a model that does not resolve to one authenticated unambiguous catalog entry
- **THEN** dispatch fails with the availability or ambiguity reason and does not silently inherit or switch models

### Requirement: Backend selection does not change model authority
Managed and Herdr execution SHALL consume the same resolved model/thinking decision and current-turn authority. Herdr surface, driver, process, pane, or resume behavior MUST NOT independently authorize, deny, replace, or downgrade the requested model or thinking level.

#### Scenario: Equivalent managed and Herdr dispatch
- **WHEN** two otherwise equivalent subagent dispatches carry the same valid current-turn model/thinking authority but select different execution backends
- **THEN** both resolve the same effective model/thinking identity and differ only in backend/driver execution metadata

### Requirement: Thinking-only requests are first-class at every entry
A thinking-only request (no model) SHALL follow the same decision path as a model request at the task boundary, `hub model request` (which SHALL accept a `thinking` field) and `hub send` (which SHALL accept turn-scoped `model`/`thinking` one-shot values applied to that continuation turn only, restoring the Agent's persistent configuration afterwards).

#### Scenario: Thinking-only task request
- **WHEN** a task carries only `thinking` under inherit-only authority and the user confirms once
- **THEN** the child keeps the inherited model and runs at the confirmed thinking with a `user-one-shot` thinking source
