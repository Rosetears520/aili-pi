## ADDED Requirements

### Requirement: Footer renders actual resolved model and thinking
The Native Footer SHALL render the active canonical model followed by the active actual thinking level with one ordinary space and no additional label or parentheses. It SHALL refresh after model or thinking changes and SHALL NOT alter provider reasoning behavior merely to render text.

#### Scenario: High reasoning Codex model
- **WHEN** the active model is `openai-codex/gpt-5.6-terra` with active thinking `high`
- **THEN** the primary identity includes `openai-codex/gpt-5.6-terra high`

#### Scenario: Non-reasoning model
- **WHEN** active reasoning state is `off`
- **THEN** the primary identity shows `off`

### Requirement: Codex quota presentation is normalized without semantic change
For recognized Codex quota status, the footer SHALL parse the first upstream compact segment matching `5h <percentage>% <h:mm AM|PM> (<DD>/<MM>)`, then render `codex <percentage> <MM/DD> <HH:mm>` in the same local-time semantics, with a 24-hour clock, date before time, no parentheses and no duration-window label. Missing, malformed, expired, non-Codex or unparseable text SHALL be omitted rather than normalized speculatively. It SHALL NOT change the upstream percentage, reset instant, window or timezone semantics.

#### Scenario: Quota format
- **WHEN** the source quota corresponds to 75 percent and a reset at August 20 11:38 local time
- **THEN** the footer renders `codex 75% 08/20 11:38`

### Requirement: Footer secondary live state order is permission mode, MCP, clock
The footer SHALL obtain active permission mode by consuming the `perm` status published by `pi-permission-modes`, extracting its leading configured mode label rather than inferring from a prompt or environment variable, then render the right-side secondary sequence `Permission Mode · MCP x/y · HH:mm`. It SHALL refresh when `perm` status, MCP status, model or Pi `thinking_level_select` changes and preserve these live fields over cwd/branch at narrow widths.

#### Scenario: Live-state format
- **WHEN** active mode is YOLO, MCP is zero of four, and local time is 18:31
- **THEN** the secondary state renders `YOLO · MCP 0/4 · 18:31`

#### Scenario: Narrow terminal
- **WHEN** cwd/branch and all live segments cannot fit
- **THEN** cwd and branch are removed before permission mode, MCP status, or clock

#### Scenario: Unrecognized quota text
- **WHEN** the quota status does not exactly contain a current compact Codex 5h segment with percentage, clock and date
- **THEN** the footer omits normalized Codex quota rather than inventing a reset date or converting a different quota window

#### Scenario: Permission status changes
- **WHEN** `pi-permission-modes` publishes a new `perm` status whose leading mode label is Build
- **THEN** the next footer render includes `Build` before MCP and clock
