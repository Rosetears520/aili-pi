# Tasks: improve-tui-interaction-and-wsl-image-paste

## 1. Contract and BUILD gate

- [x] 1.1 Re-read proposal, context, design, all three capability deltas, tasks, and final `test-plan.md`; record explicit user acceptance before BUILD.
- [x] 1.2 Confirm exact current Pi 0.82.1 and repository locality for fixed-editor lifecycle, Matrix config/commands, wrapped image callback, bootstrap, and focused tests; stop for DEFINE if a public contract or verification strategy changes.

## 2. Fixed-editor scrollbar

- [x] 2.1 Add default-enabled `scrollbar` to Zentui/fixed-editor config normalization, patch saving, compositor config, installation wiring, and `/zentui` settings.
- [x] 2.2 Render an overflow-only proportional scrollbar over the rightmost visible transcript cell without reducing Pi render width; exclude the scrollbar cell from text selection.
- [x] 2.3 Add focused config/render tests for overflow, no-overflow, disabled, narrow/short viewport, top/middle/bottom thumb position, ANSI width, and unchanged original render width.

## 3. Cross-viewport selection

- [x] 3.1 Add prospective viewport mapping and drag-aware wheel scrolling while retaining absolute `SelectionState` coordinates.
- [x] 3.2 Add one bounded 70 ms edge auto-scroll timer, pinned-cluster clamping, and complete timer/pointer cleanup across release, keyboard clearing, rollback, restoration, dispose, and shutdown.
- [x] 3.3 Preserve exactly-once release copy and current extraction semantics; add focused mouse/parser/selection/fake-timer tests including no post-dispose render.

## 4. Independent Code Rain control

- [x] 4.1 Migrate Matrix config to v3 with `rainEnabled=true`, preserving v2/legacy/corrupt/symlink behavior and retaining `enabled` as the master switch.
- [x] 4.2 Render Shimmer-only or Shimmer-plus-four-Rain through the existing shared scheduler and cache lifecycle.
- [x] 4.3 Add `/rose-matrix rain on|off`, status/help/README coverage, and config/render/lifecycle tests for retained preference, exact one/five line output, one timer, and no stale drops.

## 5. WSL2 image-paste keybinding

- [x] 5.1 Add the dependency-free WSL keybinding check/apply script with no-op non-WSL behavior, explicit-action preservation, malformed/symlink/non-regular rejection, and atomic writes.
- [x] 5.2 Wire pre-install check and post-install apply into the thin bootstrap without changing project settings or invoking a duplicate clipboard implementation.
- [x] 5.3 Add disposable-HOME bootstrap/unit fixtures for absent, unrelated, explicit, malformed, symlinked, write-failure, and non-WSL targets; prove no real HOME/clipboard/PowerShell access.
- [x] 5.4 Document WSL2 Alt+V, Ctrl+V, Pi interop prerequisites, reload/restart, failure diagnosis, and unchanged image drag-in.

## 6. Verification and handoff

- [x] 6.1 Run focused Zentui compositor/selection/config, Matrix config/render/lifecycle, and bootstrap/keybinding tests, then `npm run typecheck`.
- [x] 6.2 Run full `npm test`, `npm run validate:package`, package dry-run, strict OpenSpec validation for affected changes, and scoped `git diff --check` if the focused evidence remains green.
- [x] 6.3 Inspect the scoped diff for dependency/lockfile, real HOME, `node_modules`, unrelated terminal behavior, generated/provenance, Git, install, publish, or release mutations.
- [x] 6.4 Run the manual WSL2 terminal matrix only after exact authorization; otherwise keep scrollbar/selection/Alt+V/drag-in live behavior `Unverified` and do not claim release readiness from automation alone. (No exact live-operation authorization was requested or used; all six rows remain `Unverified`.)
