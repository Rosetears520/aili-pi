## Context

This change evolves the existing AILI Web UI (delivered by `integrate-pi-web-ui-and-upstream-extensions` from the locked `agegr/pi-web` baseline) from a chat page with tool outputs into one Coding Agent Workspace. All runtime owners stay unchanged: Pi sessions, permission modes, the skill registry, the file API with allowed-roots, and the git CLI-backed change data. PiChamber is the primary interaction reference; pi-gui, OpenPi, and pi-diff are auxiliary references. Nothing is imported from them.

Verified repository facts this design builds on (checked 2026-08-19):

- The questionnaire already docks above the composer (`.questionnaire-shelf` in `ChatWindow.tsx`), but every other blocking interaction — permission-mode approval asks (`Allow once / Allow for session / Allow forever / Deny` raised through `ctx.ui.select` by `src/vendor/pi-permission-modes/`), confirmations, selects, inputs, editors, and custom panels — renders through the `ExtensionDialog` centered modal. The method-to-surface mapping is a hard-coded switch in `src/web/hooks/useAgentSession.ts` with separate render sites in `ChatWindow.tsx`; the runtime promise plumbing (`requestExtensionUi`, `respondToExtensionUi`, timeouts, abort) is presentation-independent.
- The host Pi toolset is `bash`, `edit`, `find`, `grep`, `ls`, `read`, `write` — there is no `apply_patch`. The `edit` tool result carries real diff data (`details: { diff, patch, firstChangedLine }`, patch being a unified patch from `generateUnifiedPatch`); the `write` tool result carries `details: undefined`. Bash-based `mv`/`rm` mutations produce no structured file data.
- Diff rendering exists twice: `aili/AiliFileDiff.tsx` (used by the Changes page; unified + split, 3000-row cap) and `lib/patch.ts` `parseUnifiedPatch` → `SplitPatchView` (used by `MessageView.tsx` and `FileViewer.tsx` diff mode).
- `FileExplorer.tsx` is already a cwd-bound lazy tree with git status badges inside `SessionSidebar`; `FileViewer.tsx` is a read-only viewer with highlighting, line numbers, and tabs but no copy button and no go-to-line; `/changes` is a separate browser tab; `TurnWrittenFiles.tsx` is a static written-files strip without diffs or counts.
- Skills are served by `/api/skills` + `lib/skills-service.ts`; activation state is the per-cwd `disable-model-invocation` frontmatter toggled by `PATCH /api/skills`. There is no per-session skill state.
- The web transport is SSE-only; no WebSocket server, PTY, or terminal front-end exists anywhere in the package.

## Goals / Non-Goals

**Goals:**

- One Interaction Shelf above the composer hosting all first-batch blocking interactions, with an explicit InteractionHost presentation-mode mapping and unchanged runtime semantics.
- A `FileChangeEvent` pipeline derived exclusively from real tool results, rendered as default-collapsed inline change cards with capped unified diffs.
- One shared `ChangeDiffView` renderer (inline/full variants) replacing both existing diff implementations.
- A progressively integrated Workspace: existing tree/viewer/changes placements kept, navigation completed, CodeView gaps (copy, go-to-line) closed.
- Skill chips backed only by the existing registry/dormancy mechanism.
- A user-controlled PTY terminal over WebSocket, delivered last, inside the existing security boundary.

**Non-Goals:**

- No second filesystem, Git/change-tracking, skill, permission, subagent, or Agent runtime; no per-tool approval runtime; no change to permission-mode semantics.
- No editable CodeView (no Monaco), no side-by-side inline diff, no multi-terminal, no tree context menu/drag/@-mention/search in the first phases.
- No code import or dependency on PiChamber, pi-gui, OpenPi, or pi-diff; no Vue/Electron patterns beyond interaction reference.
- No new dependencies before Phase 5, and none without separate exact approval.

## Decisions

### 1. InteractionHost: one presentation-mode mapping in front of the existing plumbing

Add a client-side interaction presentation registry (a pure mapping module plus a shelf host in `ChatWindow`). Every blocking extension-UI request is assigned exactly one presentation mode — `composer-shelf` (default), `inline`, `popover`, or `modal` — before any render site sees it.

