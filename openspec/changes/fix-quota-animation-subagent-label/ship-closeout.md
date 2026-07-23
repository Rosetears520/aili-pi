# SHIP Closeout：Quota、Matrix 与 Subagent Agent Label 0.1.6

## 结论

- **状态：** `RELEASE_AUTHORIZED_PREFLIGHT_PASS`
- **目标：** 发布 `@rosetears/aili-pi@0.1.6`，推送 release commit 到 `origin/main`，创建 annotated `v0.1.6`，并更新本机 Pi Package。
- **用户授权：** 2026-07-23，用户在收到精确操作列表后回复“发版”，批准 package/lockfile 仅版本 bump、任务范围提交、push、tag、公开 npm publish 和本机安装。
- **交互边界：** 自动化与 live headless probe 已通过；安装后重启 Pi 的真实 Matrix/footer/Agent-label 视觉仍需人工观察，不得在当前进程中伪报。

## 本次交付

1. Zentui 默认隐藏 `pi-cache-stats`，并优先保留 `pi-quota-status`。
2. Codex 只展示一个 weekly quota：优先明确 `Wk/weekly`，仅在其缺失时兼容 dependency 误标的 `5h` primary，统一输出 `codex <percent> <reset>`。
3. Matrix 保持普通宽度的 pinned Sakura 稀疏瀑布节奏；超过 96 tracks 时确定性覆盖完整终端宽度，消除超宽右侧永久空白区。
4. `✦ REASONING` 恢复 pinned Sakura pastel gradient。
5. Subagent run call 上方显示 sanitized/bounded requested `Agent:`/`Agents:`；并行重复项聚合，未指定项显示 `agentless`，lifecycle action 不伪称 Agent。
6. README、NOTICE、provenance、SBOM、adapter/live evidence 和 OpenSpec 已同步。

## Fresh verification

| 检查 | 结果 | 证据摘要 |
|---|---|---|
| focused affected tests | PASS | 4 files、32 tests passed |
| `npm run typecheck` | PASS | TypeScript no-emit 成功 |
| full Vitest | PASS | 20 files passed、2 skipped；94 tests passed、3 skipped |
| generated/package/skills/roles | PASS | generated/package assertions；64 skills / 471 files；19 roles |
| capability/compatibility | PASS | registry 与 45 条 adapter evidence 通过 |
| provenance/stable release | PASS | deterministic NOTICE/SPDX 与 revision-bound live evidence 通过 |
| live subagent probes | PASS | generic fixtures 23 tests；read-only package child；disposable credential denial child |
| Linux Package E2E | PASS | native Linux clean bootstrap/package fixture 通过 |
| package/publish dry-run | PASS | `0.1.6`、6,152 files、无 forbidden task-local paths；dry-run shasum `35de25e5461709a10744adb90b1fbded199ebc3f` |
| strict OpenSpec / diff | PASS | three relevant changes valid；`git diff --check` 通过 |
| npm audit | WARN | exit 0；1 moderate、0 high、0 critical；moderate 位于未打包的 Pi development/peer path |
| interactive restarted TUI | UNVERIFIED | 需本机安装并重启 Pi 后观察 |

## Release execution evidence

Pending authorized Git/tag/npm/install operations.

## Release-blocker audit

- **Blocking:** 无已发现的自动化、包内容、provenance 或 release-validator blocker。
- **Residual:** Interactive restarted-TUI visuals remain manual；audit 有一项不进入 tarball 的 moderate Pi development/peer advisory。
- **Excluded:** No dependency upgrade, destructive Git action, branch cleanup, or unrelated local artifact mutation is authorized.

## Branch/worktree hygiene

- Working branch: `fix/quota-animation-subagent-label`.
- `.pi/` and `graphify-out/` remain untracked, uncommitted, and undeleted.
- Only task-scoped source/tests/docs/manifests/OpenSpec/plan and approved package version files may be staged.
