## ADDED Requirements

### Requirement: MCP uses one shared user configuration
AILI SHALL resolve the default MCP configuration as `${XDG_CONFIG_HOME:-$HOME/.config}/mcp/mcp.json`. It MUST NOT create another active MCP source or rewrite OpenCode host configuration.

#### Scenario: Default environment resolves configuration
- **WHEN** the current user has no XDG override
- **THEN** Pi and other compatible clients read the same user-level MCP file under the standard config directory

#### Scenario: Existing destination conflicts
- **WHEN** a proposed server has the same name but different fields in the destination
- **THEN** migration preview reports a redacted field-level conflict and writes nothing

### Requirement: Parent and Worker sessions receive isolated MCP runtimes
AILI SHALL create one MCP adapter instance for the Parent and a separate instance for every persistent Worker session while passing the same resolved config path. Worker MCP SHALL be added through the explicit child extension factory rather than ambient extension discovery.

#### Scenario: Parent and two Workers use MCP
- **WHEN** all three sessions request MCP capability
- **THEN** each owns a distinct adapter/runtime instance while reading the same configuration

#### Scenario: Worker parks or session shuts down
- **WHEN** a Worker is parked, replaced, cancelled, fails during prepare, or its session shuts down
- **THEN** that session disposes its MCP transports/processes without disposing another session's instance

### Requirement: MCP cannot widen effective permissions
Every MCP proxy, direct tool, script, resource and approval request SHALL be constrained by the intersection of Parent grant, canonical role ceiling, task tool/write/workspace scope, Pi permission mode and adapter/server capability.

#### Scenario: Read-only Worker discovers a write MCP tool
- **WHEN** proxy search or direct-tool metadata exposes that server tool
- **THEN** the Worker cannot execute it and cannot regain it through another MCP origin

#### Scenario: Headless call requires approval
- **WHEN** an MCP call requires approval and no UI or brokered grant is available
- **THEN** the call fails closed without executing the server tool

### Requirement: MCP status is lazy and truthful
MCP servers SHALL remain lazy by default. Doctor/footer/status inspection SHALL consume adapter status snapshots without connecting a lazy server and SHALL distinguish configured, cached, connected, failed, disabled, needs-auth and unavailable states.

#### Scenario: Doctor inspects an unused lazy server
- **WHEN** the server is configured but never called
- **THEN** doctor reports not-connected/configured without starting its command or network transport

#### Scenario: One server fails
- **WHEN** one configured server fails while others remain usable
- **THEN** status identifies that server and does not report global MCP success or global MCP failure inaccurately

### Requirement: Initial server identities are fixed and reproducible
The accepted initial configuration SHALL include MemPalace, official Context7, official Playwright MCP and `https://github.com/colbymchenry/codegraph`. Executable package versions or source commits MUST be immutable; floating `latest` commands are forbidden.

#### Scenario: Configuration contains a floating package
- **WHEN** validation sees `latest`, an unpinned branch or another moving executable identity
- **THEN** it rejects the configuration as non-reproducible before installation or runtime claims

#### Scenario: Another CodeGraph implementation is supplied
- **WHEN** package/config provenance identifies a similarly named project other than `colbymchenry/codegraph`
- **THEN** validation rejects it as outside the accepted server identity
