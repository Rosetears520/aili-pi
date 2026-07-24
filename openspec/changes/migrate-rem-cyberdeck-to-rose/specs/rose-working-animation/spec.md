## ADDED Requirements

### Requirement: Active work uses one contiguous five-line Rose Widget
During an enabled TUI agent run with a resolved appearance, the Extension SHALL hide Pi's native Working Line and SHALL render one `rose-matrix-engine` Widget containing exactly one Rose Shimmer line followed immediately by exactly four Rose Code Rain lines. Every returned line SHALL have exactly the supplied terminal-cell width, and the Widget SHALL contain no empty separator line between Shimmer and Code Rain.

#### Scenario: Agent run begins with a known appearance
- **WHEN** `agent_start` occurs in TUI mode while Rose animation is enabled and appearance resolves to dark or light
- **THEN** Pi's native Working Line is hidden and the Widget returns exactly five contiguous width-safe lines

#### Scenario: Run is not eligible for Rose animation
- **WHEN** the Extension is disabled, the mode is not TUI, or auto appearance cannot classify the active theme
- **THEN** no Rose Widget or animation timer is installed and Pi's native Working Line remains untouched

### Requirement: Shimmer and Code Rain share one animation clock
The Extension SHALL use one deadline-based animation scheduler for Shimmer frames, moving text highlight, elapsed display, Code Rain motion, and glyph changes. It SHALL NOT register a second independent working-indicator, Shimmer, or Code Rain timer.

#### Scenario: Animation advances
- **WHEN** an active animation frame deadline is reached
- **THEN** one shared elapsed-time state determines both the Shimmer line and all Code Rain rows before one Widget render request

#### Scenario: Start is repeated
- **WHEN** `start` is called while a prior animation generation is still active
- **THEN** the prior generation is cleaned up first and at most one live animation timer remains

### Requirement: The four-phase state machine is truthful under parallel tools
The active phase SHALL be one of `requesting`, `thinking`, `working`, or `tool`. Active tools SHALL be tracked by unique `toolCallId`; `tool` SHALL take precedence while any ID remains. After the final tool ends, phase SHALL become `requesting`, and SHALL become `working` only on a subsequent assistant `text_start` or `text_delta` event.

#### Scenario: Model has not emitted content
- **WHEN** an eligible `agent_start` occurs before any thinking or text stream event
- **THEN** the Shimmer phase is `requesting`

#### Scenario: Thinking begins and ends
- **WHEN** `thinking_start` or `thinking_delta` occurs with no active tool
- **THEN** phase is `thinking`, and `thinking_end` returns it to `requesting` until assistant text output begins

#### Scenario: Parallel tools end out of order
- **WHEN** two or more tool IDs are active and one tool emits `tool_execution_end`
- **THEN** phase remains `tool` until every tracked ID has ended

#### Scenario: Final tool completes
- **WHEN** the last active tool ID ends
- **THEN** phase becomes `requesting`, not `working`, until an assistant text stream event arrives

#### Scenario: Duplicate or unknown tool end occurs
- **WHEN** `tool_execution_end` names an ID that is not active
- **THEN** the active tool count does not underflow and current phase is not changed by that unknown ID

### Requirement: Rose Shimmer uses a per-character moving highlight
The Shimmer indicator SHALL use the exact sequence `· ✢ ✳ ✶ ✻ ✽ ✻ ✶ ✳ ✢` and a deterministic 120 ms elapsed-time step. The status text SHALL use a moving four-character highlight band whose center reverses at text boundaries; it SHALL NOT flash or recolor the entire line as one block or require another timer.

#### Scenario: Normal phase renders in dark appearance
- **WHEN** phase is `requesting`, `thinking`, or `working` under dark appearance
- **THEN** the indicator uses `#C75B7A`, normal text uses `#88B8FF`, and the moving highlight reaches `#D6F4FF`

#### Scenario: Tool phase renders
- **WHEN** at least one tool is active
- **THEN** Shimmer text uses the `#BCA7FF` to `#7DE4FF` tool gradient and phase copy is `Running tools…`

#### Scenario: Light appearance renders
- **WHEN** appearance is light
- **THEN** status colors use contrast-safe derived values rather than raw `#88B8FF`, with normal text meeting at least 4.5:1 contrast on `#FAF7F2`

### Requirement: Status copy and statistics are exact
The phase messages SHALL be `Connecting to the model…`, `Weaving the next move…`, `Composing the response…`, and `Running tools…` for requesting, thinking, working, and tool respectively. Exact elapsed duration SHALL appear only after 30 completed seconds, floored from monotonic elapsed time and formatted as `Ns` below one minute or `Nm SSs` thereafter. Token output SHALL appear only from positive `usage.output` values directly reported by Pi/provider assistant events and SHALL be labeled `output tokens`; no character-, byte-, time-, or model-based estimate is permitted. Across a multi-turn agent run, finalized assistant-message output usage SHALL be summed exactly once and the current message SHALL contribute only its non-decreasing reported partial usage.

#### Scenario: No real usage is reported
- **WHEN** assistant events provide no usable monotonic `usage.output`
- **THEN** the Shimmer line contains no token field or approximate placeholder

#### Scenario: Real output usage is reported
- **WHEN** assistant events directly report a positive non-decreasing output usage value for the current message
- **THEN** completed-message output plus the current reported value may be displayed as `output tokens` without estimation

#### Scenario: A tool causes another assistant turn
- **WHEN** one assistant message finalizes usage and a later assistant message starts its own usage counter at zero
- **THEN** the finalized value is committed once, the legitimate message-boundary reset is not treated as drift, and final usage is not double-counted

