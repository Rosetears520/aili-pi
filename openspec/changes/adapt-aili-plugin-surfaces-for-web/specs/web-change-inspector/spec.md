## MODIFIED Requirements

### Requirement: Dedicated changes page
The Web UI SHALL provide a VS Code-style changes viewer as a dedicated page (route `/changes`) opened in a new browser tab from the button in the top bar right of the system-prompt (System) entry. The page SHALL NOT replace or overlay the chat surface. The top-bar button keeps showing the changed-file count it already reports. The in-app overlay inspector is retired in favor of the page, and the changes keybind opens the same page.

#### Scenario: Opening the viewer
- **WHEN** a user clicks the changes button (or presses the changes keybind)
- **THEN** a new changes-page tab opens for the current session working directory

#### Scenario: Every activation opens a new tab
- **WHEN** the changes page is already open and the user clicks the button again
- **THEN** another independent tab opens instead of focusing a reused named window, so several repositories/worktrees can be inspected side by side (user direction 2026-08-25)

## ADDED Requirements

### Requirement: Standalone directory selection and repository switching
The changes page SHALL be usable without any session context: opened bare (no `cwd` parameter) it restores the last chosen working directory after re-validating it through the cwd validation entry, or offers a directory chooser when none is stored. The page SHALL offer a project dropdown that lists recently used projects — derived from the same Pi session history the sidebar uses, plus canonical project roots previously picked on the page — with an entry that opens the directory chooser for anything else; a chosen directory is admitted through the cwd validation entry before any Git data is fetched. Selecting a non-Git directory SHALL report that state and offer re-selection instead of an empty listing. The page's URL and stored choice SHALL follow the active working directory so refresh and tab duplication preserve it.

#### Scenario: Bare open restores the last directory
- **WHEN** the changes page is opened without a cwd and a previously chosen directory is stored
- **THEN** the stored directory is re-validated server-side and becomes the active repository

#### Scenario: Switching between recent projects
- **WHEN** the user opens the project dropdown
- **THEN** it lists projects from Pi's session history and the page's own picked roots, and choosing one reloads every page surface against it after validation

#### Scenario: Adding a project not in the history
- **WHEN** the user picks the dropdown's directory-chooser entry and confirms a directory
- **THEN** that directory is validated, becomes active, and its canonical project root joins the remembered list

#### Scenario: Worktree grouping is preserved across switches
- **WHEN** the active repository has linked worktrees
- **THEN** they remain one project entry with one branch switcher on the page — switching projects or branches never splits a repository's parallel worktrees into separate entries

#### Scenario: Non-Git directory
- **WHEN** the chosen directory is not inside a Git repository
- **THEN** the page reports that it is not a Git repository and offers choosing another directory

### Requirement: Branch display freshness
The changes page SHALL always show the branch currently checked out in the active working tree, including repositories with a single worktree and detached-HEAD states, and SHALL refresh its worktree and branch data on every reload, on scope switches, and shortly after the tab regains focus, so branch switches made outside the browser are reflected.

#### Scenario: Single-worktree branch is visible
- **WHEN** the active repository has exactly one worktree checked out on any branch
- **THEN** the header identifies that branch instead of showing none or a stale default

#### Scenario: External branch switch is picked up
- **WHEN** the user switches branches in a terminal and then focuses the changes tab
- **THEN** the page refreshes its branch, worktree, and file data to match the new checkout

### Requirement: Branch switching
The changes page SHALL offer switching the active working tree to an existing local branch through `git switch`. A branch currently checked out by a sibling worktree of the same repository SHALL be marked in the switcher and SHALL navigate to that worktree instead of attempting a checkout Git would refuse. Uncommitted changes follow Git's default carry behavior; when Git refuses because changes would be overwritten, the page SHALL surface Git's refusal text without offering any force, discard, branch-creation, or remote-tracking path. Repository mutation beyond this switch (fetch, push, branch deletion) remains out of scope and the local-versus-remote comparison stays read-only.

#### Scenario: Switching to an existing local branch
- **WHEN** the user selects a different local branch in the page's branch switcher and the switch is safe
- **THEN** the working tree switches to that branch and all page data reloads

#### Scenario: Branch held by a sibling worktree
- **WHEN** the selected branch is already checked out in another worktree of the repository
- **THEN** the switcher marks it, and selecting it navigates the page to that worktree instead of erroring

#### Scenario: Git refuses the switch
- **WHEN** uncommitted changes would be overwritten by the switch
- **THEN** the page shows Git's refusal message and keeps operating on the unchanged branch

### Requirement: Collapsible file tree
The changes page's file list SHALL additionally offer a GitHub-style tree layout: files grouped under collapsible directory nodes with per-directory aggregated add/remove counts and changed-file totals, sorted directories-first then alphabetically. The tree SHALL coexist with the previous flat layout behind a persisted toggle, keep on-demand patch loading and numstat counts for files, and apply to both the working-tree and versus-upstream scopes.

#### Scenario: Tree grouping
- **WHEN** the tree layout is active and changes span nested directories
- **THEN** directory rows are collapsible, aggregate the counts beneath them, and file rows select and diff exactly as in the flat layout

#### Scenario: Layout choice persists
- **WHEN** the user toggles between tree and flat layouts
- **THEN** the choice persists across page opens like the diff-layout choice

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
