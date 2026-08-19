## Change Context

On 2026-08-19 the user provided a full requirements text for evolving the AILI-Pi Web UI from "chat page plus tool outputs" into one unified Coding Agent Workspace, using PiChamber as the primary interaction reference and pi-gui, OpenPi, and pi-diff as auxiliary references. This change was opened from that text. The pasted text (with its ASCII mockups for the collapsed inline change card, the shelf layout, the skill chip states, and the phase order) is the source requirement document for this contract; it is not itself a repository artifact.

## Change identity

- Change id: `add-webui-coding-workspace` (user-selected 2026-08-19).
- Schema: spec-driven; created 2026-08-19.
- Status: DEFINE artifact set complete — `proposal.md`, `design.md`, `tasks.md`, `interview.md` (requirements-grilling `READY`), `test-plan.md` (draft), six capability deltas under `specs/`, and this `context.md` exist. Final `test-plan.md` acceptance is the sole pre-BUILD user gate; BUILD additionally waits on the sequencing gate below.
- Sequencing: this change's BUILD starts only after `integrate-pi-web-ui-and-upstream-extensions` is closed out (user decision 2026-08-19), because both changes touch ChatWindow, the questionnaire shelf, and the Changes page. Satisfied 2026-08-19 via user-approved commit `7d6906e` plus user-asserted browser verification (see `tasks.md` 0.1 amendment).

## Maintained user intent

- One unified Coding Agent Workspace over the existing single AILI-Pi runtime: a composer-docked Interaction Shelf for all blocking human interaction, a FileTree/CodeView/DiffView workspace, structured default-collapsed file-change events in the reasoning timeline, and a user terminal delivered last.
- Change events must come exclusively from real successful tool results (edit/write/apply_patch and equivalents) with actual patch/diff data — never parsed or guessed from assistant reasoning.
- One shared diff renderer serves the inline timeline, file viewer, and Changes surfaces; inline is unified-only, full supports unified and split.
- The user terminal is the user's own shell ("User Terminal ≠ Agent bash tool") and must not inherit agent permission/sandbox semantics.
- Phase order: 1 Interaction Shelf (+ Questions inline, InteractionHost base), 2 shared ChangeDiffView + inline file changes, 3 FileTree + CodeView + full DiffView (Workspace), 4 Terminal (PTY + WebSocket). Phase 2 may land before the full workspace because it immediately improves daily coding experience.
- Reference projects are interaction/architecture references only: semantic absorption, no code copying, no Vue/Electron runtime, no dependencies added from them.

## Confirmed decisions

