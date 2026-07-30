# Change Context: Shared and Pi Skill Distribution

## Change Identity

- `change_id`: `separate-shared-and-pi-skill-distribution`
- `capability`: `shared-and-pi-skill-distribution`
- `backend`: OpenSpec `spec-driven`
- `lifecycle_phase`: DEFINE
- `acceptance_state`: `FINAL_TEST_PLAN_ACCEPTED_BUILD_BLOCKED`

## Goal

[已知|用户] 让 `rose-aili` 成为共享 Skills 的唯一安装/更新 owner，让 `@rosetears/aili-pi` 只管理 Pi 特化资源；两者使用显式独立命令，不通过 `aili-pi` 的 npm `postinstall` 隐式耦合（来源：本会话 2026-07-30 用户决定）。

## Current Evidence

- [工具结果] `package.json:61` 声明 `postinstall: node scripts/sync-global-skills.mjs --if-pi-managed`。
- [工具结果] `scripts/sync-global-skills.mjs:41-114` 在 Pi-managed package root 下对 `~/.agents/skills/<matching-name>` 执行 staged directory replacement。
- [工具结果] `package.json:22` 将 `skills/` 纳入 npm files；`package.json:43-45` 的 Pi skill surface 当前仅为 `./node_modules/pi-web-access/skills`。
- [工具结果] `tests/unit/package.test.ts:75-79` 与 `tests/bootstrap/global-skill-sync.test.ts` 固化了当前 snapshot-packaged/global-sync 行为。
- [已知|官方] Pi `0.82.1` 支持 Package `pi.skills`、全局 `~/.pi/agent/skills/`、共享 `~/.agents/skills/`、项目 `.pi/skills/` 和受信项目 `.agents/skills/`；同名冲突会 warning 并保留 first-discovered skill（来源：本地官方 `docs/skills.md:20-41,176-189`）。
- [已知|官方] Pi npm Package user install 位于 `~/.pi/agent/npm/`，project install 位于 `.pi/npm/`；Package resource path 相对 package root（来源：本地官方 `docs/packages.md:43-66,116-133`）。
- [工具结果|外部] npm 包的公开名称是 `rose-aili`；2026-07-30 observed `latest=0.4.0`。
- [工具结果] 当前 repository snapshot 通过 fresh `npm run verify:skills`：64 skills/472 files 精确匹配 local lock commit `d08b343ac45e4f90510a7af6b76f95d38d9e0cb1`。
- [工具结果|外部] `rose-aili@0.4.0` 的 source revision 缺少当前 snapshot 中的 generic formal task-board protocol；因此它尚不能作为 current formal orchestration semantics 的等价 replacement。

## Confirmed Decisions

- **D-001 — Sole shared installer:** [已知|用户] 共享 Skills 只由 `rose-aili` 安装/更新。
- **D-002 — Explicit latest commands:** [已知|用户] 安装与更新分别使用显式独立的 `rose-aili@latest install` / `update` 命令。
- **D-003 — No implicit coupling:** [已知|用户] 不使用 `aili-pi` npm `postinstall` 自动联网或写 `~/.agents`。
- **D-004 — Pi specialization ownership:** [已知|用户] Pi 特化由 `aili-pi` 管理；存在 Pi 专用 Skills 时应进入 Pi-owned surface，不进入共享 `.agents`。
- **D-005 — Separate change:** [已知|用户] 本架构变更使用独立 OpenSpec change `separate-shared-and-pi-skill-distribution`，不扩张 `add-file-task-board`。
- **D-006 — Dirty-tree boundary:** [已知|用户] 本次 DEFINE 只允许写该新 change 目录，不修改、暂存、清理或覆盖当前 dirty worktree 的其他文件。
- **D-007 — Preserve upstream prerequisite:** [已知|用户] 保留“先发布含 generic formal-board 的 exact `rose-aili` successor，再移除 `aili-pi` shared-skill install path”的前置门禁；不接受临时 integrated formal incompatibility。

## Boundaries

- [框架内] 不把 `rose-aili` 加为 `aili-pi` dependency、bundledDependency、peerDependency 或 lifecycle script。
- [框架内] 不由 `aili-pi` 自动运行 npm/npx、GitHub fetch、`rose-aili install/update` 或真实 HOME mutation。
- [框架内] 不把通用 snapshot 注册到 `pi.skills`，不复制到 `~/.pi/agent/skills` 或项目 `.pi/skills`。
- [框架内] 不创建只为占位的 Pi Skill；`formalContext`、Pi `task`/`hub` 参数和 sandbox/runtime enforcement 继续由 Pi adapter/tool metadata 拥有。
- [框架内] 不声称任意未来 `@latest` 与当前 `aili-pi` 已验证兼容；doctor 只报告 observed state。
- [框架内] 不在本 change 写 `aili-workflows`、发布 npm、修改用户 HOME、执行 Git/release 或扩展平台范围。

## Remaining Blockers / Unverified

- **B-UPSTREAM-FORMAL-001:** [工具结果|外部] observed `rose-aili@0.4.0` 尚未携带 generic formal task-board contract；受影响 BUILD package 必须等待新的 upstream release 或明确缩减 integrated formal claim。
- **UV-LATEST-001:** [未验证] 任意 future `rose-aili@latest` 与当前 Pi adapter 的完整行为兼容性不能由 dist-tag 名称证明。
- **UV-PI-SKILL-001:** [未验证] 当前 scope 没有已接受的 Pi 专用 Skill；`pi-skills/**` 仅定义 owner/placement contract，不承诺创建具体 Skill。
- **UV-LIVE-INSTALL-001:** [未验证] 真实用户 HOME 中两个独立 install/update 命令的组合行为未获授权，普通验证只使用静态检查或 disposable HOME。
