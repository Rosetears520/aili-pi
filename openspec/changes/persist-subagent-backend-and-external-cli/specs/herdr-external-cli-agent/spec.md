## Purpose

Run explicitly authorized third-party CLI agents through Herdr with the same observable AILI subagent lifecycle as Pi child agents and with trustworthy completion evidence.

## ADDED Requirements

### Requirement: External CLI Agents require current direct-user product authorization
The system SHALL create an external CLI Agent only when the current direct user message authorizes the exact requested CLI product, and SHALL reject unavailable or unsupported requested CLI products without falling back to another CLI or Pi child execution.

#### Scenario: Authorized external CLI Agent
- **WHEN** the current direct user message names a supported CLI product and a new subagent requests that exact product
- **THEN** the system allocates an external CLI Agent through Herdr for that request

#### Scenario: Stale or mismatched authorization
- **WHEN** a subagent requests a CLI product that was not authorized by the current direct user message
- **THEN** the request is rejected before an external CLI process or Herdr surface is created

### Requirement: External CLI Agents use normal Herdr pane allocation
The system SHALL allocate a running external CLI Agent through the same AILI Herdr tab and pane policy used for a normal Pi subagent. A running external CLI Agent SHALL own an active pane but MAY share its AILI tab with Pi subagents.

#### Scenario: External CLI shares an AILI tab
- **WHEN** the normal Herdr allocator can place a new external CLI Agent by splitting or allocating a pane in an existing AILI tab
- **THEN** the external CLI Agent starts in its own active pane without forcing a separate tab

### Requirement: External CLI launch is controlled and truthful
The system SHALL launch the selected vendor executable through a fixed, validated, non-shell invocation and SHALL associate the launch with the AILI run and turn identities. Model-generated command text SHALL NOT select the vendor executable, append arbitrary runner flags, or substitute the completion result.

#### Scenario: Fixed launch plan
- **WHEN** an authorized external CLI Agent starts
- **THEN** the selected executable, supported runner options, run identity, and working boundary are established before the process begins

### Requirement: Foreground settlement follows the prompted CUI Agent lifecycle
A foreground external CLI subagent SHALL remain active until Herdr observes that the targeted CUI Agent accepted this prompt, transitioned into active work, and then returned to `idle` or `done` at its input surface. A pre-existing idle state, terminal text alone, pane visibility, and `blocked` SHALL NOT settle the Turn.

#### Scenario: Pre-existing idle state
- **WHEN** the external CUI Agent is idle before the current prompt and no post-prompt working transition has been observed
- **THEN** the external CLI Turn remains non-terminal and its foreground parent call does not complete

#### Scenario: Prompt returns to input
- **WHEN** the targeted CUI Agent enters active work for the current prompt and subsequently returns to `idle` or `done`
- **THEN** the system settles the corresponding Turn and returns control to the foreground parent

#### Scenario: Agent requests interaction
- **WHEN** the targeted CUI Agent becomes `blocked` while processing the prompt
- **THEN** the Turn remains active and the interaction is surfaced through the ordinary Agent coordination path

### Requirement: Background and recovery behavior matches ordinary subagents
An external CLI call with explicit background behavior SHALL return the same accepted-then-settled lifecycle as an ordinary background subagent. Cancellation, parent shutdown, process loss, and restart reconciliation SHALL produce explicit terminal or lost states and SHALL NOT replay the external CLI prompt automatically.

#### Scenario: Explicit background external CLI
- **WHEN** the user-authorized external CLI subagent is started in the background
- **THEN** the initiating call returns accepted and the eventual lifecycle settlement is available through the ordinary Agent coordination surface

### Requirement: External CLI interactions use policy-bounded parent decisions
When an external CUI Agent requests confirmation, the system SHALL allow the Parent to answer automatically only within the active AILI permission mode, accepted task scope, and existing exact operation authorization. Credential/private-key access and out-of-scope actions SHALL be denied. An ungranted destructive, Git, dependency, login, publication, release, or external-write operation SHALL be denied and returned as a blocked or need-user result rather than opening a user confirmation dialog or being auto-approved.

#### Scenario: Authorized ordinary operation
- **WHEN** the external CUI Agent requests an ordinary operation already allowed by the active permission mode and task authorization
- **THEN** the Parent answers the interaction automatically without requiring the user to click a dialog

#### Scenario: Missing high-risk authorization
- **WHEN** the external CUI Agent requests a high-risk operation without the required exact user authorization
- **THEN** the Parent denies the interaction and the child returns an explicit blocked or need-user disposition without prompting the user to approve it

### Requirement: YOLO availability is verifiable and bounded
The system SHALL enable a vendor non-interactive or YOLO option only when the installed CLI's verified capability information supports that exact option. It SHALL expose when YOLO is unavailable and SHALL NOT claim a non-interactive mode was enabled when it was not. YOLO SHALL NOT override credential/private-key denials or create missing operation authorization.

#### Scenario: Supported YOLO option
- **WHEN** the selected installed CLI declares a supported non-interactive option
- **THEN** the controlled launch uses that option and records the enabled disposition

#### Scenario: Unsupported YOLO option
- **WHEN** the selected installed CLI does not declare a supported non-interactive option
- **THEN** the launch reports `yolo-unavailable` and does not add an unverified bypass flag
