## ADDED Requirements

### Requirement: Pi 0.82.1 is the revision-bound supported host baseline
AILI SHALL treat exact `@earendil-works/pi-coding-agent@0.82.1` as the tested development and Linux-bootstrap minimum. Package lock, bootstrap preflight, version-bound doctor/release evidence, provenance/SBOM, fixtures and user documentation MUST identify the same baseline. This requirement does not authorize dependency or lockfile mutation by itself.

#### Scenario: Lower version reaches bootstrap
- **WHEN** bootstrap observes a syntactically valid Pi version lower than `0.82.1`, including `0.82.0`
- **THEN** it MUST fail before AILI package mutation and report the incompatible-version stage

#### Scenario: Version evidence drifts
- **WHEN** current-host evidence still claims `0.81.1` or `0.82.0` as the upgraded baseline
- **THEN** validation MUST fail rather than report Pi 0.82.1 compatibility

### Requirement: Wrapped bash preserves full Pi session-environment parity
AILI SHALL pass `ExtensionContext` to both local and sandboxed re-registered `createBashTool()` execution paths and retain Pi's default `PI_SESSION_ID`, persistent `PI_SESSION_FILE`, `PI_PROVIDER`, `PI_MODEL`, and `PI_REASONING_LEVEL`. Pi SHALL be allowed to remove stale inherited values before applying current context.

#### Scenario: Persistent local or sandboxed bash
- **WHEN** an eligible command starts with a persistent session and selected model
- **THEN** all five values MUST match the current context

#### Scenario: Ephemeral command with stale parent environment
- **WHEN** an eligible command has no session file and the parent environment contains stale `PI_*` values
- **THEN** `PI_SESSION_FILE` MUST be absent and no stale value may survive

### Requirement: Full parity does not create an AILI raw-session reader or weaken controls
AILI SHALL NOT proactively read/copy Session JSONL. An otherwise-authorized explicit bash read is an ordinary Pi tool result outside AILI Compact normal projection isolation. Permission ask/deny, sandbox, protected path and child credential controls MUST remain unchanged.

#### Scenario: Explicit session-file read
- **WHEN** authorized local bash explicitly reads `$PI_SESSION_FILE`
- **THEN** AILI MUST neither pre-read nor replace the file and MUST process output as an ordinary tool result

#### Scenario: Protected credential access
- **WHEN** a child targets credential/auth/private-key material
- **THEN** the existing protection MUST remain fail closed

### Requirement: Pi retains ownership of GPT-5.6 model metadata
AILI SHALL NOT add a package-owned context-window override or Provider re-registration for Codex OAuth GPT-5.6. Parent and persistent child sessions SHALL continue resolving Pi 0.82.1 registry metadata, including `contextWindow:272000` for `openai-codex/gpt-5.6-sol`, `openai-codex/gpt-5.6-terra`, and `openai-codex/gpt-5.6-luna`, unless the user independently configures a supported Pi override.

#### Scenario: Target Codex model resolves without a user override
- **WHEN** parent or persistent child resolves one of the three Codex GPT-5.6 IDs
- **THEN** AILI MUST preserve Pi's effective model metadata and MUST NOT substitute372K

#### Scenario: User model override exists
- **WHEN** the user supplies a valid Pi-supported `models.json` override
- **THEN** Pi's documented user override precedence MUST remain effective without an AILI-owned Provider wrapper

### Requirement: Existing runtime surfaces are proven on Pi 0.82.1
AILI SHALL rerun claim-matched evidence for unique Extension loading, native integrations, bootstrap, wrapped permission bash, persistent `task`/`hub` SessionManager/model/permission/delivery seams, model catalog refresh and Zentui fallback. Compile success or wildcard peer metadata alone MUST NOT establish support.

#### Scenario: Upgraded extension load fails
- **WHEN** the actual0.82.1 fixture reports import, registration or handler errors
- **THEN** compatibility MUST remain non-pass and old0.81.1 evidence MUST NOT be reused

#### Scenario: TUI smoke unavailable
- **WHEN** no authorized real Linux0.82.1 TUI is available
- **THEN** automated local compatibility MAY pass narrowly, while `UV-TUI-0821-1` blocks TUI-specific/release-ready claims

### Requirement: Native summary requests remain outside eligible cache-rate measurement
Pi native compaction and branch-summary requests using `cacheRetention:"none"` SHALL remain separate from AILI Compact eligible warm repeated requests.

#### Scenario: Native summary telemetry is observed
- **WHEN** AILI Compact classifies a native summary request
- **THEN** it MUST exclude it from the eligible warm-repeat cache-rate denominator
