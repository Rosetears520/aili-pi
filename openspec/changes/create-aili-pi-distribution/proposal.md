## Why

[已知|用户] `aili-workflows` 当前承载共享 skills 与 OpenCode 特化工作流，而用户需要一个保持官方 `pi` CLI、可一行安装、并完整表达 AILI/ROSE 语义的独立 Pi distribution（来源：`interview.md` Q1-Q14）。[已知|外部] Pi Package 原生支持 extensions、skills、prompts 与 themes，但不提供 package-level agents 或内建权限系统，因此仅复制现有 Markdown 不能满足 subagent 生命周期和 bounded YOLO 合同（来源：[Pi packages](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/docs/packages.md)、[Pi security](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/docs/security.md)）。

## What Changes

> [框架内] **2026-07-23 DEFINE revision:** Where this revision conflicts with an earlier item below, this revision controls. The package remains one AILI-owned Pi Extension, but it SHALL integrate audited, pinned Pi packages instead of retaining equivalent AILI implementations.

- [已知|用户] 创建独立公开发行面 `Rosetears520/aili-pi` / `@rosetears/aili-pi`；用户安装后仍通过官方 `pi` 工作，不提供替代 agent CLI。
- [已知|用户] 提供 Linux-only 薄 bootstrap：干净 Linux 使用官方 latest Pi，已有 Pi 默认不强制升级，显式 `--update-pi` 才升级；通过兼容检查后调用 `pi install` 安装 AILI Package。
- [已知|用户] 将 `aili-workflows` 保持为共享 skills 的唯一 canonical source；AILI Pi release 嵌入固定 commit/hash 的原样 snapshot，不在运行时读取 `main`，不维护 semantic overlay。
- [已知|用户] 在 canonical `aili-workflows` 中把需要调整的 skill 正文改为 backend-neutral/capability-based，并为后续 agent 提供逐项迁移清单；对该外部 repository 的实际写入仍需独立、精确授权。
- [已知|用户] 将 ROSE 主上下文、5 个 lifecycle prompts 和 19 个角色 profile 转换为 Pi 特化运行时合同；静态 ROSE adapter 安装到 `~/.pi/agent/APPEND_SYSTEM.md` 的 marker-owned block，19 个 Pi-subagent profiles 安装到 `~/.pi/agent/agents/aili/`。
- [已知|用户] 将 `pi-web-access`、`pi-quota-status`、`pi-permission-modes` 与 `@agwab/pi-subagent` 作为经审计、精确 pin 的 production dependencies 集成。AILI 默认启用 `pi-web-access` 完整 upstream surface（search/content fetch/GitHub clone/PDF/video/commands/bundled skill）与 `pi-quota-status` state maintenance；AILI 保留单一入口、配置/provenance/doctor 与 parent-role-path policy adapter，不复制其 lifecycle、web-access、quota 或 permission implementation。
- [已知|用户] 使用 `pi-permission-modes` 的 `Default`、`Plan`、`Build`、`YOLO`、`/perm` 与 `Alt+M`，而不是 AILI 的 `standard`/`bounded-yolo`、`/aili-mode` 或 Ctrl shortcut。Linux Bubblewrap sandbox 可用时启用；缺失或不兼容时必须显式降级，且不得声称隔离保证。
- [已知|用户] 以 `@agwab/pi-subagent` API 承担 fresh child lifecycle、bounded concurrency、cancellation 和 artifacts；AILI adapter 保留 max concurrency 2、single-use/no automatic retry/no recursive delegation、role/tool/path ceilings、headless fail-closed 和结构化结果限制，并默认禁用 worktree、background、resume 与 automatic redispatch。
- [已知|用户] 建立全量 compatibility inventory、capability registry、optional packs 与 doctor；每项使用 `native`、`adapted`、`optional` 或 `blocked`，稳定版不得存在未解释的 `blocked`。
- [已知|用户] 采用“审计后选择性复用”：优先使用固定 revision 的 Pi 官方 MIT 示例；社区代码只有通过 license/provenance/API/maintenance 审计后才能成为 dependency 或 adaptation，并记录 notice/SBOM 来源。
- [已知|用户] Global resource installation SHALL be an explicit bootstrap action. It may create or update only marker-owned AILI blocks/files, never overwrite unrelated user content, and never prune stale global profile files automatically.
- [已知|用户] 按可独立验证的里程碑交付核心 v1 contract；macOS、主题、TUI、字体和 native Windows 不属于本 change，主题资料仅作为后续 OpenSpec change 的输入。

## Capabilities

### New Capabilities

