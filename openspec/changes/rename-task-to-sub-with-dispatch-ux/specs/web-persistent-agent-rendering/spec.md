## ADDED Requirements

### Requirement: The web renders persistent-agent dispatch with full identity parity
The web chat SHALL render `sub`/`formal_task` (and pre-rename `task`) tool calls with the same identity information as the TUI: a collapsed row of `name · selector · effective model · thinking · status`, and expanded structured details covering requested/effective model and thinking, model/thinking sources, the override decision, lifecycle states, agent/job/turn ids, and output/history references — with the raw request/response JSON behind an explicit disclosure. Running dispatches SHALL show a friendly progress line parsed from the structured live snapshot instead of raw JSON. Async deliveries (`aili.agent-result` custom messages) SHALL render a dedicated agent-result card with the identity row, model provenance, and a collapsible preview.

#### Scenario: Completed dispatch call
- **WHEN** a `sub` tool call has a result carrying the structured TaskResponse details
- **THEN** the collapsed block shows the identity row and the expanded block shows the structured provenance rows

#### Scenario: Async delivery arrives
- **WHEN** an `aili.agent-result` custom message is appended to the session
- **THEN** it renders as an agent card with identity and model sources instead of a raw custom-type JSON dump
