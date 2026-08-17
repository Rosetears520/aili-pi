## ADDED Requirements

### Requirement: Dedicated changes page
The Web UI SHALL provide a VS Code-style changes viewer as a dedicated page (route `/changes`) opened in a new browser tab from the button in the top bar right of the system-prompt (System) entry. The page SHALL NOT replace or overlay the chat surface. The top-bar button keeps showing the changed-file count it already reports. The in-app overlay inspector is retired in favor of the page, and the changes keybind opens the same page.

#### Scenario: Opening the viewer
- **WHEN** a user clicks the changes button (or presses the changes keybind)
- **THEN** the dedicated changes page opens in a new browser tab for the current session working directory

#### Scenario: Reopening focuses the same tab
- **WHEN** the changes page is already open and the user clicks the button again
- **THEN** the existing tab is reused (named window) instead of stacking new tabs

### Requirement: Fast file list with relative paths and real statistics
The changes page SHALL list changed files with paths displayed relative to the repository root and per-file add/remove counts. The counts SHALL come from Git's numstat aggregation, not from reading file contents; untracked files display their status without fabricated counts. The listing SHALL remain responsive with hundreds of changed files by never loading per-file patch content up front: a file's patch is fetched only when the user selects it, for both the working-tree and the versus-upstream scopes. Both scopes' backends SHALL return the actual unified patch for a requested path (never only hunk headers).

#### Scenario: Relative paths
- **WHEN** the file list renders
- **THEN** every path is shown relative to the repository root, never as an absolute filesystem path

#### Scenario: Selecting a file in either scope
- **WHEN** a user selects a changed file in the working-tree scope or the versus-upstream scope
- **THEN** the file's unified patch loads on demand and renders real added/removed rows (not `+0 −0` placeholders)

#### Scenario: Large repositories stay responsive
- **WHEN** a repository has hundreds of changed files or a file has a very large diff
- **THEN** the list renders without per-file patch fetches and the diff view caps rendered rows with an explicit truncation notice instead of freezing

### Requirement: File diff rendering
Selecting a changed file SHALL render the diff with a per-file header showing the relative file name and computed add/remove counts, in two user-toggleable layouts: a unified (inline) view with dual line-number gutters and per-row `+`/`−`/context sign and coloring, and a split (side-by-side) view aligning old and new versions with deletion/addition tinting. The layout choice persists across opens. The visual style follows the aicss file-diff component's published CSS — rounded card, dual line-number columns with a full-height divider, a 3px left accent bar (solid green for additions, red hatch for deletions), dimmed context code, and dark-theme variants — copied and adapted (user authorization 2026-08-15).

#### Scenario: Diff rows are faithful
- **WHEN** a file with additions and deletions is selected
- **THEN** added, deleted, and context rows render with the correct gutters, signs, and coloring, and header counts match the rows

#### Scenario: Split view alignment
- **WHEN** the user toggles the split layout on a file with a modified hunk
- **THEN** the old version renders on the left and the new version on the right, with paired changes aligned per row, deletions tinted on the old side, and additions tinted on the new side

### Requirement: Local-versus-remote comparison
The changes page SHALL offer a comparison scope between the local working tree/HEAD and the repository's upstream remote branch (for example `@{u}`), reporting bounded diagnostics when no upstream is configured, the remote data is stale, or the repository is offline. Remote comparison MUST NOT fetch, push, or mutate repository state.

#### Scenario: Compare against upstream
- **WHEN** a repository has a configured upstream branch and the user selects remote comparison
- **THEN** the page shows the local-versus-remote diff for changed files

#### Scenario: No upstream configured
- **WHEN** a repository has no upstream branch
- **THEN** the page reports that remote comparison is unavailable and keeps the local working-tree view usable

#### Scenario: Read-only guarantee
- **WHEN** any remote comparison is performed
- **THEN** no fetch, push, or other repository-mutating Git command runs