- Phase 1 shelf batch: `questionnaire`, permission-approval selects (identified by the permission-mode ask shape), `confirm`, `select`, `input`, and task/hub clarification requests.
- Explicit modal exceptions (recorded in the mapping with reasons): `editor` (large-text editing surface) and `custom` (raw terminal-style keystream panel). These keep their current `ExtensionDialog` presentation initially and can migrate later by changing one mapping entry.
- `useAgentSession.handleExtensionUiRequest` routes through the mapping instead of its hard-coded switch; `respondToExtensionUi`, timeouts, abort, generic-RPC fallbacks, and headless behavior are untouched.
- The shelf shows at most one primary card; additional pending requests appear as a compact queue indicator and become primary in order. No request is dropped or auto-answered.
- The modal path is retained as a render-failure fallback so a shelf error can never strand the runtime promise.
- The questionnaire keeps its current shelf behavior and `src/questionnaire/controller.ts` state machine; it simply becomes the first citizen of the generalized shelf.

**Alternative considered:** migrate every method including `editor`/`custom` to the shelf immediately. Rejected: both need large vertical space or raw key capture, and the user's text defines only the first batch as mandatory.

**Alternative considered:** PiChamber-style modal-first `ExtensionUiHost`. Rejected by the requirement text; shelf-first is the accepted direction.

### 2. FileChangeEvent derivation from real tool results only

A pure derivation module (web-side, e.g. `src/web/lib/file-change-events.ts`) turns a turn's tool-call/result pairs into `FileChangeEvent[]` (id, path, fileName, language, operation, additions, deletions, diff, toolCallId, timestamp, oldPath for renames). Inputs and fallbacks follow the verified tool evidence:

| Source | Data available | Behavior |
|---|---|---|
| pi `edit` | `details.patch` (unified), `details.diff`, `firstChangedLine` | Primary path: operation `edit`, counts parsed from the patch, patch stored for the card. |
| pi `write` | `details: undefined`; input carries full content | Operation `create`/`edit` by prior-existence signal if cheaply known, else `create`. Additions from input content line count; when the cwd is a git worktree, lazily fetch the per-file diff from the existing `/api/git/diff` route to fill the patch and true counts; non-git or failed fetch renders an additions-only card with a "diff unavailable" body. |
| Any other arrived, non-error tool result (including MCP-decorated names via the existing `tool-names.ts` predicates) with `details.patch`/`details.diff` and a resolvable `input.file_path`/`input.path` | generic | Event derived exactly like `edit`. This covers future tools and any `apply_patch`-style addition without schema changes. |
| bash `mv`/`rm` and shell-driven mutations | no structured file data | Never synthesized. Parsing shell output to guess file operations would violate the real-tool-result principle; `rename`/`delete` stay schema-level operations produced only by tools that report them. |

Assistant reasoning and prose are never inputs. Failed, cancelled, or patch-less successful mutations that cannot be enriched render either nothing or a path-only card — never an invented diff. `TurnWrittenFiles` (turn-end summary strip) initially remains as the turn-level summary alongside the per-call cards; consolidating the two surfaces is ordinary BUILD steering, not a contract change.

### 3. One shared ChangeDiffView with inline and full variants

