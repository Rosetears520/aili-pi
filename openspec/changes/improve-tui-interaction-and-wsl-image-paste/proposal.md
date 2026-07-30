## Why

[KNOWN|USER] The user requested one bounded TUI/WSL change covering four outcomes in this session: restore a visible right-side scroll indicator while fixed editor is active, allow selection to continue across transcript viewports, allow the four Code Rain rows to be disabled without hiding Rose Shimmer, and make WSL2 clipboard-image paste reachable through `Alt+V` while preserving file drag-in.

[COMPUTED] The current fixed editor enters an application-owned alternate-screen viewport, tracks transcript scroll through `TerminalSplitCompositor.scrollOffset`, and does not render a scrollbar. Wheel and PageUp/PageDown handling clear selection, drag does not move the viewport, events below the transcript are discarded, and release copies then clears the selection. `extensions/zentui/fixed-editor/compositor.ts`; `extensions/zentui/fixed-editor/selection.ts`.

[COMPUTED] The current Matrix config has one `enabled` flag and always returns one Shimmer row plus four Rain rows. The accepted `rose-working-animation` delta requires exactly five rows whenever enabled. `extensions/matrix/index.ts:39-68,432-491`; `openspec/changes/migrate-rem-cyberdeck-to-rose/specs/rose-working-animation/spec.md:3-15`.

[COMPUTED] Pi 0.82.1 already implements WSL clipboard-image reading through `wslpath` and `powershell.exe`, while its default WSL keymap follows the Linux `ctrl+v` branch. AILI currently forwards `onPasteImage` but has no WSL keybinding/bootstrap integration or user documentation. `node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js`; `node_modules/@earendil-works/pi-coding-agent/dist/utils/clipboard-image.js`; `extensions/zentui/ui.ts`; `scripts/bootstrap.sh`.

## What Changes

[FRAME] The accepted change SHALL:

- add a default-enabled, overflow-only application scrollbar that overlays the rightmost visible transcript cell without changing Pi's render width;
- keep selection coordinates absolute to the full transcript, extend an active drag while wheel/edge scrolling changes the viewport, clamp an existing drag across the pinned editor/footer boundary, and copy exactly once on release;
- add `rainEnabled` with `/rose-matrix rain on|off`, preserving `enabled` as the master switch and preserving Shimmer when Rain is off;
- add a WSL-only, fail-closed global-keybinding merger that adds `alt+v` beside `ctrl+v` only when the user has not explicitly configured `app.clipboard.pasteImage`;
- reuse Pi's public/current image-paste path rather than copying Pi clipboard-image implementation.

## Capabilities

### New Capabilities

- `zentui-fixed-editor-interaction`: application-owned scrollbar, cross-viewport selection, bounded edge auto-scroll, exactly-once release copy, and restoration behavior.
- `wsl-image-paste`: WSL-only keybinding merge, preservation/fail-closed rules, Pi-owned clipboard-image reading, docs, and disposable-HOME verification.

### Modified Capabilities

- `rose-working-animation`: enabled runs may render Shimmer-only or Shimmer plus exactly four Code Rain rows, with one shared clock and a compatible v3 configuration.

## Boundaries

[FRAME] No dependency or lockfile change, Pi fork, `node_modules` edit, duplicate clipboard-image reader, native Windows support, Git operation, install, publish, release, or real user-HOME write is authorized by this DEFINE. Automated tests SHALL use repository-owned code and disposable HOME/terminal fixtures. A real `~/.pi/agent/keybindings.json` mutation, real clipboard/provider probe, install, Git, publish, or release requires its own exact approval.
