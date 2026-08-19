## ADDED Requirements

### Requirement: Workspace composition and cross-surface navigation
The Web UI SHALL compose a Workspace surface containing the session-cwd file tree, a read-only CodeView, and a full DiffView, with navigation from file tree entries to CodeView, from changed files or Changes entries to DiffView, from inline change-card file names to CodeView, and from "Show full diff" to the full DiffView.

#### Scenario: Timeline file name opens the file
- **WHEN** the user activates a file name on an inline change card
- **THEN** the file opens in the CodeView and the chat context is preserved

#### Scenario: Changed file opens its diff
- **WHEN** the user activates a git-changed file or a Changes entry
- **THEN** the workspace presents that file's diff in the full DiffView

### Requirement: FileTree bound to the single session filesystem
The file tree SHALL be bound to the current session cwd through the existing file API and allowed-roots enforcement, and SHALL provide expand/collapse, file type icons, selected-file indication, git modified/added/deleted status, manual refresh, and current-cwd display. It MUST NOT create a second filesystem, path, or file-watching runtime.

#### Scenario: Tree reflects git state
- **WHEN** files are modified, added, or deleted relative to git
- **THEN** the tree indicates their status after refresh and highlights changed directories

#### Scenario: Tree stays inside allowed roots
- **WHEN** the tree lists or opens entries
- **THEN** all access resolves through the existing file-access allowed-roots rules for the session cwd

### Requirement: Read-only CodeView
The CodeView SHALL remain read-only and provide syntax highlighting, line numbers, horizontal scrolling, copy, go-to-line, file tabs, and the current file path. It MUST NOT gain editing capability (no Monaco or equivalent editor) in this change; file mutation stays owned by agent tools.

#### Scenario: Viewing never mutates
- **WHEN** a user opens, copies, or navigates a file in the CodeView
- **THEN** the file on disk is unchanged and no write path is exposed

#### Scenario: Tab state is restorable
- **WHEN** the user reopens or switches file tabs
- **THEN** scroll position, wrap state, and display mode are restored per the existing tab-state conventions

### Requirement: First-phase workspace scope
The first workspace phase SHALL deliver the tree, CodeView, and full DiffView with the navigation above. Tree context menus, drag-to-composer, @-mention integration, and tree search are out of the first phase and may arrive only through later accepted work.

#### Scenario: Deferred interactions do not block delivery
- **WHEN** the first workspace phase is verified
- **THEN** it is complete without tree context menu, drag, @-mention, or search behavior
