## ADDED Requirements

### Requirement: Unified composer-docked interaction shelf
The Web UI SHALL present blocking agent-initiated interactions in one Interaction Shelf docked directly above the composer, and MUST NOT present questionnaire, permission-approval, confirmation, or task-clarification interactions as centered or full-screen modals by default.

#### Scenario: Questionnaire docks above the composer
- **WHEN** a questionnaire extension-UI request becomes active during a web session
- **THEN** it renders in the shelf above the composer while the transcript remains scrollable and copyable, and the answer returns through the existing response channel

#### Scenario: Permission approval moves out of the modal
- **WHEN** a permission mode raises an approval ask (Allow once / Allow for session / Allow forever / Deny)
- **THEN** the ask renders in the shelf and the selected choice returns through the existing ui.select response path without changing permission-mode semantics

#### Scenario: Confirmation renders inline
- **WHEN** an extension requests a blocking confirm or task/hub clarification
- **THEN** it renders in the shelf with its options and resolves through the existing request/response flow

### Requirement: InteractionHost presentation-mode abstraction
The Web UI SHALL route every blocking interaction through one InteractionHost mapping that assigns a presentation mode of `composer-shelf`, `inline`, `popover`, or `modal`, with questionnaire, permission approval, confirmation, and task clarification defaulting to `composer-shelf`.

#### Scenario: New interaction type is a mapping change
- **WHEN** a new blocking extension-UI method needs presentation
- **THEN** it receives a presentation-mode assignment in the InteractionHost mapping instead of a bespoke modal or render site added at a call site

#### Scenario: Modal remains an explicit exception
- **WHEN** an interaction is assigned a mode other than `composer-shelf`
- **THEN** that assignment is explicit in the mapping with its reason, not an accidental default

### Requirement: Runtime blocking semantics preserved
The Interaction Shelf SHALL be a presentation-only layer over the existing extension-UI request/response, Promise, timeout, and abort plumbing, and MUST NOT alter runtime blocking behavior, response schemas, or the generic-host and headless fallbacks.

#### Scenario: Shelf render failure does not strand the runtime promise
- **WHEN** the shelf cannot render an active request (render error or surface unavailable)
- **THEN** the request remains answerable through a fallback presentation or explicit cancel, and the runtime promise settles through the existing channel

#### Scenario: At most one primary blocking card
- **WHEN** multiple blocking requests are pending simultaneously
- **THEN** the shelf presents one primary interaction and keeps the remaining pending interactions visible or reachable without losing any request
