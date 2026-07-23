# Acceptance Test Plan: Rem Cyberdeck Theme

## Document Status

- **State:** `ACCEPTED` on 2026-07-23. The user accepted direct MIT reuse of the exact Sakura source revision and selected four Package Extensions (AILI plus header, matrix, Zentui).
- **Scope:** Rem Theme, header, working surface, footer, editor chrome, and fixed-bottom editor on Linux official Pi.
- **Boundary:** This plan does not authorize implementation, dependencies, external writes, Git operations, or release.

## Traceability Matrix

| ID | Requirement / risk | Verify | Expected evidence | Status |
|---|---|---|---|---|
| THEME-1 | Complete Theme resource | schema/discovery test | all required tokens; one declared theme | planned |
| HEAD-1 | User Rem art and narrow width | render-width unit tests + TUI check | no line exceeds terminal width; Unicode remains usable | planned |
| WORK-1 | Bounded working animation | lifecycle/fake-timer test | starts/stops on agent lifecycle; no timer survives shutdown | planned |
| FOOT-1 | Footer sources/fallbacks | unit/integration fixtures | cwd/Git/context/token/local-time and existing permission/network status observed; OS/runtime values omitted | planned |
| FOOT-2 | Quota boundary | source/integration inspection | `pi-quota-status` status reused; no new request/persistence code | planned |
| EDIT-1 | Editor composition | editor factory fixture | keybindings/autocomplete/base editor remain functional | planned |
| FIXED-1 | Compatible fixed editor | private-TUI fixture + manual Linux TUI | pinned bottom cluster and scrollable transcript | planned |
| FIXED-2 | Incompatible layout fail-safe | malformed/non-writable TUI fixtures | no patch; native editor continues; visible downgrade | planned |
| FIXED-3 | Terminal recovery | disable/shutdown/exit tests | descriptors, scroll region, mouse, alt screen, cursor restored | planned |
| FIXED-4 | Mouse/select risk | manual Linux terminal matrix | warning documented; selection path tested only when enabled | planned |
| PKG-1 | Exact MIT source reuse/provenance | source inventory, license/notice/SBOM validation, package dry-run | all copied files bind to `165a1f8011a12a58a6409b56b8a6c0416cd9b589`; licenses/notices and Rem diffs recorded | planned |

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

## Exit Criteria

All required rows pass with fresh evidence; fixed-editor incompatibility is explicitly downgraded rather than hidden; every copied file has exact MIT provenance/notice coverage; no manual terminal failure is waived without explicit user acceptance.

## Acceptance Record

[已知|用户] The user accepted the prior independent-implementation plan on 2026-07-23. [已知|user] The user then accepted direct copy of `pi-sakura-cyberdeck@165a1f8011a12a58a6409b56b8a6c0416cd9b589`, except the Rem asset and palette, and selected four Package Extensions (option 1). This acceptance authorizes only repository-local BUILD; dependency/lockfile, external writes, Git operations, publication, and release remain separately governed.
