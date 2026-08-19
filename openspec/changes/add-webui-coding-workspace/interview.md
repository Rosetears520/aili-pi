# Requirements Interview

- Change: `add-webui-coding-workspace`
- Mode: Interactive (decision-shaped rounds held while opening the change on 2026-08-19)
- Requirements-grilling state: `READY`
- Implementation authorization: absent (BUILD additionally requires final `test-plan.md` acceptance and is sequenced after `integrate-pi-web-ui-and-upstream-extensions` closes)

## Decision log

### D-01 — Change split across the five requested phases

- Decision impact: change identity, contract size, task ordering, and whether Terminal shares one acceptance contract with the interaction/workspace work.
- Evidence: the user's pasted requirements text defines five ordered phases and explicitly asks that Terminal not delay earlier phases; the repository convention is umbrella changes with phase-ordered tasks.
- Options presented:
  1. One change covering all five phases, tasks ordered Phase 1–5, Terminal last.
  2. Two changes, Terminal split out for its security surface.
  3. One change per phase.
- User answer: `单个变更覆盖全部（推荐）`
- Classification: confirmed.
- Decision state: `accepted`
- Recorded direction: one change, `add-webui-coding-workspace`, covering all five phases with Terminal as the final gated phase.
- Write-back targets: `proposal.md`, `tasks.md`, capability deltas.

### D-02 — Sequencing against the in-flight change

- Decision impact: BUILD ordering, working-tree conflict risk on ChatWindow/changes-page/questionnaire surfaces currently modified by `integrate-pi-web-ui-and-upstream-extensions`.
- Evidence: that change is mid-BUILD (ROUND-27 on 2026-08-19) with uncommitted working-tree modifications overlapping this change's target files.
- Options presented:
  1. This change's BUILD starts only after the prior change closes out.
  2. Parallel BUILD with execution-time coordination.
- User answer: `新变更排在其后（推荐）`
- Classification: confirmed.
- Decision state: `accepted`
- Recorded direction: task 0.1 gates all BUILD work on the prior change's closeout.
- Write-back targets: `tasks.md` section 0, `context.md` sequencing note.

### D-03 — Change identity

- Decision impact: directory name and all artifact references.
- Options presented: `add-webui-coding-workspace`, `evolve-webui-into-coding-workspace`, `absorb-pichamber-workspace-ux`.
- User answer: `add-webui-coding-workspace（推荐）`
- Classification: confirmed.
- Decision state: `accepted`
- Recorded direction: change id `add-webui-coding-workspace`.
- Write-back targets: change directory and every artifact header.

### D-04 — Meaning and scope of "Permission request" in the shelf

- Decision impact: whether this change adds a per-tool approval runtime or only re-presents existing approval asks.
- Evidence:
  - The user's source text lists Permission request in the shelf's first batch and separately states "保留现有 runtime 的阻塞/Promise/request-response 行为，只修改 presentation".
  - Code check 2026-08-19: web interactive sessions have no per-tool approval runtime; permission-mode asks (Allow once / Allow for session / Allow forever / Deny) are raised through `ctx.ui.select` by `src/vendor/pi-permission-modes/` and render today as centered `ExtensionDialog` modals. `requestApproval` exists only for headless persistent agents and is not wired to the web.
- Clarification exchange: the agent asked whether to add per-tool approval wiring; the user replied `这个应该说的是yolo那个四个模式的是否同意的按钮？我现在没有吗`; the agent confirmed those consent buttons exist today as modals and that moving them into the shelf is presentation-only, consistent with the source text's own principle.
- Classification: confirmed (grounded in the source text's explicit presentation-only directive plus the code evidence; the clarification resolved the factual question, not a scope preference).
- Decision state: `accepted`
- Recorded direction: the shelf re-presents the existing permission-mode approval asks; no per-tool approval runtime, no permission-mode semantic changes; recorded as a non-goal.
- Write-back targets: `webui-interaction-shelf` delta, `design.md` decision 1, `proposal.md` non-goals.

### D-05 — Skill chip activation model

- Decision impact: Phase 4 data model, whether a new per-session state layer exists.
- Evidence: the only activation mechanism today is the per-cwd `disable-model-invocation` frontmatter toggled by `PATCH /api/skills`; no per-session skill state exists; the source text requires the existing registry as sole source.
- Options presented:
  1. Reuse existing dormancy (Active = non-dormant; cwd-wide effect).
  2. New per-session enabled-skills state with an injection path.
- User answer: `复用现有 dormancy（推荐）`
- Classification: confirmed.
- Decision state: `accepted`
- Recorded direction: chips read `GET /api/skills?cwd=` and toggle through the existing PATCH path; no parallel store; cwd-wide activation semantics accepted.
- Write-back targets: `webui-skill-chips` delta, `design.md` decision 5, tasks 4.1–4.3.

### D-06 — Workspace composition shape

- Decision impact: Phase 3 layout architecture, navigation wiring, and relayout risk.
- Evidence: FileExplorer (sidebar tree, git badges), FileViewer (preview pane with tabs), and the `/changes` tab already occupy sensible placements matching the source text's "left FileTree + workspace CodeView/DiffView" shape.
- Options presented:
  1. Progressive integration: keep placements, wire navigation, close CodeView gaps.
  2. Embedded multi-pane workspace view (PiChamber-style center layout).
  3. Separate `/workspace` route.
- User answer: `渐进整合（推荐）`
- Classification: confirmed.
- Decision state: `accepted`
- Recorded direction: no relayout; navigation wiring via `openFileTab` mode hints; `/changes` remains the full-diff target; CodeView gains copy and go-to-line.
- Write-back targets: `webui-workspace-surfaces` delta, `design.md` decision 4, tasks 3.1–3.3.

## Resolved from evidence (no user question needed)

- Host Pi toolset is `bash`/`edit`/`find`/`grep`/`ls`/`read`/`write`; there is no `apply_patch`. `edit` results carry real `details.patch`/`details.diff`; `write` results carry no details. This fixes the FileChangeEvent derivation table in `design.md` decision 2 without a user decision (facts discovered from the installed host Pi).
- The two duplicate diff renderers (`AiliFileDiff` vs `lib/patch.ts`/`SplitPatchView`) and the questionnaire shelf precedent are repository facts recorded in `design.md` context.

## Remaining non-blocking items

- Terminal dependency set (`node-pty`, `ws`, `@xterm/xterm` + fit addon) is a `direction-recorded` design proposal; each dependency addition has its own exact-approval gate at BUILD (task 5.1) and the user may substitute packages at that point.
- The original screenshots cited by the user's source text are not in the repository; the ASCII mockups in that text remain the DEFINE-level visual contract (recorded in `context.md`).
