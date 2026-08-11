## Why

This independent proposal defines one bounded TUI/WSL change covering four outcomes: restore a visible right-side scroll indicator while fixed editor is active, allow selection to continue across transcript viewports, allow the four Code Rain rows to be disabled without hiding Rose Shimmer, and make WSL2 clipboard-image paste reachable through `Alt+V` while preserving file drag-in.

The source inspection recorded during drafting indicated that the fixed editor enters an application-owned alternate-screen viewport, tracks transcript scroll through `TerminalSplitCompositor.scrollOffset`, and does not render a scrollbar. It also indicated that wheel and PageUp/PageDown handling clear selection, drag does not move the viewport, events below the transcript are discarded, and release copies then clears the selection. These observations require revalidation before implementation. `extensions/zentui/fixed-editor/compositor.ts`; `extensions/zentui/fixed-editor/selection.ts`.

The cited Matrix source was recorded as having one `enabled` flag and returning one Shimmer row plus four Rain rows. The cited `rose-working-animation` delta specifies exactly five rows whenever enabled. Both observations require revalidation before implementation. `extensions/matrix/index.ts:39-68,432-491`; `openspec/changes/migrate-rem-cyberdeck-to-rose/specs/rose-working-animation/spec.md:3-15`.

Drafting-time inspection of Pi 0.82.1 indicated WSL clipboard-image reading through `wslpath` and `powershell.exe`, with the default WSL keymap following the Linux `ctrl+v` branch. The inspected AILI source forwarded `onPasteImage` but did not provide WSL keybinding/bootstrap integration or user documentation. Installed-runtime details are not durable completion evidence and require revalidation against the implementation target before BUILD. `node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js`; `node_modules/@earendil-works/pi-coding-agent/dist/utils/clipboard-image.js`; `extensions/zentui/ui.ts`; `scripts/bootstrap.sh`.

## What Changes

The proposed change SHALL:

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

No dependency or lockfile change, Pi fork, `node_modules` edit, duplicate clipboard-image reader, native Windows support, Git operation, install, publish, release, or real user-HOME write is authorized by this proposal. Automated tests SHALL use repository-owned code and disposable HOME/terminal fixtures. A real `~/.pi/agent/keybindings.json` mutation, real clipboard/provider probe, install, Git, publish, or release requires its own exact approval.
