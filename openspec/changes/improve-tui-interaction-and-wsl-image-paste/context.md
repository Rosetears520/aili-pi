# Context: improve-tui-interaction-and-wsl-image-paste

## Accepted user outcome

[KNOWN|USER] The user approved this exact change identity and asked that the scrollbar, cross-viewport selection, independent Rain control, and WSL2 image-paste path all be included in one implementation scope. Session decision: 2026-07-29, “新建独立提案（推荐）”.

[KNOWN|USER] The requested interaction model keeps fixed editor enabled, draws an application-owned scrollbar, scrolls while extending a drag, copies once on release, retains `/zentui fixed-editor disable` as the native-terminal escape hatch, keeps Shimmer when Rain is disabled, uses `Alt+V` on WSL2, and preserves drag-in.

## Current repository facts

[COMPUTED] `TerminalSplitCompositor` already owns `rootLines`, `scrollOffset`, `maxScrollOffset`, `visibleRootStart`, and `visibleScrollableRows`; `SelectionState` already stores absolute `{line,col}` anchor/focus coordinates and extracts from full `rootLines`. The missing behavior is viewport/selection coordination and rendering, not a second transcript model. `extensions/zentui/fixed-editor/compositor.ts:115-159,391-569`; `extensions/zentui/fixed-editor/selection.ts:59-135`.

[COMPUTED] Fixed-editor configuration currently contains `enabled`, `mouseScroll`, and `copyNotice`; `/zentui` exposes the same three controls. `extensions/zentui/config.ts:85-89,593-605,1008-1022`; `extensions/zentui/settings-command.ts:435-457,646-659,789-810`.

[COMPUTED] No current test owns `TerminalSplitCompositor`, selection highlighting, mouse selection, autoscroll, scrollbar rendering, or clipboard failure. Existing Matrix renderer/config/lifecycle tests cover deterministic four-row Rain, separate Shimmer rendering, exact five-line lifecycle, and v2 migration. `tests/unit/matrix.test.ts`; `tests/unit/matrix-config.test.ts`; `tests/unit/matrix-lifecycle.test.ts`.

[COMPUTED] Pi's `CustomEditor` dispatches `app.clipboard.pasteImage`; Zentui forwards `onPasteImage`, `handleInput`, and editor insertion. Pi's WSL image implementation tries WSL clipboard tools and then `wslpath` plus `powershell.exe`. The missing AILI-owned behavior is discoverable keybinding/bootstrap integration and documentation. `extensions/zentui/ui.ts`; installed Pi 0.82.1 `dist/modes/interactive/components/custom-editor.js`, `dist/utils/clipboard-image.js`, and `dist/core/keybindings.js`.

## Contract ownership

[COMPUTED] The released `add-rem-cyberdeck-theme` and `fix-quota-animation-subagent-label` changes are historical 0.1.5/0.1.6 closeouts with restarted interactive TUI still Unverified. `openspec/changes/add-rem-cyberdeck-theme/ship-closeout.md`; `openspec/changes/fix-quota-animation-subagent-label/ship-closeout.md`.

[COMPUTED] `migrate-rem-cyberdeck-to-rose` currently owns the exact five-line Rose Widget and v2 command/config requirements, so Rain-only disablement requires an explicit modified delta rather than editing a released historical task. `openspec/changes/migrate-rem-cyberdeck-to-rose/specs/rose-working-animation/spec.md:3-15,146-159`.

## Decisions

[FRAME] `fixedEditor.scrollbar` is a boolean defaulting to `true`; rendering remains overflow-only, so `true` means automatic visibility rather than an always-visible empty track. This is the smallest public setting that meets the requested behavior.

[FRAME] The scrollbar overlays the last visible cell after original rendering. Pi continues to render at the full terminal width; the implementation MUST NOT call the original renderer with `width - 1`. The scrollbar is visual-only in this change: click/drag paging is excluded.

[FRAME] An active text drag owns the viewport interaction. Wheel input moves by the existing three-line increment and extends focus against the new viewport. Edge drag uses one non-resident 70 ms timer and one-line steps. Starting a selection in the pinned cluster or scrollbar cell is rejected; an already-active drag is clamped to the first/last transcript row until release.

[FRAME] Release extends to the final clamped point, invokes the existing clipboard path at most once for nonempty text, preserves existing OSC-8/text extraction semantics, clears selection, and stops edge scrolling. Persistent post-copy highlighting and manual-copy mode are excluded.

[FRAME] `MatrixConfig.version` becomes `3` and adds `rainEnabled=true`. `enabled` remains the whole-widget master switch; `rainEnabled=false` yields exactly one Shimmer row and does not create a second timer. `/rose-matrix on` does not overwrite the stored Rain preference.

[FRAME] AILI does not implement image decoding or Windows clipboard access. A WSL-only merger adds `app.clipboard.pasteImage: ["ctrl+v","alt+v"]` only when that action is absent. Existing explicit actions remain byte-unchanged; malformed, symlinked, non-regular, or unsafe targets fail closed before package installation. Other valid keybindings are preserved semantically and writes are atomic.

## Exclusions and operation gates

[FRAME] Excluded: scrollbar mouse dragging, selection persistence after release, copy-history UI, terminal-independent image upload, non-WSL keymap mutation, Pi internal clipboard duplication, dependency/lockfile changes, and native Windows support.

[FRAME] Repository implementation may test against disposable HOME. Real user-HOME, clipboard, terminal, package install, Git, publish, and release operations remain separately gated and cannot inherit authorization from final test-plan acceptance.
