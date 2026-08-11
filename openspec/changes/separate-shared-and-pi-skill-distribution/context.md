# Change Context: Shared and Pi Skill Distribution

> **Historical/superseded status (2026-08-01):** `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This change is retained only as a historical and capability-source reference; it must not independently dispatch, advance, accept, close, publish, or release overlapping packages. Any readiness, completion, test-count, snapshot, runtime, acceptance, or opaque session-reference statement below is a historical assertion and was not independently reverified during this reconciliation.

## Change Identity

- `change_id`: `separate-shared-and-pi-skill-distribution`
- `capability`: `shared-and-pi-skill-distribution`
- `backend`: OpenSpec `spec-driven`
- `lifecycle_phase`: HISTORICAL
- `acceptance_state`: `SUPERSEDED_NO_EXECUTION_AUTHORITY`

## Goal

2026-07-30 的历史决策记录要求 `rose-aili` 成为共享 Skills 的唯一安装/更新 owner，让 `@rosetears/aili-pi` 只管理 Pi 特化资源；两者使用显式独立命令，不通过 `aili-pi` 的 npm `postinstall` 隐式耦合。该决策记录保留为能力来源，不再授予执行权。

## Current Evidence

- 2026-07-30 的仓库记录称 `package.json:61` 声明 `postinstall: node scripts/sync-global-skills.mjs --if-pi-managed`。
- 同一记录称 `scripts/sync-global-skills.mjs:41-114` 在 Pi-managed package root 下对 `~/.agents/skills/<matching-name>` 执行 staged directory replacement。
- 同一记录称 `package.json:22` 将 `skills/` 纳入 npm files；`package.json:43-45` 的 Pi skill surface 当时仅为 `./node_modules/pi-web-access/skills`。
- 同一记录称 `tests/unit/package.test.ts:75-79` 与 `tests/bootstrap/global-skill-sync.test.ts` 固化了当时的 snapshot-packaged/global-sync 行为。
- 本文引用的本地 Pi `0.82.1` 文档称 Package 支持 `pi.skills`、全局 `~/.pi/agent/skills/`、共享 `~/.agents/skills/`、项目 `.pi/skills/` 和受信项目 `.agents/skills/`，同名冲突会 warning 并保留 first-discovered skill（`docs/skills.md:20-41,176-189`）。本次 reconciliation 未重新核验该版本文档。
- 同一版本文档称 Pi npm Package user install 位于 `~/.pi/agent/npm/`，project install 位于 `.pi/npm/`，Package resource path 相对 package root（`docs/packages.md:43-66,116-133`）。本次 reconciliation 未重新核验。
- 历史外部记录称 npm 包的公开名称是 `rose-aili`，并在 2026-07-30 observed `latest=0.4.0`；本次 reconciliation 未访问网络或重新验证该值。
- 历史验证记录称 repository snapshot 通过 `npm run verify:skills`，64 skills/472 files 精确匹配 local lock commit `d08b343ac45e4f90510a7af6b76f95d38d9e0cb1`；该结果未在本次 reconciliation 中重跑。
- 历史外部记录称 `rose-aili@0.4.0` 的 source revision 缺少当时 snapshot 中的 generic formal task-board protocol，因此当时不能作为 formal orchestration semantics 的等价 replacement；本次 reconciliation 未访问网络或重新验证。

## Confirmed Decisions

- **D-001 — Sole shared installer:** 历史决策要求共享 Skills 只由 `rose-aili` 安装/更新。
- **D-002 — Explicit latest commands:** 历史决策要求安装与更新分别使用显式独立的 `rose-aili@latest install` / `update` 命令。
- **D-003 — No implicit coupling:** 历史决策不采用 `aili-pi` npm `postinstall` 自动联网或写 `~/.agents`。
- **D-004 — Pi specialization ownership:** 历史决策将 Pi 特化归 `aili-pi` 管理；存在 Pi 专用 Skills 时应进入 Pi-owned surface，不进入共享 `.agents`。
- **D-005 — Separate change:** 历史决策建立独立 OpenSpec change `separate-shared-and-pi-skill-distribution`，不扩张 `add-file-task-board`。
- **D-006 — Dirty-tree boundary:** 当时的 DEFINE 仅允许写该新 change 目录，不修改、暂存、清理或覆盖 dirty worktree 的其他文件。
- **D-007 — Preserve upstream prerequisite:** 历史决策保留“先发布含 generic formal-board 的 exact `rose-aili` successor，再移除 `aili-pi` shared-skill install path”的前置门禁，不接受临时 integrated formal incompatibility。

## Boundaries

- 不把 `rose-aili` 加为 `aili-pi` dependency、bundledDependency、peerDependency 或 lifecycle script。
- 不由 `aili-pi` 自动运行 npm/npx、GitHub fetch、`rose-aili install/update` 或真实 HOME mutation。
- 不把通用 snapshot 注册到 `pi.skills`，不复制到 `~/.pi/agent/skills` 或项目 `.pi/skills`。
- 不创建只为占位的 Pi Skill；`formalContext`、Pi `task`/`hub` 参数和 sandbox/runtime enforcement 继续由 Pi adapter/tool metadata 拥有。
- 不声称任意未来 `@latest` 与当前 `aili-pi` 已验证兼容；doctor 只报告 observed state。
- 不在本 change 写 `aili-workflows`、发布 npm、修改用户 HOME、执行 Git/release 或扩展平台范围。

## Remaining Blockers / Unverified

- **B-UPSTREAM-FORMAL-001:** 历史外部记录称 observed `rose-aili@0.4.0` 尚未携带 generic formal task-board contract。该版本事实未在本次 reconciliation 中重新验证，且此旧 blocker 不再拥有启动 BUILD 的权力。
- **UV-LATEST-001:** 尚未验证任意 future `rose-aili@latest` 与当前 Pi adapter 的完整行为兼容性；dist-tag 名称不能证明兼容。
- **UV-PI-SKILL-001:** 尚未验证任何已接受的 Pi 专用 Skill；`pi-skills/**` 仅保留 owner/placement contract，不承诺创建具体 Skill。
- **UV-LIVE-INSTALL-001:** 真实用户 HOME 中两个独立 install/update 命令的组合行为仍未验证且未获授权；历史计划仅提出静态检查或 disposable HOME。
