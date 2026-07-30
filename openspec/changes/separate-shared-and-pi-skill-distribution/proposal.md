## Why

[已知|用户] 共享 Skills 后续只由 `aili-workflows` 发布的 npm CLI `rose-aili` 安装和更新；`aili-pi` 只负责官方 Pi 上的 Extension、adapter、prompts、roles 以及确有必要的 Pi 专用 Skills（来源：本会话 2026-07-30 用户决定）。

[工具结果] 当前 `@rosetears/aili-pi` 仍在 `package.json#postinstall` 调用 `scripts/sync-global-skills.mjs`，将包内 pinned snapshot 的同名目录替换到 `~/.agents/skills/`；npm tarball 也通过 `package.json#files` 发布完整 `skills/`。这与新的单一安装 owner 冲突。

[已知|官方] Pi `0.82.1` 可从 Package 的 `package.json#pi.skills` 加载包内 Skills，并分别支持用户级 `~/.pi/agent/skills/` 与受信项目级 `.pi/skills/`；Package 资源无需复制到共享 `.agents` 目录（来源：`node_modules/@earendil-works/pi-coding-agent/docs/skills.md:20-41`、`docs/packages.md:116-133`）。

## What Changes

- [已知|用户] 共享 Skills 使用两个显式独立命令：安装为 `npx -y rose-aili@latest install`，更新为 `npx -y rose-aili@latest update`；`aili-pi` 的 npm lifecycle、Pi Package lifecycle 和 bootstrap 均不得隐式执行这些命令。
- [框架内] `aili-pi` SHALL 移除向 `~/.agents/skills/` 写入的 `postinstall` 路径，并停止在 npm tarball 中发布通用 `skills/**` snapshot。
- [框架内] repository-local `skills/**`、`upstream/aili-workflows.lock.json` 与 compatibility/provenance evidence MAY 保留为精确 build/verification baseline，但不得成为 installed runtime resource、第二个 Pi skill source 或用户 HOME 写入源。
- [框架内] 未来确有必要的 Pi 专用 Skill SHALL 由 `aili-pi` 在独立 `pi-skills/<name>/SKILL.md` 下拥有，并通过 `package.json#pi.skills` 显式声明；本 change 不创建占位或重复通用 Skill。
- [框架内] `aili-pi` doctor SHALL 只读报告共享 workflow skill 的 observed presence/compatibility；缺失或不兼容时不得自动安装、降级到 embedded snapshot 或报告 integrated workflow PASS。
- [框架内] README、bootstrap completion guidance、package/provenance manifests 与测试 SHALL 明确两个分发 owner、两套显式命令、moving `@latest` 风险和 separately gated operations。
- [框架内] 在公开 `rose-aili@latest` 包含本仓库当前依赖的 generic formal task-board contract 前，移除现有 shared-skill fallback 的 BUILD package SHALL 保持 blocked。

## Capabilities

### New Capabilities

- `shared-and-pi-skill-distribution`: 共享 Skills 的独立 `rose-aili` 安装面、`aili-pi` 的零 `.agents` 写入边界、Pi Package 专用 Skill 归属和 compatibility visibility。

### Modified Capabilities

<!-- [工具结果] 当前 repository-level openspec/specs/ 没有已发布 capability spec；本 change 不声明既有 published spec delta。 -->

## Impact

- [工具结果] 预计影响 `package.json`、`package-lock.json` root `hasInstallScript`、`scripts/sync-global-skills.mjs` 及其类型/测试 owner、README、bootstrap completion guidance、doctor/registry、package/generated/provenance tests 和 npm tarball inventory。
- [推断] 删除 `postinstall` 会要求同步修改 committed lockfile 的 `hasInstallScript`，但不需要新增、删除或升级 production dependency；lockfile mutation 仍需单独精确批准。
- [工具结果|外部] 2026-07-30 查询的 npm `rose-aili@latest` 为 `0.4.0`，`gitHead=6e1715ff4e0069b0152786b2a6ce49d9c8909db8`；该 revision 尚无 `aili-delivery-flow/references/formal-task-board.md`，因此当前 upstream prerequisite 未满足（来源：`npm view rose-aili@0.4.0 ...` 与对应 GitHub raw path）。
- [框架内] 本 proposal 不授权 external repository write、真实 HOME 写入、npm/npx 安装、dependency/lockfile mutation、文件删除、Git commit/push、publish 或 release；每项真实操作继续使用独立精确门禁。
