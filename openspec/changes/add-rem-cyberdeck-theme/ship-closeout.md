# SHIP Closeout：Rem Cyberdeck Theme 0.1.5

## 结论

- **状态：** `RELEASED_AND_INSTALLED_WITH_INTERACTIVE_TUI_UNVERIFIED`
- **目标：** 将当前任务范围发布为 `@rosetears/aili-pi@0.1.5`，推送到 `origin/main`，创建 `v0.1.5`，并更新本机 Pi Package。
- **用户授权：** 2026-07-23 已明确批准 `0.1.5` package/lockfile bump、任务范围提交、推送 `origin/main`、`v0.1.5` tag、公开 npm 发布和本机 Pi 安装。
- **BUILD gate：** 自动化与包发布门禁通过；registry 与本机安装均已验证。交互式 Matrix/footer/fixed-editor 视觉矩阵尚未验证，需重启 Pi 观察。

## 本次交付

1. Matrix 恢复到 `pi-sakura-cyberdeck@165a1f8011a12a58a6409b56b8a6c0416cd9b589` 的暗色拖尾、文本色、六组粉彩 RGB 及 fallback 色。
2. `pi-quota-status` 的展示层把 `5h` 映射为 `codex`、把 `Wk` 映射为 `7d`，百分比、重置时间、轮询和状态维度保持上游所有权。
3. provenance、NOTICE、SBOM 和 adapter evidence 已与源码及 `0.1.5` lockfile 同步。
4. OpenSpec 已写回 Sakura Matrix 视觉例外和 quota display-only mapping；原 drift 已关闭。

## Fresh verification

| 检查 | 结果 | 证据摘要 |
|---|---|---|
| focused quota test | PASS | 1 file、2 tests passed |
| `npm run typecheck` | PASS | TypeScript no-emit 成功 |
| `npm test` | PASS | 18 files passed、2 live/global files skipped；70 tests passed、3 live/global tests skipped |
| generated/package/skills/roles | PASS | 64 skills / 471 files、19 roles，package assertions 全部通过 |
| capability/compatibility | PASS | registry validation 与 45 条 adapter evidence 通过 |
| provenance/stable release | PASS | deterministic SPDX/NOTICE 与 stable-release validator 通过 |
| Linux local Package E2E | PASS | clean native Linux fixture 通过 |
| package/publish dry-run | PASS | `0.1.5`，6,152 files；无 `.pi/`、`graphify-out/`、OpenSpec、tests、`.tmp/`、artifacts 或 env files |
| strict OpenSpec | PASS | `add-rem-cyberdeck-theme` 与 `create-aili-pi-distribution` 均 valid |
| source palette comparison | PASS | 本地 pinned checkout HEAD 为 `165a1f8…`；Matrix BG/TEXT/CANDY/fallback values 一致 |
| interactive Linux TUI matrix | UNVERIFIED | 需要安装后重启 Pi；未获授权进行真实 provider nested-TUI call |

## Release execution evidence

- Release commit：`407b17384787a7068e502a219d50e78f3b50feb8`。
- `origin/main` 推送成功；annotated `v0.1.5` tag peel 到同一 release commit。
- npm registry：`@rosetears/aili-pi@0.1.5`，`latest=0.1.5`，`gitHead=407b17384787a7068e502a219d50e78f3b50feb8`，shasum `87b613ac73d273411390a59c900abb3b73643b7d`。
- 本机执行 `pi install npm:@rosetears/aili-pi@latest` 成功；production install audit 为 0 vulnerabilities。
- `pi list` 显示 `npm:@rosetears/aili-pi@latest`；安装目录 package version 为 `0.1.5`。
- 安装后的 Matrix 与 quota formatter 文件 SHA-256 分别与 release worktree 完全一致。

## Release-blocker audit

- **Blocking：** 无已发现的代码、类型、测试、包内容、provenance、registry 或 stable-release blocker。
- **Important / residual：** `npm audit --omit=dev --audit-level=high` 成功退出，但报告 Pi development/peer 路径内 `protobufjs@7.6.4` 的一项 moderate advisory。该路径不进入发布 tarball；生产 `@agwab/pi-subagent` 路径解析到已修复的 `protobufjs@7.6.5`。未进行未授权依赖修改。
- **Unverified：** 真实终端字体、窄终端、tmux、mouse/select、固定编辑器和工作中 Matrix 动画的人工视觉体验。
- **Open Question：** 无阻止本次用户明确要求发布的产品决策。

## Spec coverage

- THEME、WORK、FOOT、EDITOR、FAIL-SAFE、RESTORATION、PROVENANCE 的源码和自动化链路已覆盖。
- `tasks.md` 1.1 至 4.2 已完成。
- 4.3 中的自动化、包 dry-run 和 strict validation 已完成；人工 Linux TUI matrix 仍保持未勾选，不被伪报为 PASS。
- 本次行为与更新后的 requirement/design/test-plan 一致。

## Branch/worktree hygiene

- 当前工作分支：`build/create-aili-pi-distribution`；release commit 已快进推送到 `origin/main`。
- 仅任务范围文件被显式暂存并提交。
- `.pi/` 为先前 subagent run artifacts，`graphify-out/` 为本地分析缓存；两者不暂存、不删除、不进入 npm tarball。
- `.tmp/` 为 ignored、任务本地 dry-run/E2E evidence；不进入提交或 tarball。
- 未执行 reset、clean、stash、force-push、branch deletion 或 worktree removal。

## 后续操作

1. 已完成：提交 release tree、推送 `origin/main`、创建并推送 annotated `v0.1.5`。
2. 已完成：公开发布 npm `0.1.5` 并校验 version、dist-tag、gitHead、shasum。
3. 已完成：通过 `pi install npm:@rosetears/aili-pi@latest` 更新本机 Package，并校验 package identity、version 和目标文件 hash。
4. 用户需重启当前 Pi 会话后人工观察 Matrix 和 footer；该观察不在本进程内伪造。
