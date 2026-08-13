## ADDED Requirements

### Requirement: Pi Web baseline workbench
The AILI Web workbench SHALL retain the applicable locked Pi Web behavior for session listing, project grouping, resume, rename, export, safe deletion, Branch and Fork distinction, model/provider and thinking selection, context status, commands, skills/plugins, files, Git diff, Worktree navigation, media preview, responsive layout, and shared Pi configuration.

#### Scenario: Read-only session resume
- **WHEN** a user selects an existing persisted session without mutation ownership
- **THEN** the workbench renders its branch-aware history and current metadata without creating a live mutation runtime

#### Scenario: Branch and Fork stay distinct
- **WHEN** the user chooses an in-session branch action or an independent Fork action
- **THEN** the UI labels and executes the correct operation and does not conflate a same-file branch with a new session file

### Requirement: AILI runtime workbench surfaces
The workbench SHALL provide a structured Timeline, independently collapsible or resizable navigation and inspection regions, a persistent runtime status surface, and explicit Queue Next versus Steer controls. It SHALL truthfully display current model, thinking, context tokens/window, writer state, Agent status, MCP connection count/status, Analytics, Stamp timing, BTW threads, and Worktree state when their capabilities are available.

#### Scenario: Busy composer preserves command meaning
- **WHEN** a model turn is active
- **THEN** Queue Next and Steer are separate controls with distinct labels and outcomes

#### Scenario: Narrow layout retains material status
- **WHEN** viewport width is constrained
- **THEN** the layout may collapse or overflow secondary panels but keeps model, context, connection, writer, and active-run state accessible

### Requirement: Truthful Agent and MCP inspection
The Web UI SHALL consume bounded projections from the existing AILI persistent-Agent and MCP owners. It MUST NOT infer Agent or MCP state from transcript text, connect a lazy MCP server merely to inspect it, or expose raw configuration, environment, credentials, or private arguments.

#### Scenario: Lazy MCP remains lazy during inspection
- **WHEN** a user opens the MCP status view for a disconnected lazy server
- **THEN** the UI displays its known state without initiating a connection

#### Scenario: Agent continuation follows capability
- **WHEN** a user inspects a persistent Agent
- **THEN** output and history are read-only unless the live capability and permission contract explicitly authorizes a continuation action

### Requirement: Browser media preserves Pi ownership boundaries
The workbench SHALL support bounded browser media upload and preview by validating bytes and converting supported images into official Pi image content. It MUST NOT replace or alter the separately owned Pi-native WSL clipboard path.

#### Scenario: Invalid media fails visibly
- **WHEN** an upload exceeds accepted bounds, has unsupported bytes, or targets a model without the required capability
- **THEN** the UI reports a visible error and does not attach misleading content to the session

### Requirement: Complete first-release surface
The first release of this change MUST include important retained TUI entry points, AILI Runtime/API behavior, and corresponding Web UI behavior for Analytics, BTW, Stamp, and Worktree.

#### Scenario: Missing capability layer blocks release
- **WHEN** any one of the four absorbed capabilities lacks its required TUI, Runtime/API, or Web layer
- **THEN** the release candidate is incomplete and cannot be reported as first-release ready
