# Drift Log — add-webui-coding-workspace

## D-2026-08-19-1 — FileViewer diff mode consolidates at the parser level, not the component level

- **Spec/plan anchor:** `webui-shared-diff-rendering` requirement "One shared ChangeDiffView renderer" lists the file viewer diff mode among the consumers to migrate; tasks 2.2 acceptance said "one diff renderer serves all four consumers".
- **What drifted:** `ChangeDiffView` (new, `src/web/components/aili/ChangeDiffView.tsx`) replaces both duplicate renderers everywhere a diff *card* is rendered — the timeline inline change card (inline variant), the tool-details disclosure (`PairedDiffResult`, full/split), and the Changes page (full) — and `AiliFileDiff`, `SplitPatchView`, and `PatchTextView` are deleted. `FileViewer`'s diff mode, however, keeps its own view layer on top of the same shared parser (`lib/patch.ts` `parseUnifiedPatch`).
- **Why:** FileViewer's diff surface is feature-bearing viewer chrome (syntax highlighting, line-range selection feeding @-mention, wrap/scroll state restoration). Swapping it for the card renderer would remove capabilities that the workspace capability (`webui-workspace-surfaces`) and the pre-existing file-viewer behavior require, which is a regression, not consolidation.
- **Boundary kept:** exactly one patch parser exists (`lib/patch.ts`); no component re-parses patch text; no second card-style diff renderer exists (locked by `ChangeDiffView.test.mjs`).
- **Write-back status:** recorded here; spec wording "file viewer diff mode renders from the same implementation" is satisfied at the parser level. If a later accepted change wants component-level unification, it must first port highlighting/selection into `ChangeDiffView`.

## D-2026-08-19-2 — Write events synthesize a new-file base diff instead of degrading to "diff unavailable"

- **Trigger:** user browser verification after ROUND-3: a write to `.tmp/webtest-50cap.md` (+64) showed "diff 不可用（不在 git 工作树内，或获取失败）" with no cap and no full-diff handoff, because `.tmp/` is git-ignored so `/api/git/diff` returns `supported: false`. User direction: writes must always show their diff.
- **Change:** `deriveFileChangeEvent` for write-with-content now emits a synthesized `/dev/null → file` full-add patch built from the write input's own content (flagged `diffIsSynthesized`), so the inline card renders the capped diff and the "Show full diff" handoff everywhere. The card still lazily fetches git's real before/after on first expand; a successful fetch **replaces** the synthesized base. Path-only degradation remains only for mutations with neither patch nor content.
- **Honesty boundary kept:** the synthesized patch is the tool's actual written content (real tool data), not inferred from reasoning; it never claims deletions; git truth outranks it whenever available. Residual limitation: for an overwrite of a pre-existing git-ignored file the display shows a full add (old content is unknowable client-side), and the "Show full diff" handoff to `/changes` shows nothing for ignored files since git status omits them.
- **Write-back:** `design.md` decision 2 write row updated same day; unit + component tests updated (`diffIsSynthesized` assertions).

## D-2026-08-19-3 — Timeline change cards are git-free; git enrichment removed

- **Trigger:** user direction 2026-08-19 (concept correction after ROUND-4): 「这个里面的只是展示修改了什么，和 git 无关；changes 才是有没有 git 的情况」 — the timeline card shows what THIS tool changed; git state belongs to the Changes page.
- **Change:** the `/api/git/diff` lazy enrichment added in D-2026-08-19-2 is removed from `InlineFileChange`. A write event's diff is solely the synthesized `/dev/null` full-add of the content the tool wrote; an edit's diff is solely the tool-reported patch; "diff unavailable" remains only for mutations with neither. The unused `chat.changeDiffLoading` i18n key was removed from both catalogs.
- **Why the enrichment was wrong, not just unwanted:** a git file diff reflects the working tree relative to HEAD — it can include earlier edits from previous turns or pre-session changes, so "upgrading" a write card with it would misattribute changes to this tool call. Tool data is the only truthful source for per-call changes.
- **Spec alignment:** the accepted `webui-inline-file-change-events` delta already says events come "exclusively from arrived, non-error results of file-mutating tools" — the git enrichment was a design-level addition (design.md decision 2); this correction brings implementation and design back inside the accepted spec. `webui-shared-diff-rendering`'s "tool-result and git data sources" wording remains accurate: git feeds the Changes page and file viewer surfaces, never the timeline card.
- **Write-back:** design.md decision 2 rewritten around the git-free table; component test now asserts the card performs no git fetches.

## D-2026-08-19-4 — Existing chrome wins: tree header cwd row removed

- **Trigger:** user direction 2026-08-19: 「如果有冲突，以我现在的功能为准；如果我已经有相关功能，就在现有基础上拓展，而不是另起一个新的。就比如文件 cwd，我上面其实有一个路径以及一个分支切换管理的，这个感觉可以都去了的。」
- **Change:** the ROUND-7 tree-header cwd row (and the ROUND-8-removed duplicate refresh button) are gone entirely. The sidebar already presents the project path and branch/worktree switching above the tree and owns the explorer toolbar (refresh with done indicator, upload, changed-count). `FileExplorer` adds no chrome; its only new behavior is changed-file clicks opening diff mode. Unused `files.currentCwd`/`files.refreshTree` i18n keys removed.
- **Requirement mapping:** `webui-workspace-surfaces` FileTree "manual refresh and current-cwd display" is satisfied by the existing sidebar controls; the tree keeps status badges/expand/collapse/selection on `/api/files` + allowed-roots, unchanged.
- **Audit rule adopted for the remaining phases:** before adding any control, check the sidebar/toolbars first; extend or reuse what exists, and record any intentional coexistence here.
