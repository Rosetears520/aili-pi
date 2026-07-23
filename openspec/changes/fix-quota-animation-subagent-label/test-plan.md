# Acceptance Test Plan: Quota, Sakura Animation, and Subagent Agent Label

## Document Status

- **State:** `ACCEPTED` on 2026-07-23. The user replied “ok，你直接做” after reviewing the revised plan and Matrix-width diagnosis.
- **Scope:** Zentui quota/cache status selection, exact Sakura Matrix/reasoning palette, responsive Matrix width coverage, subagent run-call Agent label, and dark-theme activation guidance.
- **Boundary:** The original acceptance authorized no dependency/lockfile change, external provider/subagent run, Git operation, publication, release, or installation. The user later separately authorized the exact read-only live probes, then replied “发版” to the explicit `0.1.6` version/commit/push/tag/public-npm/install operation list. Those SHIP operations are now authorized; unrelated dependency changes, destructive Git operations, or broader provider actions remain excluded.

## Traceability Matrix

| ID | Requirement / risk | Verification | Expected evidence | Status |
|---|---|---|---|---|
| QUOTA-1 | Cache must not hide Codex quota | config/status unit fixture with both keys | cache default off; quota first when both explicitly enabled | passed |
| QUOTA-2 | One canonical weekly display | explicit-weekly and legacy-primary fixtures | one `codex <percent> <reset>` segment; no `5h`/`7d` duplicate | passed |
| QUOTA-3 | Prefer explicit weekly, retain compatibility | dual-segment, Wk-only, 5h-only, and unknown fixtures | Wk wins; 5h is fallback only; selected percentage/reset unchanged | passed |
| QUOTA-4 | Poller ownership unchanged | source/integration inspection | pinned `pi-quota-status` still owns polling/state; no second poller | passed |
| ANIM-1 | Exact Sakura Matrix | pinned-source value/lifecycle inspection | BG/TEXT/CANDY/fallback exact; only documented event/import/responsive adaptation | passed |
| ANIM-2 | Exact Sakura reasoning gradient | unit/source comparison | all gradient stops/fallback equal pinned source | passed |
| MATRIX-1 | Ordinary sparse behavior stays upstream-compatible | deterministic width 240 fixture (candidate count within budget) | same drop sequence and default density; intentional gaps remain | passed |
| MATRIX-2 | Ultra-wide prefix blank band is removed | deterministic widths 320/384/480/640 | bounded tracks reach first and final width deciles | passed |
| MATRIX-3 | Terminal cell width remains valid | glyph and rendered-line width fixtures | every glyph is one cell; each line equals requested visible width | passed |
| MATRIX-4 | Timing is not misdiagnosed as column loss | source/fixture inspection | elapsed-time jumps may change frames but cannot permanently exclude a width region | passed |
| AGENT-1 | Named single run header | renderer fixture | first row names requested Agent; upstream call remains below | passed |
| AGENT-2 | Parallel/agentless header | renderer fixtures | bounded names and explicit `agentless` | passed |
| AGENT-3 | Safe label text | control/length fixtures | controls removed, whitespace collapsed, output bounded; task text absent | passed |
| AGENT-4 | Lifecycle/schema/execute unchanged | unit/integration regression | no lifecycle Agent claim; exact upstream schema and protected execution retained | passed |
| PKG-1 | Provenance and package boundary | provenance validation + package dry-run | adaptations recorded; no local state/OpenSpec/test artifacts in tarball | passed |
| REL-1 | Stable release evidence remains revision-bound | `npm run validate:release` | fresh authorized live subagent probes bind the changed wrapper/test hashes | passed |
| MAN-1 | Real dark-theme TUI | post-install manual check | `rem-cyberdeck` loads after restart; Matrix/reasoning/quota/header visually observed | unverified |
| MAN-2 | Real named subagent | separately approved provider check or user observation | requested Agent label visible above run | unverified |

## Planned Commands

```bash
npx vitest run tests/unit/extension-status.test.ts tests/unit/matrix.test.ts tests/unit/subagents.test.ts tests/unit/zentui-gradient.test.ts
npm run typecheck
npm test
npm run validate:provenance
npm run validate:release
npm pack --dry-run --json
openspec validate fix-quota-animation-subagent-label --strict
git diff --check
```

## Execution Results

- Focused affected tests: 4 files, 32 tests passed.
- TypeScript typecheck passed.
- Full Vitest: 20 files passed, 2 skipped; 94 tests passed, 3 skipped.
- Adapter compatibility and provenance validators passed.
- Package and publish dry-runs: `@rosetears/aili-pi@0.1.6`, 6,152 files, no forbidden local/OpenSpec/test/temp paths.
- Strict OpenSpec validation and `git diff --check` passed.
- After separate user authorization, the exact generic fixture, read-only package probe, and disposable credential-denial probe passed. `manifests/live-verification.json` binds their evidence to the changed wrapper/test hashes, stable release validation passed, and `0.1.6` was published/installed with matching registry and installed-file identity.

## Manual Checks

1. Restart Pi and confirm the selected theme is `rem-cyberdeck`.
2. Run `/sakura-matrix preview` at a normal width and an ultra-wide width; compare colors with the pinned source and confirm tracks span the complete width while intentional sparse gaps remain.
3. Observe an authenticated Codex session: footer shows exactly one `codex <real weekly %> <real weekly reset>` segment and no cache line, `5h`, or duplicate `7d` line by default.
4. Observe a named subagent call only after exact provider authorization: Agent label appears above the unchanged subagent call UI.

## Exit Criteria

All automated implementation and stable-release rows pass with fresh evidence; no cache/quota confusion, duplicate quota, duplicate poller, altered subagent schema/execution, unsafe label, or Sakura palette drift remains. Interactive TUI rows stay `Unverified` until installation/restart and observation are separately authorized and cannot be reported as executed.

## Acceptance Record

Accepted on 2026-07-23 by the user's explicit “ok，你直接做”. During BUILD, the user clarified “Codex 付费用户…限制只有 7d” and then confirmed “可以，只展示一个就可以了”; this accepted addendum replaces the former dual `codex`/`7d` presentation with one canonical weekly `codex` segment. Acceptance permits repository-local implementation only; all dependency/lockfile, external provider, Git, publication, release, and installation operations remain separately gated.
