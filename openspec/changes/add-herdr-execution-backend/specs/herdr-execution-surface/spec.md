## Purpose

Defines how AILI creates, controls, observes, installs, and recovers Herdr terminal surfaces that host external agent processes, and what Herdr may and may not be trusted to decide.

## ADDED Requirements

### Requirement: Socket-first control path
The `herdr` backend SHALL control Herdr through a long-lived connection using Herdr's machine protocol; invoking the Herdr CLI and parsing its human-facing output MUST NOT be the primary control path, and the CLI SHALL be reserved for doctor and manual diagnostics. The client SHALL enforce a protocol version guard and fail explicitly when the daemon speaks an unsupported protocol version or schema.

#### Scenario: Version mismatch fails explicitly
- **WHEN** the connected Herdr daemon speaks an unsupported protocol version
- **THEN** the backend fails explicitly and never infers state from terminal text

### Requirement: Gap-free reconnection
When establishing or re-establishing its view of Herdr state, the client SHALL subscribe to events first, buffer incoming events, then read a snapshot, install the snapshot, and then apply the buffered events in order, so that no state change occurring between subscription and snapshot is lost.

#### Scenario: Reconnect without gaps
- **WHEN** the parent reconnects to a running Herdr daemon while surfaces are changing
- **THEN** the reconciled view equals the daemon's actual state, including changes that occurred during reconnection

### Requirement: Surface topology
Each parent session SHALL map to one Herdr workspace — the parent's own workspace when the AILI parent runs inside a Herdr-managed pane, otherwise a dedicated workspace. While work is concurrent, AILI children SHALL use split panes inside one live AILI tab. After a child settles, its process and pane SHALL close; when no sibling remains the AILI tab SHALL close. Sequential or continued work SHALL create a fresh Run/process/tab while reusing the durable Pi session. Surface, tab, and pane identifiers SHALL be read from Herdr's authoritative responses and never predicted from client-side ordering.

#### Scenario: Spawn creates the AILI tab
- **WHEN** a Herdr-backed agent is created and no AILI pane exists in the workspace
- **THEN** one AILI tab is created (focused when the parent runs inside Herdr) and all identifiers come from Herdr's responses

#### Scenario: Parallel agents split one tab
- **WHEN** a second agent starts while another AILI child is still working
- **THEN** a new pane is split inside the same AILI tab instead of opening another tab, using the delegating call's optional split-direction hint when present and an alternating default otherwise

#### Scenario: Sequential agents close and restore on demand
- **WHEN** a child settles with no live sibling and a later Agent or task_id continuation is requested
- **THEN** the prior child process, pane and tab are already closed, and the later request starts a fresh Run/process/tab using the durable Pi session history

#### Scenario: Continuation resumes after surface loss
- **WHEN** a continuation arrives whose child bridge is no longer connected
- **THEN** the stale surface is dropped and a new run starts on a fresh tab/pane with the same stable session, instead of failing

#### Scenario: Unseen parent workspace fails explicitly
- **WHEN** the parent's Herdr workspace id is absent from the daemon snapshot
- **THEN** spawning fails explicitly instead of falling back to a hidden workspace

### Requirement: Machine-generated live agent names
Herdr live agent names SHALL be machine-generated from the run id, unique among live agents, and conform to Herdr's live-name constraints. User-provided names SHALL appear only as the AILI agent alias, the tab/pane label, and display metadata — never as the Herdr live name.

#### Scenario: Alias never becomes the live name
- **WHEN** a user names an agent `ParserScout`
- **THEN** the Herdr live name is a generated run-scoped name and `ParserScout` appears only in alias, label, and metadata

### Requirement: Pane metadata identity
The backend SHALL attach AILI identity metadata to the surfaces it creates — schema version, parent session id, agent id, run id, driver session id, backend kind, and loadout hash — so runs can be matched after parent restart. Herdr metadata MUST NOT contain credentials, authorization tokens, or full prompts.

