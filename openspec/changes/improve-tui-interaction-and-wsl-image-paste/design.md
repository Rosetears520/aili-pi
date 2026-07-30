# Design: TUI interaction and WSL image paste

## 1. Fixed-editor scrollbar

[FRAME] Extend `FixedEditorConfig` and `CompositorConfig` with `scrollbar:boolean`, normalize missing values to `true`, preserve unknown config keys, and expose one `/zentui` setting row. The compositor records current visible columns and whether overflow made the scrollbar visible.

[FRAME] `renderScrollableRoot()` first performs current selection highlighting, then overlays one ANSI-safe track/thumb cell at terminal column `width`. Visibility requires `scrollbar=true`, `width>=2`, at least two viewport rows, and `rootLines.length>scrollableRows`. Thumb height is proportional to visible/total rows with minimum one; thumb position maps the absolute viewport start over `totalRows-viewportRows`. Every returned line remains exactly the requested visible width.

[FRAME] The overlay MUST NOT change the width passed to Pi's original renderer. When visible, selection columns are clamped before the scrollbar cell, and a left press in that cell starts no text selection.

## 2. Cross-viewport selection state machine

[FRAME] Keep `SelectionState` unchanged as the absolute selection store. Add compositor helpers for viewport start, row/column mapping, drag-aware scrolling, and timer lifecycle. The mapping clamps rows to `1..visibleScrollableRows`, maps through the prospective offset atomically, and clamps columns to transcript content width.

[FRAME] Ordinary wheel/PageUp/PageDown retains existing viewport behavior. An active drag changes wheel behavior: update offset, compute the prospective viewport start without waiting for render, and extend focus at the remembered pointer. Drag at row 1 starts older-history scrolling; drag at or below the final transcript row starts newer-history scrolling. The 70 ms timer exists only while the pointer remains at an edge and the offset can still change.

[FRAME] Only `press` below the transcript is rejected. Active `drag` and `release` events crossing into the pinned cluster are clamped to the nearest transcript row, preventing a stuck `isDragging=true` state. Release stops the timer, extends the final point, marks dragging false, extracts once, clears state, requests render, and invokes the existing clipboard helper once when text is nonempty.

[FRAME] `dispose`, rollback, terminal restoration, session shutdown, and any keyboard path that clears selection also stop the timer and clear the remembered pointer. Timer tests use fake clocks and MUST prove no post-dispose render request.

## 3. Rose Shimmer/Rain control

[FRAME] Parse v2 or v3 config into canonical v3. Missing `rainEnabled` migrates to `true`; valid existing `enabled`, FPS, density, fixed height, and appearance remain unchanged. Atomic/symlink/corruption protections stay intact.

[FRAME] The widget cache key includes `rainEnabled`. Active render always produces Shimmer; Rain creation/rendering is conditional. Drops are not required while Rain is disabled. The one existing deadline scheduler remains authoritative in both one-line and five-line modes.

[FRAME] `/rose-matrix rain on|off` atomically updates only `rainEnabled`, invalidates render/drop cache, and requests render. `status`, command description, README, config tests, and lifecycle tests expose one-line versus five-line behavior. `/rose-matrix off` still restores Pi's native Working Line; `/rose-matrix on` restores the widget using the retained Rain preference.

## 4. WSL keybinding integration

[FRAME] Add a dependency-free Node script dedicated to `~/.pi/agent/keybindings.json`. `--check` validates only the WSL target before package installation; apply mode runs after official Pi/package installation. Non-WSL execution is a no-op.

[FRAME] The script obtains HOME from its process environment, detects WSL from the established environment/proc signals, uses `lstat`/regular-file checks, refuses symlinks and malformed/non-object JSON, and never replaces an existing `app.clipboard.pasteImage` action. If the action is absent, it writes a canonical object containing `app.clipboard.pasteImage: ["ctrl+v","alt+v"]` while preserving every unrelated parsed property. New writes use an exclusive same-directory temporary file, restrictive permissions, flush/close, and rename; failures leave the original target unchanged.

[FRAME] Bootstrap calls check before package mutation and apply after Pi is available. Tests inject a disposable HOME and deterministic WSL signals; no test invokes real PowerShell, reads a real clipboard, or mutates the user's actual HOME. README explains `Alt+V`, Pi's existing `wslpath`/PowerShell dependency, troubleshooting, and unchanged drag-in behavior.

## 5. Failure and compatibility behavior

[FRAME] Unsupported/private TUI capability still rejects fixed-editor installation transactionally and restores terminal modes. Scrollbar or selection helpers MUST NOT weaken that fail-closed path. Invalid user Matrix/Zentui/keybinding files are not overwritten. Missing WSL interop is reported through docs/manual evidence rather than hidden fallback code.

[FRAME] No package dependency, public Pi API, clipboard permission, or provider behavior changes. The package consumes Pi 0.82.1's existing image-paste callback and clipboard implementation.
