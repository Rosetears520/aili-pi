## MODIFIED Requirements

### Requirement: Active work uses one contiguous Rose Widget with optional Code Rain
During an enabled TUI agent run with a resolved appearance, the Extension SHALL hide Pi's native Working Line and SHALL render one `rose-matrix-engine` Widget. When `rainEnabled=true`, the Widget SHALL contain exactly one Rose Shimmer line followed immediately by exactly four Rose Code Rain lines. When `rainEnabled=false`, it SHALL contain exactly the one Rose Shimmer line and no Rain or separator rows. Every returned line SHALL have exactly the supplied terminal-cell width.

#### Scenario: Rain is enabled
- **WHEN** an eligible agent run starts with `enabled=true` and `rainEnabled=true`
- **THEN** Pi's native Working Line is hidden and the Widget returns exactly five contiguous width-safe lines

#### Scenario: Rain is disabled independently
- **WHEN** an eligible agent run starts or rerenders with `enabled=true` and `rainEnabled=false`
- **THEN** Pi's native Working Line stays hidden and the Widget returns exactly one width-safe Shimmer line

#### Scenario: Whole animation is disabled
- **WHEN** `enabled=false`, mode is not TUI, or auto appearance cannot classify the active theme
- **THEN** no Rose Widget or animation timer is installed and Pi's native Working Line remains available

### Requirement: Shimmer and optional Code Rain share one animation clock
The Extension SHALL use one deadline-based animation scheduler for Shimmer frames, moving text highlight, elapsed display, optional Code Rain motion, and glyph changes. `rainEnabled=false` SHALL NOT create a second clock or stop Shimmer animation. Re-enabling Rain SHALL reuse the active generation and SHALL NOT leave stale timers or drops.

#### Scenario: Rain preference changes during an active run
- **WHEN** `/rose-matrix rain on|off` changes the stored preference
- **THEN** the next render uses one-line or five-line output while at most one animation timer remains live

### Requirement: Rose commands and Matrix configuration migrate compatibly
The canonical command SHALL support `status`, `on`, `off`, `rain on|off`, `preview`, `fps`, `density`, and `appearance`. Canonical configuration SHALL be version 3 and SHALL contain `enabled`, `rainEnabled`, `fps`, `density`, fixed `height:4`, and `appearance`. Valid v2/legacy configuration without `rainEnabled` SHALL migrate atomically with `rainEnabled=true`, preserving existing values and retaining the legacy file. `/rose-matrix on|off` SHALL change only `enabled`; `/rose-matrix rain on|off` SHALL change only `rainEnabled`.

#### Scenario: Existing v2 config is loaded
- **WHEN** a valid v2 config omits `rainEnabled`
- **THEN** canonical runtime state uses v3 with `rainEnabled=true` and preserves enabled/FPS/density/appearance

#### Scenario: Master switch is restored
- **WHEN** Rain is off, the user runs `/rose-matrix off` and later `/rose-matrix on`
- **THEN** the Widget returns in Shimmer-only mode because the Rain preference was not overwritten

#### Scenario: Config is corrupt or unsafe
- **WHEN** the selected config path is corrupt, unreadable, symlinked, or unsafe to overwrite
- **THEN** the Extension does not overwrite it, uses runtime defaults only, and emits an actionable warning