#### Scenario: Recovery by metadata
- **WHEN** the parent restarts and reconciles Herdr surfaces
- **THEN** surfaces are matched to run records via metadata without relying on terminal text

### Requirement: Two-step startup gating
Surface creation SHALL precede agent start, and a run SHALL enter the `live` state only after both Herdr reports the agent ready and the child bridge handshake completes. Herdr readiness alone SHALL NOT mark a run live.

#### Scenario: Bridge never ready
- **WHEN** Herdr reports the agent ready but the child bridge handshake does not complete within the startup timeout
- **THEN** the run fails explicitly and the created surface is cleaned up or retained for diagnosis according to configuration

### Requirement: Availability detection and guided installation
Setup and doctor SHALL detect three components: the Herdr binary, the Herdr–Pi integration, and the Pi-side Herdr skill. When a component is missing, installation SHALL proceed via the official commands, in order:

1. `curl -fsSL https://herdr.dev/install.sh | sh`
2. `herdr integration install pi`
3. `npx skills add herdrdev/herdr --skill herdr -g -a pi`

Detection SHALL be idempotent (already-present components are skipped), each step's failure SHALL be reported explicitly with the failed step named, and an installation failure MUST NOT trigger a silent switch to another backend.

#### Scenario: Fresh machine install
- **WHEN** setup runs on a machine where none of the three components is present
- **THEN** the three official commands execute in order and doctor verifies binary, integration, and skill presence afterwards

#### Scenario: Already installed skips install
- **WHEN** all three components are already present
- **THEN** no installation command runs

#### Scenario: Install failure is explicit
- **WHEN** an installation command fails
- **THEN** the error names the failed step, the Herdr backend remains explicitly unavailable, and no managed fallback occurs

### Requirement: Parent-restart reconcile
On parent startup the backend SHALL reconcile Herdr-backed runs from its durable run records, Herdr state, and child bridge reachability. If the pane and bridge are healthy, the run reattaches and its jobs continue; if the pane exists but the bridge is lost, the run is marked degraded and its job MUST NOT be marked completed; if pane and process are gone, the run is `lost`, its running turn is `interrupted`, its queued jobs remain `unexecuted`, and nothing auto-replays.

#### Scenario: Reattach after parent restart
- **WHEN** the parent restarts while a Herdr child is mid-turn and both pane and bridge are alive
- **THEN** the run reattaches and the turn settles with bridge-sourced completion evidence

#### Scenario: Degraded run is not completed
- **WHEN** the pane is alive but the child bridge is unreachable
- **THEN** the run is marked degraded and Herdr's idle or working display is not used to settle the job

#### Scenario: Lost run
- **WHEN** neither pane nor process exists for a recorded live run
- **THEN** the run is `lost`, the running turn is `interrupted`, queued jobs stay `unexecuted`, and no automatic replay occurs

### Requirement: Stall detection without side effects
The surface monitor SHALL mark a live run's activity `stalled` when no valid structured event arrives within the configured window, and `recovered` when events resume. Stall detection MUST NOT kill the process, settle the job, or release permits.

#### Scenario: Recovered after stall
- **WHEN** structured events resume after a stall
- **THEN** activity transitions `stalled → recovered → current` with no change to job or turn state

### Requirement: Human surface access
Users SHALL be able to focus and interact with Herdr surfaces both through Herdr itself and through the user-level management commands. Each run SHALL track a control mode (`aili`, `human`, or `mixed`) reflecting whether input beyond AILI's own has been observed.

#### Scenario: Focus from the management command
- **WHEN** the user invokes the focus command for a Herdr-backed agent
- **THEN** Herdr focuses the corresponding pane

#### Scenario: Focus on a managed agent
- **WHEN** the user invokes the focus command for a managed agent
- **THEN** the command reports that no external execution surface exists

#### Scenario: Manual input is detected
- **WHEN** input into a Herdr surface is detected outside AILI's own submissions
- **THEN** the run's control mode reflects human involvement
