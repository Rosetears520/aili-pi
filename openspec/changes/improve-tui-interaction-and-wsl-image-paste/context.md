# Context: improve-tui-interaction-and-wsl-image-paste

## Proposed outcome

This independent proposal groups the scrollbar, cross-viewport selection, independent Rain control, and WSL2 image-paste path into one implementation scope. Its acceptance and implementation status must be established by durable change evidence outside this context note.

The proposed interaction model keeps fixed editor enabled, draws an application-owned scrollbar, scrolls while extending a drag, copies once on release, retains `/zentui fixed-editor disable` as the native-terminal escape hatch, keeps Shimmer when Rain is disabled, uses `Alt+V` on WSL2, and preserves drag-in.

## Repository evidence recorded for this proposal

At the cited source locations when this proposal was drafted, `TerminalSplitCompositor` owned `rootLines`, `scrollOffset`, `maxScrollOffset`, `visibleRootStart`, and `visibleScrollableRows`; `SelectionState` stored absolute `{line,col}` anchor/focus coordinates and extracted from full `rootLines`. The proposed gap is viewport/selection coordination and rendering, not a second transcript model. `extensions/zentui/fixed-editor/compositor.ts:115-159,391-569`; `extensions/zentui/fixed-editor/selection.ts:59-135`.

The cited fixed-editor configuration and `/zentui` command locations contained `enabled`, `mouseScroll`, and `copyNotice` when this proposal was drafted. These facts require revalidation before implementation. `extensions/zentui/config.ts:85-89,593-605,1008-1022`; `extensions/zentui/settings-command.ts:435-457,646-659,789-810`.

The test inventory recorded during drafting did not identify coverage for `TerminalSplitCompositor`, selection highlighting, mouse selection, autoscroll, scrollbar rendering, or clipboard failure. The cited Matrix renderer/config/lifecycle tests were recorded as covering deterministic four-row Rain, separate Shimmer rendering, exact five-line lifecycle, and v2 migration; the inventory and coverage claims require fresh verification. `tests/unit/matrix.test.ts`; `tests/unit/matrix-config.test.ts`; `tests/unit/matrix-lifecycle.test.ts`.

The source inspection recorded during drafting indicated that Pi's `CustomEditor` dispatches `app.clipboard.pasteImage`, Zentui forwards `onPasteImage`, `handleInput`, and editor insertion, and the inspected Pi 0.82.1 WSL image path tries WSL clipboard tools followed by `wslpath` and `powershell.exe`. The proposed AILI-owned gap is discoverable keybinding/bootstrap integration and documentation. The installed-runtime observations require revalidation against the implementation target before BUILD. `extensions/zentui/ui.ts`; Pi 0.82.1 `dist/modes/interactive/components/custom-editor.js`, `dist/utils/clipboard-image.js`, and `dist/core/keybindings.js`.

## Contract ownership

The cited closeout artifacts describe `add-rem-cyberdeck-theme` and `fix-quota-animation-subagent-label` as 0.1.5/0.1.6 closeouts and leave restarted interactive TUI behavior unverified. This proposal does not derive its acceptance or completion status from those artifacts. `openspec/changes/add-rem-cyberdeck-theme/ship-closeout.md`; `openspec/changes/fix-quota-animation-subagent-label/ship-closeout.md`.

The cited `migrate-rem-cyberdeck-to-rose` delta specifies the exact five-line Rose Widget and v2 command/config requirements. Rain-only disablement therefore requires an explicit modified delta rather than an edit to that separate change. `openspec/changes/migrate-rem-cyberdeck-to-rose/specs/rose-working-animation/spec.md:3-15,146-159`.

## Decisions

`fixedEditor.scrollbar` is a boolean defaulting to `true`; rendering remains overflow-only, so `true` means automatic visibility rather than an always-visible empty track. This is the smallest public setting that meets the requested behavior.

The scrollbar overlays the last visible cell after original rendering. Pi continues to render at the full terminal width; the implementation MUST NOT call the original renderer with `width - 1`. The scrollbar is visual-only in this change: click/drag paging is excluded.

An active text drag owns the viewport interaction. Wheel input moves by the existing three-line increment and extends focus against the new viewport. Edge drag uses one non-resident 70 ms timer and one-line steps. Starting a selection in the pinned cluster or scrollbar cell is rejected; an already-active drag is clamped to the first/last transcript row until release.

Release extends to the final clamped point, invokes the existing clipboard path at most once for nonempty text, preserves existing OSC-8/text extraction semantics, clears selection, and stops edge scrolling. Persistent post-copy highlighting and manual-copy mode are excluded.

`MatrixConfig.version` becomes `3` and adds `rainEnabled=true`. `enabled` remains the whole-widget master switch; `rainEnabled=false` yields exactly one Shimmer row and does not create a second timer. `/rose-matrix on` does not overwrite the stored Rain preference.

AILI does not implement image decoding or Windows clipboard access. A WSL-only merger adds `app.clipboard.pasteImage: ["ctrl+v","alt+v"]` only when that action is absent. Existing explicit actions remain byte-unchanged; malformed, symlinked, non-regular, or unsafe targets fail closed before package installation. Other valid keybindings are preserved semantically and writes are atomic.

## Exclusions and operation gates

Excluded: scrollbar mouse dragging, selection persistence after release, copy-history UI, terminal-independent image upload, non-WSL keymap mutation, Pi internal clipboard duplication, dependency/lockfile changes, and native Windows support.

Repository implementation may test against disposable HOME. Real user-HOME, clipboard, terminal, package install, Git, publish, and release operations remain separately gated and cannot inherit authorization from final test-plan acceptance.
