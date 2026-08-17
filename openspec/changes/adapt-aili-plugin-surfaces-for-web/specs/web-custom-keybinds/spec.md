## ADDED Requirements

### Requirement: Configurable web keybinds
The Web UI SHALL support user-configurable keyboard shortcuts in the style of opencode's `tui.json` keybinds: a `keybinds` mapping from action id to one or more key strings, where `"none"` disables the action. The configuration SHALL be editable both through a settings dialog in the Web UI and through a persisted config file under the Pi agent directory, and SHALL apply to all registered web actions (initially: mode cycling, changes inspector, panel toggles).

#### Scenario: Rebinding an action
- **WHEN** a user sets the mode-cycling action to `alt+p` in the settings dialog
- **THEN** the new binding takes effect without a reload, `alt+m` no longer cycles modes, and the persisted config reflects the change

#### Scenario: Disabling an action
- **WHEN** a user sets an action's binding to `"none"`
- **THEN** no key combination triggers that action and its other entry points (chip, button, menu) remain available

#### Scenario: Multiple bindings per action
- **WHEN** a user assigns two key strings to one action
- **THEN** both combinations trigger the action

### Requirement: Keybind validation and safety
The keybind configuration SHALL reject bindings that are empty, malformed, or reserved by the browser for critical functions, with a bounded error naming the offending entry. Configured shortcuts MUST never fire while focus is inside a text input, and an invalid configuration MUST fall back to defaults for the offending entries only while leaving valid customizations active.

#### Scenario: Invalid binding is rejected
- **WHEN** a user enters a malformed or reserved key combination
- **THEN** the settings dialog rejects it with a bounded message and keeps the previous binding

#### Scenario: Partial fallback
- **WHEN** the persisted configuration contains one invalid and one valid entry
- **THEN** the valid entry applies and only the invalid entry falls back to its default
