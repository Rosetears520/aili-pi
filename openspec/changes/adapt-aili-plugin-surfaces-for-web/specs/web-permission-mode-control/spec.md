## ADDED Requirements

### Requirement: Composer mode chip and menu
The Web UI SHALL show the current permission mode as a chip in the composer's left control cluster. Activating the chip SHALL open a menu listing the shipped modes (Default, Plan, Build, YOLO) plus any custom modes declared in `permission-mode.json`, and selecting an entry SHALL switch modes by invoking the existing `/perm` extension command handler in the active web session — preferably directly (the same handler entry the TUI shortcut calls) so no user message is journaled, no command run appears, and the composer never enters the streaming state; when direct invocation is unavailable the command may fall back to the prompt pipeline with transcript echo suppressed. The web layer MUST NOT duplicate, reinterpret, or bypass permission-mode resolution or enforcement. The chip SHALL remain visible and operable whenever the composer is shown — including while the session is streaming (direct invocation never touches the prompt pipeline) — mirroring the TUI footer's always-on mode indicator. It renders disabled only when no session exists.

#### Scenario: Switching from the chip
- **WHEN** a user opens the mode chip and selects Build
- **THEN** the session switches mode through the `/perm` handler and the chip reflects Build immediately

#### Scenario: Switching has no command-run phase
- **WHEN** a mode switch is triggered while direct invocation is available
- **THEN** no user message is journaled, no command-run indicator appears, and the composer does not enter the streaming state

#### Scenario: Chip stays operable while streaming
- **WHEN** the session is streaming a response
- **THEN** the mode chip remains visible and can switch modes instead of disappearing from the composer

#### Scenario: Custom modes appear
- **WHEN** `permission-mode.json` declares a custom mode
- **THEN** the chip menu lists it alongside the shipped modes with equal treatment

#### Scenario: No active session
- **WHEN** no web session is active
- **THEN** the mode chip renders disabled and performs no command execution

### Requirement: Seeded and truthful current-mode display
When no extension permission status has arrived yet, the chip SHALL seed its initial display from the active session's journal (the most recent `perm-mode` entry), or from the configured default mode when the journal has no entry, rather than showing an unlabeled placeholder. Once the extension reports a status, the extension-reported state is authoritative and MUST override the seed. The chip MUST NOT infer mode from transcript text.

#### Scenario: Session open before any status event
- **WHEN** a user opens a session whose journal's last `perm-mode` entry is `yolo` and no status event has arrived yet
- **THEN** the chip shows YOLO immediately from the journal seed

#### Scenario: Journal-less sessions show the default
- **WHEN** a session has no `perm-mode` journal entry and no status event has arrived
- **THEN** the chip shows the configured default mode instead of a placeholder

#### Scenario: Status overrides the seed
- **WHEN** the extension reports a permission status that differs from the seeded value
- **THEN** the chip switches to the extension-reported mode

### Requirement: Web mode-cycling shortcut with direct-feel switching
The Web UI SHALL provide a keyboard shortcut that cycles permission modes, active only when focus is not inside a text input. The default binding SHALL be `alt+m` (mirroring the TUI binding, including working while focus is inside the composer or another text input), and the binding SHALL be customizable through the web keybind configuration (see `web-custom-keybinds`). Cycling SHALL be computed against the current mode and the mode list's cycle order (sending `/perm <next>` explicitly), and the chip SHALL optimistically display the target mode as soon as the shortcut fires, reconciling to the extension-reported status when it arrives. Self-issued `/perm` commands from the chip or the shortcut SHALL NOT be echoed as user messages in the chat transcript (the session journal's `perm-mode` record is unaffected). Mode changes triggered by the shortcut MUST go through the same `/perm` pathway as the chip.

#### Scenario: Cycling outside inputs
- **WHEN** focus is outside any text input and the user presses the mode-cycling shortcut
- **THEN** the mode advances to the next entry in the cycle order and the chip shows the target mode immediately

#### Scenario: Unresolved mode is never guessed
- **WHEN** the current mode has not been resolved yet (session or seed still loading) and the user presses the mode-cycling shortcut
- **THEN** the chip resolves the current mode first (journal seed) instead of switching to the first cycle entry, and the first completed switch uses direct invocation — switching rides the same session RPC channel as model and thinking-level changes (which waits for extension readiness natively), with only a permanently missing direct-execution capability (not a transient miss) allowed to fall back to the command path

#### Scenario: Cycling works while typing
- **WHEN** focus is inside the composer and the user presses the mode-cycling shortcut
- **THEN** the mode advances like the TUI's alt+m (the keystroke produces no text)

#### Scenario: Other actions never hijack typing
- **WHEN** focus is inside any text field and the user presses a non-mode keybind
- **THEN** the keystroke is delivered to the input and no action runs

#### Scenario: No transcript echo
- **WHEN** a mode switch is triggered from the chip or the shortcut
- **THEN** no "/perm …" user message appears in the chat transcript

### Requirement: Truthful mode and sandbox indication
The mode chip SHALL derive its settled state from the permission-mode status the extension reports (for example the `setStatus("perm", …)` bridge) and MUST NOT infer mode from transcript text. Optimistic updates are display-only and MUST reconcile to the extension-reported status. When the OS sandbox is unavailable, the chip SHALL present the same degraded-sandbox warning the TUI indicator shows.

#### Scenario: Mode state comes from the extension
- **WHEN** the mode changes from any surface (chip, shortcut, `/perm` command)
- **THEN** the chip settles on the extension-reported status rather than local prediction

#### Scenario: Sandbox degradation is visible
- **WHEN** the sandbox runtime is unavailable in a sandboxed mode
- **THEN** the chip shows the degraded warning styling instead of a healthy sandbox indicator
