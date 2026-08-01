## Why

> **Historical/superseded status (2026-08-01):** `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This proposal remains a historical and capability-source reference only; it must not independently dispatch, advance, accept, close, publish, or release overlapping packages. Readiness, completion, test-count, snapshot, runtime, acceptance, and external-state claims below are historical assertions not independently reverified during this reconciliation.

The 2026-07-30 decision record said shared Skills would be installed and updated only by the `aili-workflows` npm CLI `rose-aili`, while `aili-pi` would own the Extension, adapters, prompts, roles, and any necessary Pi-specific Skills on official Pi. This record is preserved as capability source, not current execution authority.

The 2026-07-30 repository record said `@rosetears/aili-pi` called `scripts/sync-global-skills.mjs` from `package.json#postinstall`, replacing matching directories under `~/.agents/skills/` from the bundled pinned snapshot, and that `package.json#files` included the complete `skills/` tree in the npm tarball. This was not independently reverified here.

本文引用的本地 Pi `0.82.1` 文档称 Package 可从 `package.json#pi.skills` 加载包内 Skills，并分别支持用户级 `~/.pi/agent/skills/` 与受信项目级 `.pi/skills/`；Package 资源无需复制到共享 `.agents` 目录（`node_modules/@earendil-works/pi-coding-agent/docs/skills.md:20-41`、`docs/packages.md:116-133`）。本次 reconciliation 未重新核验该版本文档。

## What Changes

- 历史决策为共享 Skills 规定两个显式独立命令：安装为 `npx -y rose-aili@latest install`，更新为 `npx -y rose-aili@latest update`；`aili-pi` 的 npm lifecycle、Pi Package lifecycle 和 bootstrap 均不得隐式执行这些命令。
- `aili-pi` SHALL 移除向 `~/.agents/skills/` 写入的 `postinstall` 路径，并停止在 npm tarball 中发布通用 `skills/**` snapshot。
- Repository-local `skills/**`、`upstream/aili-workflows.lock.json` 与 compatibility/provenance evidence MAY 保留为精确 build/verification baseline，但不得成为 installed runtime resource、第二个 Pi skill source 或用户 HOME 写入源。
- 未来确有必要的 Pi 专用 Skill SHALL 由 `aili-pi` 在独立 `pi-skills/<name>/SKILL.md` 下拥有，并通过 `package.json#pi.skills` 显式声明；本 change 不创建占位或重复通用 Skill。
- `aili-pi` doctor SHALL 只读报告共享 workflow skill 的 observed presence/compatibility；缺失或不兼容时不得自动安装、降级到 embedded snapshot 或报告 integrated workflow PASS。
- README、bootstrap completion guidance、package/provenance manifests 与测试 SHALL 明确两个分发 owner、两套显式命令、moving `@latest` 风险和 separately gated operations。
- 在经过当前 owner 验证的 exact `rose-aili` candidate 包含所需 generic formal task-board contract 前，移除 shared-skill fallback 的实现工作应保持 blocked；本旧 change 无权自行解除该门禁。

## Capabilities

### New Capabilities

- `shared-and-pi-skill-distribution`: 共享 Skills 的独立 `rose-aili` 安装面、`aili-pi` 的零 `.agents` 写入边界、Pi Package 专用 Skill 归属和 compatibility visibility。

### Modified Capabilities

<!-- 2026-07-30 的仓库记录称 repository-level openspec/specs/ 没有已发布 capability spec；本 change 不声明既有 published spec delta。该记录未在本次 reconciliation 中重新验证。 -->

## Impact

- The historical impact estimate named `package.json`, root `package-lock.json#hasInstallScript`, `scripts/sync-global-skills.mjs` and its type/test owners, README, bootstrap completion guidance, doctor/registry, package/generated/provenance tests, and npm tarball inventory.
- Design rationale: deleting `postinstall` would require reconciling the committed lockfile `hasInstallScript` without adding, removing, or upgrading a production dependency; any future lockfile mutation still requires separate exact approval.
- A 2026-07-30 external record reported npm `rose-aili@latest` as `0.4.0`, `gitHead=6e1715ff4e0069b0152786b2a6ce49d9c8909db8`, and reported that revision lacked `aili-delivery-flow/references/formal-task-board.md`. This reconciliation did not access the network or independently verify the version, revision, or file claim.
- This proposal does not authorize external repository write, real HOME write, npm/npx installation, dependency/lockfile mutation, file deletion, Git commit/push, publication, or release. Any future operation remains subject to the umbrella change and separate exact gates.
