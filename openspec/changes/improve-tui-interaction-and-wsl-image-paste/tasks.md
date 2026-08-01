# Tasks: improve-tui-interaction-and-wsl-image-paste

## 1. Contract and BUILD gate

- [ ] 1.1 Re-read proposal, context, design, all three capability deltas, tasks, and final `test-plan.md`; record durable explicit acceptance before BUILD.
- [ ] 1.2 Confirm exact current Pi 0.82.1 and repository locality for fixed-editor lifecycle, Matrix config/commands, wrapped image callback, bootstrap, and focused tests; stop for DEFINE if a public contract or verification strategy changes.

## 2. Fixed-editor scrollbar

- [ ] 2.1 Add default-enabled `scrollbar` to Zentui/fixed-editor config normalization, patch saving, compositor config, installation wiring, and `/zentui` settings.
- [ ] 2.2 Render an overflow-only proportional scrollbar over the rightmost visible transcript cell without reducing Pi render width; exclude the scrollbar cell from text selection.
- [ ] 2.3 Add focused config/render tests for overflow, no-overflow, disabled, narrow/short viewport, top/middle/bottom thumb position, ANSI width, and unchanged original render width.

## 3. Cross-viewport selection

- [ ] 3.1 Add prospective viewport mapping and drag-aware wheel scrolling while retaining absolute `SelectionState` coordinates.
- [ ] 3.2 Add one bounded 70 ms edge auto-scroll timer, pinned-cluster clamping, and complete timer/pointer cleanup across release, keyboard clearing, rollback, restoration, dispose, and shutdown.
- [ ] 3.3 Preserve exactly-once release copy and current extraction semantics; add focused mouse/parser/selection/fake-timer tests including no post-dispose render.

## 4. Independent Code Rain control

- [ ] 4.1 Migrate Matrix config to v3 with `rainEnabled=true`, preserving v2/legacy/corrupt/symlink behavior and retaining `enabled` as the master switch.
- [ ] 4.2 Render Shimmer-only or Shimmer-plus-four-Rain through the existing shared scheduler and cache lifecycle.
- [ ] 4.3 Add `/rose-matrix rain on|off`, status/help/README coverage, and config/render/lifecycle tests for retained preference, exact one/five line output, one timer, and no stale drops.

## 5. WSL2 image-paste keybinding

- [ ] 5.1 Add the dependency-free WSL keybinding check/apply script with no-op non-WSL behavior, explicit-action preservation, malformed/symlink/non-regular rejection, and atomic writes.
- [ ] 5.2 Wire pre-install check and post-install apply into the thin bootstrap without changing project settings or invoking a duplicate clipboard implementation.
- [ ] 5.3 Add disposable-HOME bootstrap/unit fixtures for absent, unrelated, explicit, malformed, symlinked, write-failure, and non-WSL targets; prove no real HOME/clipboard/PowerShell access.
- [ ] 5.4 Document WSL2 Alt+V, Ctrl+V, Pi interop prerequisites, reload/restart, failure diagnosis, and unchanged image drag-in.

## 6. Verification and handoff

- [ ] 6.1 Run focused Zentui compositor/selection/config, Matrix config/render/lifecycle, and bootstrap/keybinding tests, then `npm run typecheck`.
- [ ] 6.2 Run full `npm test`, `npm run validate:package`, package dry-run, strict OpenSpec validation for affected changes, and scoped `git diff --check` if the focused evidence remains green.
- [ ] 6.3 Inspect the scoped diff for dependency/lockfile, real HOME, `node_modules`, unrelated terminal behavior, generated/provenance, Git, install, publish, or release mutations.
- [ ] 6.4 Run the manual WSL2 terminal matrix only after exact authorization; until durable evidence is recorded, scrollbar/selection/Alt+V/drag-in live behavior remains unverified and automation alone does not establish release readiness.
