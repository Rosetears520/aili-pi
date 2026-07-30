## ADDED Requirements

### Requirement: WSL receives a non-destructive image-paste keybinding
[FRAME] The Unix bootstrap SHALL invoke a WSL-aware keybinding merger. On detected WSL, when `~/.pi/agent/keybindings.json` is absent or is a valid regular JSON object without `app.clipboard.pasteImage`, apply mode SHALL atomically establish `app.clipboard.pasteImage` as `["ctrl+v","alt+v"]`. Existing unrelated properties SHALL be preserved. When the action already exists, the file SHALL remain byte-unchanged regardless of the user's chosen binding.

#### Scenario: WSL user has no keybinding file
- **WHEN** apply mode runs with a disposable WSL HOME and no keybinding file
- **THEN** a regular file is created atomically with both Ctrl+V and Alt+V image-paste bindings

#### Scenario: WSL user has unrelated bindings
- **WHEN** a valid object contains other actions but no image-paste action
- **THEN** those actions remain semantically identical and the image-paste action is added

#### Scenario: User already configured image paste
- **WHEN** the action exists with any user value
- **THEN** the merger reports no change and preserves the entire file byte-for-byte

#### Scenario: Runtime is not WSL
- **WHEN** check or apply mode runs outside WSL
- **THEN** no keybinding target is created, read, or changed

### Requirement: Unsafe keybinding targets fail closed before installation
[FRAME] Check mode SHALL run before package installation on WSL. Malformed JSON, non-object roots, symlinks, non-regular files, unsafe parent/target resolution, or inability to perform an atomic replacement SHALL produce a bounded failure and SHALL NOT install the package or alter the original target. Apply mode SHALL use an exclusive same-directory temporary file and atomic rename, and SHALL remove only its own failed temporary artifact.

#### Scenario: Existing target is a symlink
- **WHEN** check mode observes a symlink at the keybinding path
- **THEN** bootstrap stops before package installation and neither link nor destination is changed

#### Scenario: Atomic write fails
- **WHEN** apply mode cannot complete its owned temporary-write/rename sequence
- **THEN** the pre-existing target remains unchanged and bootstrap reports failure

### Requirement: Image bytes remain owned by Pi's existing paste path
[FRAME] AILI SHALL NOT implement clipboard-image reading, PowerShell image extraction, decoding, resizing, or attachment insertion. The keybinding SHALL dispatch Pi 0.82.1's existing `app.clipboard.pasteImage` action through the wrapped editor's forwarded `onPasteImage`. File drag-in SHALL remain unchanged.

#### Scenario: Alt+V is pressed with a Windows image in clipboard
- **WHEN** WSL interop, `wslpath`, `powershell.exe`, clipboard permission, and Pi's existing image path are available
- **THEN** the request is handled by Pi's image-paste implementation rather than an AILI duplicate

#### Scenario: User drags an image file into the terminal
- **WHEN** the terminal emits the existing dragged file path/input sequence
- **THEN** fixed-editor interception does not consume or reinterpret it

### Requirement: Documentation and tests distinguish automated from live evidence
[FRAME] README SHALL document WSL2 `Alt+V`, unchanged `Ctrl+V`, Pi's `wslpath`/PowerShell dependency, `/reload` or restart behavior, troubleshooting, and drag-in. Automated tests SHALL use disposable HOME and deterministic WSL signals and SHALL NOT read the real clipboard, run real PowerShell, or mutate real HOME. Actual Windows clipboard attachment remains Unverified until an authorized manual WSL2 check records it.

#### Scenario: Automated suite runs on Linux CI
- **WHEN** bootstrap/keybinding tests execute without a real Windows clipboard
- **THEN** merge/preservation/failure behavior is proved while live image attachment remains explicitly Unverified
