# Acceptance Test Plan: Rem Cyberdeck Theme

## Document Status

- **State:** `ACCEPTED` on 2026-07-23. The user accepted direct MIT reuse of the exact Sakura source revision and selected four Package Extensions (AILI plus header, matrix, Zentui). The same-day UI correction and explicit `0.1.5` release approval confirm the Sakura Matrix palette exception and display-only quota label mapping.
- **Scope:** Rem Theme, header, working surface, footer, editor chrome, and fixed-bottom editor on Linux official Pi.
- **Boundary:** This plan does not authorize implementation, dependencies, external writes, Git operations, or release.

## Traceability Matrix

| ID | Requirement / risk | Verify | Expected evidence | Status |
|---|---|---|---|---|
| THEME-1 | Complete Theme resource | schema/discovery test | all required tokens; one declared theme | passed |
| HEAD-1 | User Rem art and narrow width | render-width unit tests + TUI check | no line exceeds terminal width; Unicode remains usable | unverified — automated width coverage passed; interactive visual check remains |
| WORK-1 | Bounded working animation with Sakura Matrix visuals | lifecycle/fake-timer test + source/palette inspection | exact pinned Sakura dark trail/pastel RGB values; starts/stops on agent lifecycle; no timer survives shutdown | passed |
| FOOT-1 | Footer sources/fallbacks | unit/integration fixtures | cwd/Git/context/token/local-time and existing permission/network status observed; OS/runtime values omitted | passed |
| FOOT-2 | Quota boundary | source/integration inspection | `pi-quota-status` status reused; no new request/persistence code | passed |
| FOOT-3 | Quota display labels | focused unit fixtures | leading `5h` becomes `codex`, `Wk` becomes `7d`; percentage/reset text is byte-for-byte preserved | passed |
| EDIT-1 | Editor composition | editor factory fixture | keybindings/autocomplete/base editor remain functional | passed |
| FIXED-1 | Compatible fixed editor | private-TUI fixture + manual Linux TUI | pinned bottom cluster and scrollable transcript | unverified — fixture passed; interactive visual check remains |
| FIXED-2 | Incompatible layout fail-safe | malformed/non-writable TUI fixtures | no patch; native editor continues; visible downgrade | passed |
| FIXED-3 | Terminal recovery | disable/shutdown/exit tests | descriptors, scroll region, mouse, alt screen, cursor restored | passed |
| FIXED-4 | Mouse/select risk | manual Linux terminal matrix | warning documented; selection path tested only when enabled | unverified — documented; interactive matrix remains |
| PKG-1 | Exact MIT source reuse/provenance | source inventory, license/notice/SBOM validation, package dry-run | all copied files bind to `165a1f8011a12a58a6409b56b8a6c0416cd9b589`; licenses/notices and Rem diffs recorded | passed |

## Manual Linux Matrix

1. truecolor, supported font, normal terminal: theme/header/footer/fixed editor on/off.
2. narrow terminal: artwork clipping, two-line footer wrapping, and input usability.
3. tmux/terminal scrollback and text selection with fixed editor on and off.
4. no Git repository, no quota, no active model: neutral fallback values with no fabricated status.
5. Pi internal compatibility rejection: native editor remains usable and diagnostic is visible.

## Planned Commands

```bash
npm run typecheck
npm test
npm run validate:package
npm run validate:provenance
npm pack --dry-run --json
openspec validate add-rem-cyberdeck-theme --strict
```

## Fresh SHIP Evidence — 2026-07-23

- `npm run typecheck`: passed.
- `npm test`: 18 files passed, 2 skipped; 70 tests passed, 3 skipped.
- Focused quota test: 2 tests passed.
- Package/generated/skills/roles/capability/compatibility/provenance/stable-release validators: passed after refreshing the approved `package-lock.json` evidence hash for `0.1.5`.
- Native Linux local Package E2E: passed.
- `npm pack --dry-run --json` and `npm publish --dry-run --access public --json`: `@rosetears/aili-pi@0.1.5`, 6,152 intended files, no `.pi/`, `graphify-out/`, OpenSpec, tests, `.tmp/`, artifacts, or environment files.
- Registry/local installation: npm `latest=0.1.5` with release `gitHead=407b17384787a7068e502a219d50e78f3b50feb8`; `pi list` and installed package metadata report `0.1.5`; installed target-file hashes match the release worktree.
- Strict OpenSpec validation: this change and `create-aili-pi-distribution` passed.
- Interactive Matrix/footer/fixed-editor visual matrix: unverified; it requires restarting Pi after the approved global package update and does not authorize a real provider call.

## Exit Criteria

All required rows pass with fresh evidence; fixed-editor incompatibility is explicitly downgraded rather than hidden; every copied file has exact MIT provenance/notice coverage; no manual terminal failure is waived without explicit user acceptance.

## Acceptance Record

[已知|用户] The user accepted the prior independent-implementation plan on 2026-07-23. [已知|user] The user then accepted direct copy of `pi-sakura-cyberdeck@165a1f8011a12a58a6409b56b8a6c0416cd9b589`, selected four Package Extensions (option 1), and later required the exact Sakura Matrix palette plus the `codex`/`7d` display-only quota labels. On 2026-07-23 the user explicitly approved the resulting `0.1.5` release package, including the package/lockfile bump, task-scoped commit, push to `origin/main`, tag, npm publication, and local Pi installation.
