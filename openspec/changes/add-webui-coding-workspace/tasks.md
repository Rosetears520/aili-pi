## 0. Preconditions and gates

- [x] 0.1 Confirm `integrate-pi-web-ui-and-upstream-extensions` has been closed out (SHIP complete, working tree clean of that change's uncommitted BUILD state) before any task below starts.
  - Amended 2026-08-19 by user decision: instead of a full SHIP closeout, the prior change's uncommitted BUILD work (ROUND-20 through ROUND-27, 18 files) was committed as `7d6906e` "feat: questionnaire interaction shelf, chat surface geometry, and changes-list resizer" under exact user approval, and the user asserted browser verification of those rounds. The gate is satisfied by "prior change's surfaces committed and user-verified".
  - Acceptance: this change's BUILD begins on a tree where the prior change's surfaces (ChatWindow shelf, Changes page, questionnaire) are settled.
  - Verify: `git status` clean or containing only this change's work; prior change's closeout artifact exists.
- [ ] 0.2 Record that Phases 1–4 add no dependency or lockfile change, and that every Phase 5 dependency addition (`node-pty`, `ws`, `@xterm/xterm` + fit addon, or their approved alternatives) requires separate exact approval bound to its task ID before execution.
  - Acceptance: no dependency mutation happens without its own recorded approval; no other gate is satisfied by these approvals.
  - Verify: progress ledger records each dependency operation's approval state and exact command when run.

## 1. Phase 1 — InteractionHost and the Interaction Shelf

- [x] 1.1 Build the InteractionHost presentation mapping as a pure module: one entry per blocking extension-UI method assigning `composer-shelf` (questionnaire, permission-approval selects, confirm, select, input, task/hub clarification) or an explicit exception (`editor`, `custom` → modal, with recorded reasons), plus a fallback mode.
  - Acceptance: every `ExtensionUiRequest` method has exactly one mapping entry; unknown methods resolve to a safe default instead of a crash.
  - Verify: unit tests under `tests/unit/` covering each method, unknown-method fallback, and mapping completeness.
- [x] 1.2 Generalize the questionnaire shelf in `ChatWindow.tsx` into a shelf host that renders the primary interaction card from the mapping, with a compact queue indicator for additional pending requests and the modal path retained as render-failure fallback.
  - Acceptance: at most one primary card; pending requests are visible/reachable; a shelf render error falls back without stranding the runtime promise; the transcript stays scrollable and copyable while the shelf is active.
  - Verify: colocated component tests (shelf mount, queue, fallback path) plus manual browser check.
- [x] 1.3 Route `useAgentSession.handleExtensionUiRequest` through the InteractionHost mapping instead of the hard-coded method switch, leaving `respondToExtensionUi`, timeouts, abort, and fallbacks untouched.
  - Acceptance: permission-approval asks, confirmations, selects, and inputs render in the shelf and resolve through the existing response channel; runtime request/response behavior is byte-compatible.
  - Verify: component tests for each migrated method's shelf rendering and response delivery; manual browser run of a permission ask and a confirm.
- [x] 1.4 Add shelf-queue and interaction labels to the en/zh-CN i18n catalogs.
  - Acceptance: no new user-facing string is hardcoded in components.
  - Verify: i18n key presence check in both catalogs.

## 2. Phase 2 — Shared ChangeDiffView and inline file-change events

- [x] 2.1 Write characterization tests for both existing diff paths (`AiliFileDiff` row model and `lib/patch.ts`/`SplitPatchView`): row semantics, unified/split parity, render caps, per-file counts.
  - Acceptance: current outputs are pinned before any consolidation edit.
  - Verify: the characterization suite passes against the unmodified renderers.
- [x] 2.2 Consolidate into one `ChangeDiffView` with `inline` and `full` variants over a single parser/row model, then migrate `MessageView` (tool-result diff), `FileViewer` diff mode, and the Changes page onto it, deleting the duplicate implementation.
  - Acceptance: one diff renderer serves all four consumers; inline is unified-only with a line/height cap and truncation indication; full keeps unified/split with the persisted `aili-diff-view` preference and today's render cap.
  - Verify: characterization tests pass against the consolidated renderer; colocated component tests for variants and caps; `build:web` clean.
- [x] 2.3 Implement the FileChangeEvent derivation module (pure): edit results from `details.patch`; write results with additions from input content and lazy `/api/git/diff` enrichment inside git worktrees; generic handling for any other non-error result carrying `details.patch`/`details.diff` with a resolvable path; no synthesis from bash output or reasoning; failed/cancelled calls produce nothing.
  - Acceptance: the derivation table in `design.md` is fully covered, including the additions-only degradation and the "diff unavailable" state.
  - Verify: unit tests under `tests/unit/` for every derivation row, dedupe, rename-schema passthrough, and negative cases.
- [x] 2.4 Render inline change cards in the timeline: default-collapsed row (operation icon/type, file icon, filename primary, parent path secondary, `+N −M`, chevron), expansion under a fixed header into the inline `ChangeDiffView` variant with a "Show full diff" handoff, tool-details JSON behind an explicit disclosure, and filename click opening the file tab.
  - Acceptance: cards satisfy every element of the collapsed-row contract; raw tool JSON is never the default presentation; long diffs are capped with the handoff control visible.
  - Verify: colocated component tests for row anatomy, collapse/expand, cap + handoff, disclosure, and filename navigation; manual browser verification on a real edit turn.
- [x] 2.5 Add operation labels and change-card strings to the en/zh-CN i18n catalogs.
  - Acceptance: same as 1.4.
  - Verify: i18n key presence check in both catalogs.

## 3. Phase 3 — Workspace wiring (progressive integration)

- [x] 3.1 Complete the CodeView surface in `FileViewer`: copy-to-clipboard action, go-to-line input with `#L`-style deep-link support, and an always-visible current file path.
  - Acceptance: the CodeView requirement's control set (highlighting, line numbers, horizontal scroll, copy, go-to-line, tabs, path) is fully present; no write path exists.
  - Verify: colocated component tests for copy, go-to-line, deep link, and path display.
- [x] 3.2 Wire cross-surface navigation through `openFileTab` mode hints: tree file → source tab, changed tree entry / Changes entry → diff-mode tab, inline-card "Show full diff" → the `/changes` open path, inline-card filename → source tab.
  - Acceptance: every navigation arrow in the workspace requirement works without losing chat context and restores tab state per the existing conventions.
  - Verify: colocated tests for each navigation arrow; manual browser pass across tree, viewer, changes page, and timeline.
- [x] 3.3 Formalize the FileTree surface in `FileExplorer`. Amended 2026-08-19 by user direction: the sidebar's existing path/branch display and explorer refresh/upload/changed-count toolbar are the canonical chrome — the tree adds no duplicate header; refresh and cwd requirements are satisfied by those existing controls (drift-log D-2026-08-19-4).
  - Acceptance: the tree satisfies the FileTree requirement entirely on the existing `/api/files` + allowed-roots path with no new filesystem runtime.
  - Verify: colocated component tests for refresh and cwd display; manual check that status badges refresh.

## 5. Terminal (gated on separate dependency approvals)

- [x] 5.1 Obtain and record separate exact approvals for the terminal dependency set (`node-pty`, `ws`, `@xterm/xterm` + fit addon, or approved alternatives) bound to this phase's tasks, including a disposable WSL2 installability probe for the PTY package before any lockfile change.
  - Acceptance: every dependency operation is exactly approved or not executed; the probe result is recorded.
  - Verify: progress ledger records approvals, probe output, and the exact install command when run.
- [x] 5.2 Implement the server terminal manager: WebSocket endpoint on the existing web server, PTY spawn of the user's shell with cwd = session cwd (allowed-roots validated), bounded output buffer, PTY kill on disconnect/unload/shutdown, clean reconnect with no stale replay.
  - Acceptance: no orphaned PTYs after close/drop/shutdown; reconnect starts clean; the upgrade itself is subject to the loopback/fail-closed posture.
  - Verify: integration test under `tests/integration/` spawning a real PTY on a disposable cwd and asserting cleanup; manual WSL2 browser session.
- [x] 5.3 Implement the terminal surface: `@xterm/xterm` component labeled "Terminal · User controlled" (en/zh-CN), resize handling, ANSI/Ctrl+C passthrough, single instance, no wiring into agent tool authorization or permission modes.
  - Acceptance: interactive shell works end to end; labeling and separation requirements hold.
  - Verify: colocated component tests for labeling and mount; manual browser verification including Ctrl+C and resize.
- [x] 5.4 Confirm the terminal inherits the access-security boundary: non-loopback startup without authentication leaves the terminal transport unavailable, and no path outside allowed roots is reachable.
  - Acceptance: the terminal is not an auth or path bypass.
  - Verify: security-focused integration test mirroring the existing fail-closed checks.

## 6. MCP management panel (final part — added by user direction 2026-08-19)

- [ ] 6.1 Add the MCP button to the bottom-left configuration toolbar (right of Skills) and the MCP panel shell in the existing config-panel pattern, fed by a bounded per-server status projection (name, status, tool/resource counts, disabled) derived from the adapter snapshot.
  - Acceptance: the button opens/closes the panel like the other config panels; every configured server is listed with truthful state; no configuration, args, env, or credentials are exposed; listing never connects a lazy/disconnected server.
  - Verify: colocated component tests for button placement, projection rendering, and redaction; manual browser check against a live adapter snapshot.
- [ ] 6.2 Wire per-server enable/disable through the adapter's configuration-layer persistence (same semantics as `/mcp enable|disable`), surfacing the adapter's honest effect timing (applies on reload/session restart) without auto-reload.
  - Acceptance: toggles persist through the adapter path only (no second config authority); enabling honors precedence (explicit false only when a lower layer is disabled); the UI states the timing honestly.
  - Verify: unit/integration test of the toggle payload against the adapter persistence path; manual toggle + reload round-trip.
- [ ] 6.3 Add MCP panel strings to the en/zh-CN i18n catalogs.
  - Acceptance: same as earlier phases.
  - Verify: i18n key presence check in both catalogs.

## 7. Convergence and final verification

- [ ] 7.1 Run the full accepted verification set for this change: root `npm run typecheck`, `npm test`, `npm run build:web`, the new unit/component/integration suites, and a manual browser pass over the five phases' acceptance flows (shelf interactions, inline change cards on a real edit turn, workspace navigation round-trip, skill chip round-trip, terminal lifecycle).
  - Acceptance: all green with no unexplained failures; known unrelated flakes recorded as such.
  - Verify: verification evidence recorded in the progress ledger with commands and outcomes.
- [ ] 7.2 Confirm contract-level non-goals still hold: no second runtime of any kind, no dependency beyond the approved terminal set, no permission semantic change, and Phases 1–4 deliverable independently of Phase 5.
  - Acceptance: negative assertions pass against the final tree.
  - Verify: targeted greps/inventory checks recorded in the ledger.