- `pi-distribution-installation`: Linux-only 薄 bootstrap、latest/既有 Pi 策略、Package 安装、兼容检查与失败可见性。
- `canonical-skill-synchronization`: canonical skill 中立化、固定 revision/hash 快照、完整性检查、compatibility inventory 与无本地 semantic overlay 规则。
- `rose-lifecycle-runtime`: ROSE system context、5 个 lifecycle prompt、自然语言路由与 Pi Extension runtime 边界。
- `subagent-orchestration`: 19 个角色 profile、fresh child process、并发/取消/输出/权限上限和 no-resume/no-retry/no-recursion 状态机。
- `permission-modes`: delegated `Default/Plan/Build/YOLO`、`/perm`、`Alt+M`、visible sandbox degradation, and vendor fail-closed high-risk behavior.
- `capability-registry-doctor`: `native/adapted/optional/blocked` registry、optional packs、兼容报告、doctor 和无假成功行为。

### Revised Capabilities

- `native-pi-integrations`: pinned native web search, quota status, permission modes, and subagent runtime through one AILI-owned integration boundary.
- `global-rose-resources`: marker-owned global `APPEND_SYSTEM.md` block and namespaced global Pi-subagent role profiles with non-overwrite, no-prune behavior.

### Modified Capabilities

[工具结果] 无；当前 `openspec/specs/` 没有既有 capability spec。

## Impact

- [工具结果] 当前 change 的 owner 是 `/home/rosetears/code/aili-pi`，远端为 `https://github.com/Rosetears520/aili-pi`；本地 Git 已在 `build/create-aili-pi-distribution` branch 建立，但尚无 commit，commit/push/publish/release 仍是独立操作门禁。
- [已知|外部] 核心运行时以官方 Pi Package/Extension API 为边界，当前调研基线为 Pi `0.81.1` / revision `20be4b18d4c57487f8993d2762bace129f0cf7c6`（来源：[npm metadata](https://registry.npmjs.org/@earendil-works/pi-coding-agent/0.81.1)）。
- [已知|外部] 共享 skills 的调研基线为 `aili-workflows@c40e4fc0c78391354a3b0fc4822a73b84ff3225f`，包含 64 个 skill 目录（来源：[component manifest](https://github.com/Rosetears520/aili-workflows/blob/c40e4fc0c78391354a3b0fc4822a73b84ff3225f/manifests/rose-aili.components.json)）。
- [推断] `aili-pi` 将新增 Package manifest、Extension runtime、generated role/profile artifacts、capability/compatibility manifests、Unix bootstrap、doctor、tests、license/provenance records 和发布文档。
- [工具结果] The revised runtime also changes `package.json`/lockfile through four audited production dependencies; that operation remains separately gated until this revised test plan is accepted.
- [推断] `aili-workflows` 需要一个独立、受其仓库规则约束的 upstream migration lane；本 proposal 只规定清单和依赖合同，不授予跨仓库写入或 attachment 权限。
- [已知|用户] 核心 bootstrap 不接管用户 Pi settings、不修改认证、不复制 `pi install/update/remove`，也不提前建立通用 receipt framework；未来 optional pack 如产生 Package 外部文件，必须另行定义所有权与 rollback。

## Superseding Generic Subagent and Pi-native AGENTS Revision — 2026-07-24

[已知|用户] Replace public `aili_task` with a generic `subagent` tool backed by the complete pinned `@agwab/pi-subagent@0.4.8` lifecycle surface. Preserve the 19 generated `aili.<role>` profiles as optional named agents, not as a prerequisite for generic work. Enable upstream lifecycle actions, async/background state, bounded parallel fan-out, worktree, explicit external `cwd`, and configurable sandboxing. Credential/auth/private-key paths remain hard-denied, including through parsed child bash paths; non-credential external writes remain governed by `pi-permission-modes` confirmation and headless fail-closed behavior.

[已知|用户] Synchronize the portable governance mechanisms in `aili-workflows/templates/opencode-global-AGENTS.md` through a revision/hash-pinned Pi-native global adapter. Preserve instruction precedence, untrusted-content handling, bounded routing/delegation, approval, evidence, verification, scope, and user-language behavior. Do not copy OpenCode-only Task/task_id, attachment/A33, permission, CodeGraph-init, installation, or mandatory lifecycle control planes.

[框架内] The preceding accepted test plan does not authorize implementation of this material public/runtime contract change. The revised design, capability specs, task list, and final test plan require explicit reacceptance before BUILD; external global resource writes, dependency/lockfile changes, Git, and release operations remain independently gated.
