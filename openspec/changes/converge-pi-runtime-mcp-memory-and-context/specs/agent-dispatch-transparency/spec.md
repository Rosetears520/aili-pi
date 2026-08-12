## ADDED Requirements

### Requirement: Task preflight completes before durable allocation
Every flat or batch task SHALL validate exact selector, role profile, model identity, resolution layer, provider availability/authentication and thinking compatibility before creating any durable Agent/job/turn identity. Batch failure SHALL be atomic.

#### Scenario: One batch item has an invalid model
- **WHEN** any item fails model preflight
- **THEN** the entire batch fails with zero Agent, job or turn allocation

#### Scenario: Model is omitted
- **WHEN** a task omits `model`
- **THEN** no one-shot override is created and configured precedence ultimately inherits the current Parent active/fallback model

### Requirement: Effective model identity is frozen and propagated
The effective canonical provider/model and thinking level SHALL be frozen for the allocated turn, revalidated before provider request, and propagated consistently through accepted result, settlement, async delivery, hub metadata and audit.

#### Scenario: Configuration changes after allocation
- **WHEN** role or Parent model configuration changes before the provider request
- **THEN** the allocated turn keeps its visible frozen model or fails if unavailable; the new configuration applies only to a later turn

#### Scenario: Explicit bare model is ambiguous
- **WHEN** parent-provider matching fails and the authenticated catalog contains multiple provider matches
- **THEN** preflight fails before allocation and reports canonical candidates without guessing

### Requirement: Task call rendering identifies the work immediately
`task` SHALL use Pi `renderCall`/`renderResult` so the compact call shows task name, canonical selector, effective provider/model and current status, followed by a bounded assignment summary. Before allocation, fields not yet available SHALL be omitted rather than fabricated.

#### Scenario: Task begins rendering
- **WHEN** Pi has complete task arguments but allocation has not completed
- **THEN** the call shows the requested name/selector, preparing status and redacted assignment summary instead of only `Task`

#### Scenario: Task is running
- **WHEN** Agent/job identities and model are allocated
- **THEN** the compact surface updates to the effective identity and running state

### Requirement: Expanded task and hub surfaces expose bounded identity details
Expanded results SHALL show applicable requested/effective model, model layer, thinking, sync/async, Agent/job/turn IDs, output/history references and terminal status. `hub` actions SHALL show their action and target Agent/job.

#### Scenario: Async task completes
- **WHEN** a background job settles and delivery is available
- **THEN** task/hub/delivery metadata agree on identities, model and status and expose available references

#### Scenario: Hub waits on a job
- **WHEN** `hub wait` is rendered
- **THEN** the user can see the target Agent/job and wait action rather than only `Hub`

### Requirement: Rendering is redacted and non-authoritative
Assignment summaries SHALL be single-line, width-bounded and stripped of credential-bearing values, protected paths and full prompts. UI state MUST NOT create acceptance, completion or formal evidence.

#### Scenario: Assignment contains sensitive or multiline text
- **WHEN** it is rendered in compact form
- **THEN** sensitive values are redacted, newlines collapsed and excess text truncated while full protected input is not copied into display metadata

#### Scenario: Renderer fails
- **WHEN** custom rendering throws or receives malformed details
- **THEN** Pi falls back to its normal tool rendering and execution/result semantics remain unchanged

## MODIFIED Requirements

### Requirement: AILI exposes task and hub as the persistent Agent orchestration surface
AILI SHALL retain `task` and `hub` as the persistent Agent orchestration surface and SHALL add consistent transparent identity rendering and metadata. The separately adopted upstream `billion-context-pi` MAY expose its own `acp_delegate*` tools; those tools are not aliases for AILI `task`/`hub` and MUST NOT be represented as persistent AILI Agents.

#### Scenario: Both delegation surfaces are installed
- **WHEN** the complete package loads
- **THEN** AILI `task`/`hub` retain persistent Agent semantics while upstream `acp_delegate*` retains its documented independent semantics without identity conflation
