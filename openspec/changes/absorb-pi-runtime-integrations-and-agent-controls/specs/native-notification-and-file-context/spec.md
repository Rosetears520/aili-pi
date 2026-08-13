## ADDED Requirements

### Requirement: Notifications retain applicable upstream terminal behavior without affecting turns
AILI SHALL retain applicable `pi-notify` desktop notification behavior for the interactive Parent session: OSC-capable terminals, tmux passthrough, Windows Terminal/WSL PowerShell toast, and optional sound hook execution. Persistent Workers SHALL not emit duplicate desktop notifications. Notification failures SHALL be non-fatal and SHALL NOT fail or delay Main Agent, Persistent Agent, or Pi session completion.

#### Scenario: WSL Windows Terminal toast fails
- **WHEN** `WT_SESSION` is present and PowerShell toast execution fails or cannot start
- **THEN** the Agent completion remains successful and the failure is bounded/non-fatal

#### Scenario: tmux OSC notification
- **WHEN** a supported OSC terminal runs inside tmux
- **THEN** the terminal notification sequence is wrapped through tmux passthrough without changing the Agent result

#### Scenario: Worker completion
- **WHEN** a Persistent Worker completes
- **THEN** it does not emit an additional desktop notification and its task settlement remains unaffected

### Requirement: File Context preserves bounded immutable TUI selections
AILI SHALL retain the absorbed file-context TUI experience for bounded file search/content search, preview, line-range and hunk selection, Git status/diff/blame/history/revision, immutable snapshot, content hash, provenance and deterministic token estimate. The current upstream limits are preserved: discovery at most 5,000 files; query length at most 256 characters; at most 100 content results; preview source at most 1 MiB; Git command output at most 1.1 MiB with a 5-second bound and history at most 20 entries; a snapshot at most 500 lines or 50 KiB; and at most 8 selected items/100 KiB aggregate. Discovery and loading SHALL retain root, regular-file, symlink, binary and size boundaries.

#### Scenario: Selected file changes later
- **WHEN** a user selects a file range and the file changes before prompt submission
- **THEN** the submitted context is the selection-time snapshot with its selection-time hash/provenance and is not silently reread

#### Scenario: Symlink target escapes root
- **WHEN** discovery or preview encounters a symlink or a path resolving outside the project root
- **THEN** it is not attached as context

### Requirement: File Context remains adaptable to future shared Context Core
The absorbed file-context domain structures and filesystem/Git services SHALL remain separable from its TUI controller. This change SHALL NOT implement a Web context backend or a full Context Core.

#### Scenario: Current TUI behavior remains active
- **WHEN** a user invokes File Context in the Pi TUI
- **THEN** the existing TUI adapter uses the shared domain services without requiring a Web runtime
