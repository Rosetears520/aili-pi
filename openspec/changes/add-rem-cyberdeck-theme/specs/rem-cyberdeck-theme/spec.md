## ADDED Requirements

### Requirement: Rem Theme is a complete Pi Package theme
The Package SHALL expose one `rem-cyberdeck` Theme JSON with every required current Pi theme token and no replacement CLI.

#### Scenario: Pi discovers the theme
- **WHEN** the Package is loaded by Pi
- **THEN** Pi discovers exactly the declared Rem theme resource and it validates against the current theme schema

### Requirement: Header and working surfaces use public Pi UI APIs
The runtime SHALL render the supplied Rem Unicode/Braille header and a bounded working indicator/widget using public header, working-indicator, and widget APIs.

#### Scenario: Narrow terminal
- **WHEN** terminal width cannot fit the header artwork
- **THEN** each output line is safely truncated to the render width and the session remains usable

### Requirement: Footer reports bounded live state without a new quota poller
The footer SHALL render available cwd, Git branch/status, context usage, token count, local time, and existing extension status entries (including permission and network state); it SHALL omit operating-system and runtime-version segments, wrap to a second line rather than truncate when its primary left/right content cannot fit, and reuse `pi-quota-status` rather than creating quota requests or state files.

#### Scenario: Quota is unavailable
- **WHEN** no supported authenticated quota source is available
- **THEN** the footer keeps the session usable and reports no fabricated quota value

### Requirement: Fixed editor is default-on but fail-safe
The fixed editor SHALL be enabled by default only after a capability check of the required Pi TUI internals. It SHALL use an alternate screen, bounded scroll region, and optional mouse reporting only after that check; otherwise it SHALL leave Pi's native editor active and expose an explicit degradation result.

#### Scenario: Compatible TUI
- **WHEN** the capability check succeeds in an interactive Linux terminal
- **THEN** transcript scrolling is restricted above a pinned editor/footer cluster and editor input remains functional

#### Scenario: Incompatible TUI or terminal
- **WHEN** a required internal method, layout, terminal capability, or installation step is unavailable
- **THEN** no internal patch remains installed, native editor behavior continues, and the downgrade is visible

### Requirement: Fixed editor restoration is complete
The runtime SHALL restore patched descriptors, terminal scroll region, mouse modes, alternate screen, and cursor on disable, session shutdown, and process exit.

#### Scenario: Fixed editor is disabled or session ends
- **WHEN** the user disables the feature or Pi shuts down
- **THEN** terminal text selection/scrollback behavior is not left in a modified terminal mode