Consolidate the two diff implementations into one renderer (e.g. `src/web/components/aili/ChangeDiffView.tsx`) over a single patch parser and row model — extending the stronger existing implementation (`AiliFileDiff`'s unified+split row model with caps) and migrating `lib/patch.ts`/`SplitPatchView` consumers onto it, deleting the duplicate.

- `variant="inline"`: unified only, compact gutters, bounded height/line cap (default cap tuned in implementation, on the order of tens of lines), truncation indication, and the "Show full diff" handoff control supplied by the host card.
- `variant="full"`: unified and split with the existing persisted preference (`localStorage("aili-diff-view")`), today's ~3000-row render cap, per-file `+adds/−dels` header.
- Consumers after migration: the inline change card (inline), `FileViewer` diff mode (full), the Changes page (full), and the expanded tool-result diff view in `MessageView` (replacing `SplitPatchView`).
- The renderer consumes unified patch strings only; it never fetches data and never computes change truth.

**Alternative considered:** keep both renderers and add a third shared one for the timeline. Rejected: three diff code paths is exactly the duplication this change removes.

### 4. Workspace as progressive integration of the existing surfaces

Keep the current placements — `FileExplorer` in the left sidebar (cwd-bound, git badges), `FileViewer` as the preview/CodeView pane with tabs, `/changes` as the full-diff page — and complete the workspace by wiring and gap-filling rather than relayout:

- CodeView completion in `FileViewer`: copy-to-clipboard action, go-to-line input (with `#L`-style deep link from navigation callers), and the always-visible current file path. Tabs, highlighting, line numbers, wrap, and watch mode already exist.
- Navigation wiring through the existing `file-tab-state.ts` `openFileTab` with `modeHint`: inline change-card file name → source tab; changed file in the tree or Changes list → diff-mode tab; "Show full diff" on an inline card → the existing `/changes` open path (`window.open` / `aili:changes:open`).
- FileTree formalization in `FileExplorer`: explicit refresh control and current-cwd display in the header (badges, expand/collapse, selected state, and changed-directory highlighting already exist). All access stays on `/api/files` + allowed-roots.
- No new workspace route, no center-layout relayout, no changes to the Changes page's own behavior beyond consuming the shared renderer.

**Alternative considered:** an embedded multi-pane workspace view or a separate `/workspace` route (PiChamber-style). Rejected by the user decision on 2026-08-19: progressive integration matches the text's "left FileTree + workspace CodeView/DiffView" shape with minimal disruption.

### 5. Skill chips on the existing dormancy mechanism

A compact chip group on the composer surface (adjacent to `AiliPermChip` in the `aili-composer-chips` row): a collapsed `Skills N ▼` summary chip, removable chips for non-dormant skills, and an expanded popover grouping Active (non-dormant) and Available (dormant) skills.

- State comes from `GET /api/skills?cwd=` (the same data the slash palette uses) and toggles flow through the existing `PATCH /api/skills` dormancy path. No parallel store, no new persistence, no per-session layer (user decision 2026-08-19).
- Activating a skill from the panel may prefill the `skill:<name>` command in the composer as an ordinary convenience; invocation itself keeps the existing command semantics.
- The chip surface is owned by the composer area, not a permanent sidebar region.

### 6. Terminal: WebSocket + PTY, proposed stack pending separate dependency approval

Design-level proposal (every dependency addition requires its own exact approval before BUILD touches Phase 5):

- PTY: `node-pty`; transport: `ws` attached to the existing web server; front-end: `@xterm/xterm` with the fit addon. All MIT, standard for this role; `xterm` replaces hand-rolled ANSI handling for the terminal surface only (`lib/ansi.ts` keeps its existing consumers).
- Server-side terminal manager: spawns the user's default shell (`$SHELL`, fallback `bash`) with cwd = the session cwd validated against allowed-roots; bounded output buffer; kills the PTY on socket close, page unload signaling, and server shutdown; reconnect starts a clean session with no stale replay.
- UI: a terminal surface labeled "Terminal · User controlled" (i18n en/zh-CN), resizable, single instance first. It is not routed through agent tool authorization, permission modes, or the questionnaire invariants; conversely the agent bash tool never sends input to it.
- Security posture inherits the web boundary: loopback default, fail-closed non-loopback with the existing authentication/Origin/allowed-root checks applying to the WebSocket upgrade itself. The terminal must not expose any path outside allowed roots or any unauthenticated channel.
- This is the first duplex channel in an SSE-only app; the WebSocket surface is confined to the terminal feature.

**Alternative considered:** implement the terminal over SSE + POST chunks to avoid a WebSocket dependency. Rejected: half-duplex polling degrades interactive latency and still needs a new transport path; WebSocket is the honest fit.

### 7. Cross-cutting placement and i18n conventions

- Pure logic modules (FileChangeEvent derivation, InteractionHost mapping, terminal session bookkeeping) get unit tests under `tests/unit/` (existing convention: `tests/unit/questionnaire.test.ts`). Web component tests stay colocated as `.test.mjs` next to their components (existing convention: `ChatWindow.questionnaire.test.mjs` et al.). Browser-level verification artifacts go under `artifacts/test-results/browser/` per the project placement rules.
- All new user-facing strings land in both `en` and `zh-CN` i18n message catalogs in the same change slice, including the terminal label, chip labels, change-card operation labels, and shelf queue indicator.

## Risks and mitigations

- **Shelf regression on blocking flows:** the modal path stays as fallback and the permission/confirm/questionnaire flows get component tests before migration; runtime plumbing is not edited.
- **Diff consolidation regression across three surfaces:** characterization tests on the current renderers' outputs (row semantics, caps, split/unified parity) are written before the migration, and the old paths are deleted only after all consumers switch.
- **Write-tool diff enrichment adds git calls:** lazy, per-file, only when a write card is expanded or counted, and only inside git worktrees; failures degrade to additions-only cards.
- **`node-pty` native build on WSL2:** prebuilds normally cover it; verified during Phase 5 with a disposable install before any lockfile change is requested.
- **Phase 5 gating:** the terminal cannot start until its dependency approvals exist; Phases 1–4 remain independently deliverable by contract.
