## ADDED Requirements

### Requirement: Pi exclusively owns theme, working and thinking components
AILI SHALL NOT register a custom package theme, hide/replace Pi's Working Line, install a custom working indicator, patch Pi assistant/thinking component prototypes, or replace Pi's native thinking renderer.

#### Scenario: Agent or tool is running
- **WHEN** Pi displays active work or thinking
- **THEN** only Pi-native working/thinking components animate and no AILI shimmer, Code Rain or reasoning trail appears

#### Scenario: Package resources are enumerated
- **WHEN** the installed package manifest is inspected
- **THEN** Matrix, Rose theme, custom header and Zentui theme/editor/message/thinking resources are absent

### Requirement: Retired UI configuration is preserved but ignored
Existing Matrix, Rose theme and Zentui configuration files SHALL NOT be deleted or rewritten during install, upgrade, startup or rollback. The new runtime SHALL ignore them.

#### Scenario: Upgrade finds old Matrix configuration
- **WHEN** the new package starts
- **THEN** Pi-native UI remains active and the legacy file stays byte-identical

### Requirement: AILI provides only a lightweight footer through public Pi APIs
AILI MAY replace the footer through `setFooter()` and consume extension statuses through public APIs. The footer SHALL prioritize active model and material Codex quota state, MAY show quota reset/update age and current local time, and MAY show context/git/cwd/update state when reliably available without a second update client.

#### Scenario: Wide terminal has quota data
- **WHEN** `pi-quota-status` publishes current Codex quota metadata
- **THEN** the footer shows model, quota and relevant reset/update information with bounded labels

#### Scenario: Quota or update data is unavailable
- **WHEN** no reliable value is published
- **THEN** the footer omits or labels it unavailable and does not fabricate stale success

### Requirement: Footer refresh is bounded and disposable
Clock refresh SHALL occur no more than once per minute. Quota and status rendering SHALL request redraw only on value changes. All timers and listeners SHALL be disposed on shutdown, reload and session replacement.

#### Scenario: Long task runs for ten minutes
- **WHEN** no footer status changes except time
- **THEN** the footer causes at most minute-level refreshes and no high-frame-rate full-screen animation

#### Scenario: Session is replaced
- **WHEN** Pi switches, reloads, forks or shuts down the session
- **THEN** the old footer's timer/listeners stop and cannot update the new session

### Requirement: Narrow terminals degrade deterministically
The footer SHALL drop optional fields in a documented priority order before truncating material model/quota state and SHALL never emit a line wider than the terminal.

#### Scenario: Terminal width is small
- **WHEN** all candidate footer segments do not fit
- **THEN** optional cwd/git/context/update/time details disappear first and the rendered line stays within width

## MODIFIED Requirements

### Requirement: Rose working animation is retired
AILI SHALL remove the Matrix working widget, shimmer/status line, four-line Code Rain, animation timer, commands and settings. It MUST NOT replace them with a lower-frame-rate AILI animation or another spinner.

#### Scenario: Runtime package loads
- **WHEN** the package is installed or upgraded
- **THEN** no Matrix command/widget/timer registers and Pi's Working Line remains visible