- 2026-08-19 (user): one change covers all five phases; Terminal is included as the final phase.
- 2026-08-19 (user): this change is sequenced after `integrate-pi-web-ui-and-upstream-extensions` closes; no parallel BUILD on the same surfaces.
- 2026-08-19 (user): change id `add-webui-coding-workspace`.
- 2026-08-19 (clarification resolved during proposal): "Permission request" in the shelf means the existing permission-mode approval asks (Allow once / Allow for session / Allow forever / Deny) raised through `ctx.ui.select` by `src/vendor/pi-permission-modes/` and currently rendered as centered modals by the web ExtensionDialog. Moving them into the shelf is presentation-only; this change adds no per-tool approval runtime and changes no permission-mode semantics.
- 2026-08-19 (user): workspace takes the progressive-integration shape — keep current placements (sidebar tree, viewer pane, `/changes` tab), wire navigation, close CodeView gaps; no relayout and no new workspace route.
- 2026-08-19 (user, BUILD-entry): final `test-plan.md` explicitly accepted; implementation authorized for the accepted tasks/specs. Task 0.1's sequencing gate was satisfied by user-approved commit `7d6906e` of the prior change's uncommitted BUILD work (18 files) plus the user's asserted browser verification, in place of a full SHIP closeout; the amendment is recorded in `tasks.md` 0.1.
- 2026-08-19 (user, Phase 3 audit): existing functionality wins over new equivalents — extend in place, never add duplicate chrome (tree-header cwd row removed accordingly; recorded as drift-log D-2026-08-19-4 and the standing audit rule for remaining phases).
- 2026-08-19 (user): the per-call change cards and the existing `TurnWrittenFiles` turn-end strip coexist deliberately — no consolidation.
- 2026-08-19 (evidence, no user question needed): host Pi toolset has no `apply_patch`; `edit` results carry `details.patch`/`details.diff` while `write` results carry no details — fixed as the FileChangeEvent derivation table in `design.md` decision 2.
- Artifact language: English per repo convention for openspec change artifacts (`test-plan.md` follows the repository's Chinese 最终测试计划 house format); user-facing UI strings continue through the existing en/zh-CN i18n keys.

## Current repository constraints

- `openspec/specs/` is an empty baseline, so every capability delta here is `ADDED`; there is no modified-capability authority to reconcile against.
- Existing surfaces to consolidate or extend (not duplicate), verified 2026-08-19: questionnaire shelf already docks above the composer (`ChatWindow.tsx` `.questionnaire-shelf`, `AiliQuestionnaire.tsx`, `src/questionnaire/controller.ts`); blocking extension-UI plumbing lives in `src/web/lib/types.ts`, `src/web/lib/rpc-manager.ts` (`requestExtensionUi`, `createExtensionUiContext`), and `src/web/hooks/useAgentSession.ts`; the method-to-surface mapping is a hard-coded switch plus ExtensionDialog modals.
- File/diff surfaces that exist: `FileExplorer.tsx` (sidebar tree with git badges, cwd-bound), `FileViewer.tsx` (read-only viewer with highlighting, line numbers, tabs; no copy button, no go-to-line), `app/changes/page.tsx` + `aili/AiliFileDiff.tsx` (one diff renderer) versus `lib/patch.ts` + `SplitPatchView` in `MessageView.tsx`/`FileViewer.tsx` (a second, independent renderer), and `TurnWrittenFiles.tsx` (static written-files strip without diffs or counts).
- Tool results conditionally carry `details.patch`/`details.diff` unified patch strings produced by pi; the web layer has patch parsing but no diff computation or FileChangeEvent model.
- Skills: `/api/skills` + `lib/skills-service.ts` + dormancy via `disable-model-invocation` frontmatter; the slash palette and `SkillsConfig.tsx` exist; there is no composer chip surface and no per-session activation state.
- Terminal: nothing exists — no PTY, no WebSocket server (transport is SSE-only today), no terminal front-end; reusable ANSI/key-handling primitives exist in `lib/ansi.ts`, `lib/terminal-input.ts`, `lib/custom-ui-terminal.ts`.
- New dependencies (Phase 5) require separate exact approval; no dependency/lockfile change is authorized by this proposal.
- Permission invariants carry over: permission modes gate tools; YOLO relaxes tool authorization but never user questions; no timeout auto-answers any user-facing question.

## Reference projects and absorption boundary

- PiChamber (`AMagicPear/pichamber`, MIT) — primary reference for composer-shelf interaction, workspace layout, and terminal presence. Its README notes its own UI references OpenChamber.
- pi-gui (`minghinmatthewlam/pi-gui`, MIT) — auxiliary reference for inline diff viewing and integrated terminal patterns.
- OpenPi (`heyhuynhgiabuu/openpi`, MIT) — auxiliary reference for workspace integration shape (source control, file tree, diff viewer, terminal).
- pi-diff (`buddingnewinsights/pi-diff`, MIT) — behavioral reference for syntax-highlighted unified/split diff rendering.
- Boundary: read for design insight only; no code copying, no dependency additions, no second runtime of any kind (filesystem, Git/change tracking, skill registry, permission, subagent, Agent).

## Open questions

1. ~~Skill chip activation model~~ — resolved 2026-08-19: reuse the existing per-cwd dormancy mechanism (user decision D-05 in `interview.md`).
2. ~~Workspace composition shape~~ — resolved 2026-08-19: progressive integration, no relayout (user decision D-06 in `interview.md`).
3. ~~FileChangeEvent derivation coverage~~ — resolved 2026-08-19 by host-Pi source evidence: no `apply_patch` exists; `edit` carries `details.patch`; `write` carries no details and uses input-line counts with lazy `/api/git/diff` enrichment in git worktrees; bash-driven mutations are never synthesized. See `design.md` decision 2.
4. **Terminal dependency selection:** design proposal is `node-pty` + `ws` + `@xterm/xterm` (fit addon) — each dependency addition keeps its own separate exact approval gate at BUILD (task 5.1); package substitution is allowed at approval time.
5. **Visual reference:** the user's original message cites screenshots that are not in this repository; the ASCII mockups in the pasted text are the accepted DEFINE-level visual contract for the collapsed change row, expansion behavior, and chip states. Original screenshots, if provided later, refine visuals during design/verification without reopening scope.

## Frozen upstream evidence

- None for this change. No upstream source is imported, locked, or snapshotted here; reference projects are design references only, and any future source import would require its own provenance and approval work under the existing conventions.
