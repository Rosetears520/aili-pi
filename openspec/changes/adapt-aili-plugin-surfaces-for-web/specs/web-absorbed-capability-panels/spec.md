## ADDED Requirements

### Requirement: Quota orb
The Web UI SHALL provide a quota orb — a small circular indicator with a remaining-percentage ring — showing the live provider quota reported by the `pi-quota-status` extension status. Clicking the orb SHALL open a popover with the remaining amount and the reset time (and per-provider lines when multiple are reported). The orb SHALL render an explicit unknown state when no quota data has arrived, and its data MUST come only from the reported quota status, never inferred from message content.

#### Scenario: Live quota ring
- **WHEN** the quota extension reports remaining percentage and reset time
- **THEN** the orb ring reflects the percentage and the popover shows the remaining amount and reset time

#### Scenario: No quota data
- **WHEN** no quota status has been reported
- **THEN** the orb shows the unknown state instead of a fabricated value

### Requirement: BTW floating side-thread dialog
The Web UI SHALL provide a floating side-thread dialog (Codex-style popover) opened from the composer. The dialog SHALL support explicit model and thinking selection, isolated side questions whose exchanges never mutate the main conversation, and a preview-before-insert bring-to-main flow that confirms into the composer draft rather than sending directly. Side-thread state remains process-local and is not presented as recoverable after loss.

#### Scenario: Side question stays isolated
- **WHEN** a user asks a side question in the dialog
- **THEN** the exchange stays inside the side thread and the main conversation is unchanged

#### Scenario: Bring-to-main requires preview and user action
- **WHEN** a user chooses to bring side-thread material into the main conversation
- **THEN** a preview is shown first and confirmation only inserts the reviewed draft into the composer, never auto-sends

### Requirement: Panels degrade truthfully
Each panel and metadata surface SHALL render empty, loading, and error states from the owning runtime service and MUST NOT display inferred or placeholder-success data when the service is unavailable.

#### Scenario: Service unavailable
- **WHEN** a capability's runtime service is unavailable in the web process
- **THEN** its panel shows an explicit unavailable state instead of empty success