#### Scenario: Usage decreases within one message
- **WHEN** a current assistant message reports a lower output value than its prior partial value
- **THEN** the lower value is ignored and no estimated replacement is synthesized

#### Scenario: Status line is narrow
- **WHEN** the full status message and suffix exceed terminal width
- **THEN** suffix content is truncated before the indicator and phase message, and the resulting line is right-padded to exactly the requested visible width

### Requirement: Rose Code Rain preserves deterministic geometry and bounded width coverage
Normal Code Rain SHALL retain the existing deterministic seed value, glyph set, even-cell track spacing, density semantics, length/gap/speed/offset generation, ordinary-width sequence, responsive full-width sampling, single-cell glyph requirement, and 96-track ceiling. It SHALL use a deterministic twelve-entry palette containing exactly ten blue/cyan/ice entries and two Rose entries; normal and fallback rain SHALL contain no green.

#### Scenario: Ordinary width renders
- **WHEN** candidate track count is within the 96-track budget
- **THEN** geometry fields match the existing deterministic sequence independently of the new color assignment

#### Scenario: Ultra-wide width renders
- **WHEN** terminal width is 320 or more cells and candidate tracks exceed the budget
- **THEN** no more than 96 deterministic tracks span both the first and final width deciles

#### Scenario: Palette is assigned
- **WHEN** tracks receive deterministic colors
- **THEN** 83.3% of the palette entries are `#88B8FF`, `#7DE4FF`, or `#D6F4FF`, the remaining entries are `#C75B7A` or `#E8A7B8`, and none is green

### Requirement: Every Code Rain row is non-blank after rendering
After normal track rendering, the renderer SHALL inspect all four Code Rain rows. Each fully blank row SHALL be repaired by a deterministic low-intensity vertical track extension, never by an isolated random point. The final render postcondition SHALL guarantee at least one non-space, contrast-qualified glyph in each row for every supported width and frame.

#### Scenario: One row is blank beside an occupied row
- **WHEN** normal rendering leaves one row empty and another row contains a glyph
- **THEN** repair extends a deterministic existing column into the empty row to form a vertical trail of at least two cells

#### Scenario: All four rows are blank
- **WHEN** normal rendering leaves every Code Rain row empty
- **THEN** one deterministic column receives a four-row low-intensity vertical track

#### Scenario: Repair completes
- **WHEN** blank-row repair returns
- **THEN** all four rows contain at least one non-space glyph, fallback glyph contrast is at least 2:1 against the active fade target, and every row still has exactly the requested visible width

### Requirement: Appearance is resolved without guessing unknown backgrounds
Matrix configuration SHALL support `appearance: auto | dark | light`. Explicit dark/light configuration SHALL win. In auto mode, built-in `light` SHALL resolve light; built-in `dark`, `rose-cyberdeck`, and a separately installed legacy `rem-cyberdeck` SHALL resolve dark. An unknown or unnamed theme SHALL NOT be silently classified.

#### Scenario: Known light theme is active
- **WHEN** appearance is auto and current theme name is `light`
- **THEN** trails fade toward `#FAF7F2` and light contrast-safe colors are used

#### Scenario: Rose theme is active
- **WHEN** appearance is auto and current theme name is `rose-cyberdeck`
- **THEN** trails fade toward `#10121D` and the dark Rose palette is used

#### Scenario: Unknown theme is active
- **WHEN** appearance is auto and the current theme is unknown or unnamed
- **THEN** Rose animation remains inactive, Pi's native Working Line remains visible, and one once-per-session actionable warning requests `/rose-matrix appearance dark|light`

#### Scenario: Active theme changes
- **WHEN** an active auto-mode run changes between known dark/light themes or changes to an unknown theme
- **THEN** a known change updates the next shared-clock frame, while an unknown change stops Rose animation and restores Pi's native Working Line before warning

### Requirement: Lifecycle cleanup restores Pi defaults completely
`agent_end`, `session_before_switch`, and `session_shutdown` SHALL perform idempotent cleanup of the Rose Widget, timer, phase, tool IDs, usage, render caches, active context, and generation. Cleanup SHALL restore Pi's default working message and indicator and set native Working Line visibility to true.

#### Scenario: Agent run ends
- **WHEN** `agent_end` occurs during any phase
- **THEN** no Rose Widget or live animation timer remains and Pi's native Working Line configuration is restored

#### Scenario: Session is replaced or shut down
- **WHEN** `session_before_switch` or `session_shutdown` occurs
- **THEN** cleanup is safe to repeat and no stale generation can request another render

### Requirement: Rose commands and Matrix configuration migrate compatibly
The canonical command SHALL be `/rose-matrix`, supporting `status`, `on`, `off`, `preview`, `fps`, `density`, and `appearance`. `/sakura-matrix` SHALL remain only as a deprecated alias that directs users to `/rose-matrix`. The canonical v2 config SHALL be `rose-cyberdeck-matrix.json` and SHALL contain `version: 2`; when absent, a valid legacy `sakura-cyberdeck-matrix.json` SHALL be converted atomically without deleting or rewriting the legacy file.

#### Scenario: Deprecated command is used
- **WHEN** a user invokes `/sakura-matrix` with valid arguments
- **THEN** the same Rose command behavior runs and a deprecation notice names `/rose-matrix`

#### Scenario: Valid legacy config exists
- **WHEN** the new config is absent and the legacy config is valid
- **THEN** enabled/fps/density are preserved, height is normalized to four, appearance defaults to auto, and a v2 new config is atomically written while the legacy file remains

#### Scenario: Config is corrupt or unsafe
- **WHEN** the selected new or legacy path is corrupt, unreadable, or unsafe to overwrite
- **THEN** the Extension does not overwrite it, uses runtime defaults only, and emits an actionable warning
