# Test plan — TUI interaction and WSL2 image paste

## Acceptance state

[FRAME] This is the final DEFINE verification contract. BUILD remains blocked until the user explicitly accepts this file and later supplies fresh BUILD intent. Acceptance alone executes and authorizes no implementation. Any later BUILD authorization is limited to repository-local implementation and disposable fixtures; real HOME/clipboard/terminal/provider, dependency/lockfile, Git, install, publish, and release operations remain separately gated.

## Automated matrix

| ID | Claim | Fresh evidence required |
|---|---|---|
| SCR-1 | Scrollbar appears only on transcript overflow and maps top/middle/bottom viewport starts to a proportional thumb. | Deterministic compositor render tests. |
| SCR-2 | Original Pi root render still receives full terminal width; every overlaid row remains exact visible width. | Render-spy and ANSI visible-width assertions. |
| SCR-3 | Disabled, no-overflow, width<2, or viewport<2 produces no scrollbar; scrollbar press starts no text selection. | Boundary table tests. |
| SEL-1 | Selection coordinates remain absolute while drag+wheel crosses multiple viewports. | Mouse/compositor integration fixture over full `rootLines`. |
| SEL-2 | Top/bottom edge drag runs one 70 ms timer, extends one row per tick, stops at bounds/leave/release, and never survives dispose/rollback/shutdown. | Vitest fake-timer state-machine tests. |
| SEL-3 | A drag crossing into editor/footer clamps and releases; a press beginning there does not select transcript text. | Pinned-cluster mouse-event tests. |
| SEL-4 | One release extracts the complete cross-viewport range, invokes clipboard/copy notice at most once, and clears state; empty selections do not copy. | Injected clipboard/copy callback assertions plus selection extraction regression. |
| MAT-1 | v2/legacy config migrates to v3 with `rainEnabled=true`; valid values remain, unsafe files are not overwritten. | Matrix config migration/corruption/symlink tests. |
| MAT-2 | Rain on returns exactly five width-safe lines; Rain off returns exactly one Shimmer line; both use one scheduler. | Renderer and lifecycle timer tests. |
| MAT-3 | `rain on|off` changes only Rain preference; master `off/on` retains that preference; status/help are accurate. | Command/config byte or semantic assertions. |
| WSL-1 | WSL absent/valid/explicit/malformed/symlink/non-regular/write-failure cases follow the exact no-op/preserve/fail-closed matrix. | Dedicated merger tests with disposable HOME and injected WSL signals. |
| WSL-2 | Bootstrap validates before install and applies after install without touching project settings or real HOME. | Bootstrap ordering/log fixture and disposable target bytes. |
| WSL-3 | AILI forwards Pi's image-paste action and adds no clipboard-image implementation or dependency. | Source/package contract assertions and existing wrapped-editor seam test. |
| REG-1 | Fixed-editor transactional restoration, Matrix geometry/appearance, package surface, and existing bootstrap preservation remain passing. | Focused regression suites followed by full `npm test`, typecheck, and package validation. |
| PKG-1 | No dependency/lockfile or forbidden task-local artifact enters the package; user docs and runtime scripts are included. | `npm pack --dry-run --json`, package tests, scoped diff inspection. |
| SPEC-1 | This change and the modified Rose contract validate strictly with no unresolved contract collision. | Current strict OpenSpec validation. |

## Manual WSL2 terminal matrix

[FRAME] These rows require a restarted real Pi session under WSL2 and are not satisfied by headless/unit tests.

| ID | Procedure | Pass condition |
|---|---|---|
| LIVE-TUI-1 | Produce transcript overflow and wheel/PageUp/PageDown through top, middle, bottom. | Right scrollbar is visible only on overflow and thumb tracks the viewport without corrupting line width. |
| LIVE-TUI-2 | Drag-select into top/bottom edges and use wheel while holding selection, then release over transcript and editor/footer. | View auto-scrolls, selection remains continuous, release never sticks, and clipboard receives the full range once. |
| LIVE-MAT-1 | Run `rain off`, `status`, whole `off/on`, then `rain on` during active work. | Shimmer-only and five-line modes switch correctly with no duplicate timer/flicker and retained preference. |
| LIVE-WSL-1 | Put a Windows screenshot in clipboard and press Alt+V. | Pi attaches the image through its existing paste path. |
| LIVE-WSL-2 | Drag an image file into the same editor. | Existing drag-in behavior remains usable. |
| LIVE-RESTORE-1 | Disable/re-enable fixed editor and exit/reload while scrolled or selecting. | Alternate screen, mouse reporting, cursor, terminal rows, timers, and native behavior restore cleanly. |

## Stop and failure rules

[FRAME] Any scrollbar width corruption, stuck drag/timer, duplicate copy, broken editor input, lost explicit keybinding, real-HOME access in automation, duplicate clipboard implementation, Matrix timer duplication, unsafe config overwrite, dependency/lockfile drift, or strict-spec conflict is blocking. One focused repair/recheck is allowed during BUILD; unresolved failure returns control without claiming completion.

## Final acceptance gate

- [x] User explicitly accepted this final `test-plan.md` on 2026-07-29; acceptance alone starts no implementation.
- [ ] A later fresh BUILD request authorizes repository-local implementation and disposable fixtures only.
- [ ] Real HOME/clipboard/manual WSL2 terminal operations remain separately authorized when requested.
- [ ] Dependency/lockfile, Git, install, publish, and release remain separately authorized.

Current BUILD readiness: `READY FOR FRESH BUILD INTENT — no implementation is authorized by acceptance alone`.
