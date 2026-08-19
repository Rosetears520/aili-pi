## Why

The AILI Web UI is currently a chat page plus tool-output surfaces: questionnaire interactions dock above the composer but permission approvals, confirmations, and other blocking interactions still render as centered modals; real file edits surface only as raw tool calls or a static written-files strip; diff rendering exists twice as independent implementations; skills are reachable only through the slash palette; and there is no developer terminal. The user wants the Web UI to become one unified Coding Agent Workspace — interaction docked at the composer, a file/code/diff workspace, structured inline change events in the reasoning timeline, and a user-controlled terminal — while AILI-Pi remains the only runtime and source of truth.

## What Changes

- Add an Interaction Shelf directly above the composer as the single presentation surface for blocking agent-initiated interactions, backed by an InteractionHost abstraction that assigns each interaction a presentation mode (`composer-shelf`, `inline`, `popover`, `modal`). Questionnaires, permission approvals (the permission-mode Allow/Deny asks that render as modals today), confirmations, and task/hub clarifications default to the shelf instead of modals; runtime blocking, Promise, timeout, and request/response behavior is preserved (presentation-only change).
- Introduce a formal `FileChangeEvent` model (path, file name, language, operation edit/create/delete/rename, additions, deletions, unified diff, tool call id, timestamp, old path for renames) produced exclusively from arrived, non-error results of file-mutating tools carrying real patch/diff data — never inferred from assistant reasoning — and render each event in the reasoning timeline as a default-collapsed inline change card (operation icon and type, language/file icon, file name, parent path, `+N −M`, chevron) that expands to a capped unified diff.
- Consolidate the two existing independent diff implementations (`AiliFileDiff` and the `patch.ts`/`SplitPatchView` path) into one shared `ChangeDiffView` renderer with `inline` and `full` variants, so the timeline inline diff, the file viewer diff mode, and the Changes workspace render from one component (unified only inline; unified and split in full).
- Compose the existing FileExplorer/FileViewer/Changes pieces into one Workspace: a session-cwd file tree with git modified/added/deleted status, a read-only CodeView with syntax highlighting, line numbers, copy, go-to-line, and tabs, and a full DiffView; wire cross-surface navigation (tree file click to CodeView, changed file to DiffView, timeline file name to CodeView, "Show full diff" to the full DiffView).
- Add collapsed-by-default skill chips on the composer surface (for example `Skills N ▼`) with Active/Available grouping and removable chips for enabled skills, backed only by the existing AILI skill registry and its activation/dormancy state.
- Add a user-controlled browser terminal (WebSocket to a server-spawned PTY, session-cwd default, ANSI, Ctrl+C, resize, reconnect/cleanup), labeled as user-controlled and explicitly separated from the agent bash tool and agent permission semantics; single terminal first, multi-terminal later.
- Deliver in the accepted phase order — Phase 1 Interaction Shelf, Phase 2 shared diff + inline change events, Phase 3 Workspace, Phase 4 skill chips, Phase 5 terminal — and start this change's BUILD only after `integrate-pi-web-ui-and-upstream-extensions` has been closed out, because both changes touch the same WebUI surfaces.
- Use PiChamber (primary) plus pi-gui, OpenPi, and pi-diff (auxiliary) as interaction and architecture references only: semantic/interaction-level absorption, no code copying, no dependency on those projects, and no second filesystem, Git/change-tracking, skill, permission, subagent, or Agent runtime.

## Capabilities

### New Capabilities

- `webui-interaction-shelf`: One composer-docked presentation surface with an InteractionHost presentation-mode abstraction for all blocking agent interactions; runtime request/response semantics unchanged.
- `webui-inline-file-change-events`: Tool-result-derived `FileChangeEvent` model and default-collapsed timeline change cards with capped unified diff and explicit tool-details disclosure.
- `webui-shared-diff-rendering`: One shared `ChangeDiffView` renderer with inline/full variants replacing both existing diff implementations, fed only by existing tool-result and git data sources.
- `webui-workspace-surfaces`: Session-cwd file tree with git status, read-only CodeView, and full DiffView composed as one workspace with cross-surface navigation.
- `webui-skill-chips`: Collapsed skill chip group on the composer surface with Active/Available grouping, existing registry as the sole data source.
- `webui-user-terminal`: User-controlled PTY terminal over WebSocket with explicit agent/bash separation, lifecycle cleanup, inherited access-security boundaries, and separately approved dependencies.

### Modified Capabilities

- None. `openspec/specs/` has no baseline capability specs yet; overlap with earlier change-local contracts (for example `aili-web-workbench` in `integrate-pi-web-ui-and-upstream-extensions`) is handled as design/verification convergence rather than a second modified-capability authority.

## Impact

- **Web application:** `src/web/` components and hooks (ChatWindow composer area, MessageView/ToolCallBlock timeline, FileViewer, FileExplorer, the Changes page, skill surfaces), the presentation layer of the extension-UI request/response plumbing, and new terminal API/transport routes.
- **Runtime/API:** presentation-only rewiring of existing blocking extension-UI flows; the terminal adds a PTY/WebSocket server path bound to the existing web backend and its access-security boundary; permission-mode semantics, tool authorization, and all existing owners stay unchanged (YOLO still never relaxes user questions).
- **Dependencies and provenance:** Phase 5 requires new runtime dependencies (PTY, WebSocket, terminal front-end — exact packages decided in design) and each dependency/lockfile change requires separate exact approval before BUILD; Phases 1–4 add no dependencies by default. Reference projects are read as MIT sources for design insight only, with no code import.
- **Testing:** unit tests for FileChangeEvent derivation and the InteractionHost mapping; component tests for shelf, change cards, diff renderer, chips, and terminal lifecycle; browser verification for shelf interactions, workspace navigation, and terminal behavior; placement follows the project test-location rules under `tests/` and existing component-test conventions.
- **Non-goals:** no Pi fork or replacement CLI, no editable CodeView or Monaco in this change, no side-by-side inline diff in the timeline, no multi-terminal in the first release, no tree context-menu/drag/@mention/search in the first workspace phase, no PiChamber/pi-gui/OpenPi code import or runtime dependency, no second filesystem/Git/skill/permission/subagent runtime, no per-tool permission-approval runtime (the shelf re-presents existing asks only), and no macOS or native-Windows support claims.
