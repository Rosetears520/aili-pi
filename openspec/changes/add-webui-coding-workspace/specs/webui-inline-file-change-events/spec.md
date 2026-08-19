## ADDED Requirements

### Requirement: FileChangeEvent model from real tool results
The Web UI SHALL derive `FileChangeEvent` records — id, path, file name, optional language, operation (`edit` | `create` | `delete` | `rename` with old path), additions, deletions, unified diff, optional tool call id, and timestamp — exclusively from arrived, non-error results of file-mutating tools (edit, write, apply_patch, and MCP-decorated equivalents), and MUST NOT infer file changes from assistant reasoning or prose.

#### Scenario: Successful edit produces one event
- **WHEN** an edit tool call completes successfully with patch/diff details
- **THEN** exactly one FileChangeEvent with counted additions and deletions attaches to the timeline at the tool call position

#### Scenario: Failed writes produce nothing
- **WHEN** a file-mutating tool call errors, is cancelled, or returns without patch/diff data
- **THEN** no FileChangeEvent is presented and no placeholder change card is rendered

#### Scenario: Rename carries both paths
- **WHEN** a rename-style mutation succeeds
- **THEN** the event records the old path and new path and presents the rename operation

### Requirement: Default-collapsed inline change card
Each FileChangeEvent SHALL render in the reasoning/tool timeline as a default-collapsed single-row card containing the operation icon, operation type label, language/file icon, file name (primary visual weight), parent path (secondary), `+N −M` counts, and an expand chevron; activating the row expands the diff body below a header that stays visible and stationary, and activating it again collapses it.

#### Scenario: Collapsed row is the timeline default
- **WHEN** a turn contains file changes
- **THEN** each change renders as one collapsed row and no diff body is expanded by default

#### Scenario: Header stays fixed while expanded
- **WHEN** a change card is expanded
- **THEN** its header row remains visible and stationary while the diff body renders beneath it

### Requirement: Bounded inline diff with full-diff handoff
The inline diff SHALL be capped by height or line count with an explicit "Show full diff" affordance that navigates to the full `ChangeDiffView`, and the inline presentation MUST use unified diff only (no side-by-side).

#### Scenario: Long diff does not balloon the timeline
- **WHEN** an event's diff exceeds the inline cap
- **THEN** the card renders the bounded portion plus a "Show full diff" control leading to the full diff surface

### Requirement: Tool details are an explicit disclosure
Raw tool arguments, raw results, and timing SHALL remain available only behind an explicit tool-details disclosure associated with the change card, and MUST NOT be the default timeline presentation for file mutations.

#### Scenario: Raw JSON is not the default view
- **WHEN** a file-mutating tool call completes
- **THEN** the timeline shows the structured change card, with input/result JSON reachable only through the disclosure

### Requirement: File-name navigation
The file name on a change card SHALL open the file in the CodeView workspace surface.

#### Scenario: File name click opens CodeView
- **WHEN** the user activates the file name on an inline change card
- **THEN** the workspace opens that file in the CodeView without losing chat context
