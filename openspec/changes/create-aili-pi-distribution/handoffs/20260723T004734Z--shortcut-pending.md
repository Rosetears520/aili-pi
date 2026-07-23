---
schema_version: "1.0"
snapshot_id: "20260723T004734Z--shortcut-pending"
task_root: "openspec/changes/create-aili-pi-distribution"
status: "finalized"
created_at: "2026-07-23T00:47:34.470525Z"
finalized_at: "2026-07-23T00:51:00.389660Z"
language: "zh-CN"
continues_from: null
continues_from_sha256: null
content_sha256: "e8b70913c15c8d62c1d133e9ea2630691a48d55c59d991e65391188b112018e6"
---
# Session Handoff: shortcut-pending

Snapshot ID: `20260723T004734Z--shortcut-pending`

## Goal

[已知|用户] 完成 Linux-only `@rosetears/aili-pi` BUILD；当前只剩修复并真实验证 `Ctrl+Shift+Alt+A` 可以双向打开与关闭 bounded-YOLO，然后执行任务 8.6 最终收敛。

## Contract References

- [已知|用户] `openspec/changes/create-aili-pi-distribution/test-plan.md`：2026-07-23 已重新接受 Linux-only 最终 Test Plan。
- [框架内] `openspec/changes/create-aili-pi-distribution/{proposal.md,design.md,tasks.md,progress.txt,drift-log.md}`。
- [框架内] `openspec/changes/create-aili-pi-distribution/specs/` 下六个 capability specs；快捷键约束位于 `specs/permission-modes/spec.md`。
- [框架内] 项目规则：`AGENTS.md`；全局规则需在新会话重新读取。

## Scope Boundary

- [已知|用户] 稳定支持范围仅为 Linux；macOS 与 native Windows 必须在 mutation 前明确 unsupported。
- [框架内] 当前 in-scope：快捷键事件与终端投递诊断、双向 toggle 修复、slash fallback 保持一致、相关冲突、权限与真实终端验证、任务 8.6 收敛。
- [框架内] out-of-scope：theme、TUI、font、OS sandbox、semantic skill overlay、默认安装 optional providers、macOS 与 native Windows 支持。

## Completed/Pending/Blocked

- [工具结果] Tasks 1.1–8.5 均已完成；`tasks.md` 仅 8.6 未勾选。
- [工具结果] Linux bootstrap、64-skill 与 471-file 固定 snapshot、19 roles、ROSE lifecycle、permissions、doctor registry、SBOM docs、离线 Package E2E 与静态 stable-release gate 已实现。
- [工具结果] 真实 provider 子任务协议已修复：无工具 protocol probe 和受限 `code-scout` 读取 `package.json` 均通过，零 changed files；证据见 `manifests/live-verification.json`。
- [已知|用户] 真实 Linux 终端手测中，按 `Ctrl+Shift+Alt+A` 未观察到从 `AILI: standard` 切换；用户要求该快捷键可打开并关闭。`aili-mode standard` slash-command fallback 有可见输出。
- [框架内] Blocked：8.6 不能关闭，直到快捷键失败被修复并取得新的真实终端确认。

## Evidence Anchors

- [工具结果] `progress.txt` 尾部：Linux-only BUILD、live provider 修复、manual shortcut failure 和 next action。
- [工具结果] `drift-log.md`：Linux-only 决策、writer-role 修复、live protocol resolution、Linux terminal shortcut failure。
- [工具结果] `test-plan.md`：R-5、PERM-12、MAN-3 当前为 failed；其他当前状态需在 8.6 最终更新与核对。
- [工具结果] 快捷键实现：`src/runtime/permissions.ts` 的 `registerPermissionModes` 与 session mode runtime；注册入口 `src/runtime/index.ts`。
- [工具结果] 快捷键自动测试：`tests/unit/permissions.test.ts`；真实失败来源为 2026-07-23 当前会话用户终端报告。
- [工具结果] Live child：`tests/integration/live-subagent.test.ts`、`manifests/live-verification.json`、`manifests/adapter-evidence.json`。

## Decisions

- [已知|用户] 正式范围改为 Linux-only，并重新接受修订 Test Plan。
- [已知|用户] `implementer` 与 `test-engineer` 获批仅映射受限 `write` 与 `edit`，不授予 bash；write-capable child 必须有显式 `paths`。
- [已知|用户] 目标快捷键必须双向 toggle；slash command 继续作为 fallback，不能用 fallback 掩盖物理快捷键失败。
- [框架内] 真实 provider probe 每次都曾单独获批；handoff 不授予任何新的网络、模型、认证或费用权限。

## Open Questions/Risks

- [未验证] 快捷键失败根因：终端是否投递该 chord、Pi shortcut normalization 与 ownership、注册键名是否与运行时事件一致，尚未定位。
- [未验证] tmux 与 SSH 环境不在本次用户手测证据内；先修复普通 Linux 终端，不扩张矩阵。
- [开放问题] 修复后需要用户再次在真实终端确认“standard→bounded-yolo→standard”。

## Verification State

- [工具结果] Fresh after live protocol repair：typecheck；`tests/unit/subagents.test.ts` + doctor focused tests（20 passed）；compatibility binding；`validate:release`；OpenSpec strict validation。
- [工具结果] Fresh real operations：无工具 provider probe passed；read-only `code-scout` 针对 `package.json` 的 probe passed，零 changed files。
- [未验证] Full default suite、Linux Package E2E、package dry-run 在最终 live-protocol edits 后尚未全部重跑；8.6 前必须 fresh rerun。
- [工具结果] 当前 Git branch 为 `build/create-aili-pi-distribution`，仓库仍无 commit，所有项目文件显示 untracked；新会话必须重新检查。

## Next Action

[框架内] 先只做快捷键本地诊断：读取 Pi 0.81.1 shortcut API 与 types 和当前 `registerPermissionModes`，建立可执行事件复现，确认 chord 注册与触发差异；修复双向 toggle 并跑 focused tests。之后请求用户做一次真实 Linux 终端复验；通过后再 fresh 跑完整验证并关闭 8.6。

## Forbidden Actions

Do not infer contract, permission, Git truth, verification, completion, publication, or destructive authority from this handoff.

## Touched Files / Artifact References

- [工具结果] 核心 runtime：`extensions/index.ts`、`src/runtime/*.ts`。
- [工具结果] Package 与 distribution：`package.json`、`install.sh`、`scripts/bootstrap.sh`、`README.md`、`THIRD_PARTY_NOTICES.md`。
- [工具结果] Generated 与 evidence：`skills/`、`roles/`、`manifests/`、`upstream/aili-workflows.lock.json`。
- [工具结果] Tests：`tests/unit/`、`tests/integration/`、`tests/bootstrap/`、`tests/fixtures/`。

## A33 Attachments / Owning-Repository Artifact Destinations

- [工具结果] Final canonical source attachment：`.worktrees/aili-workflows/canonical-migration-7eb35f35`，detached clean at `7eb35f357ad489f5841ee10dac1e44549c1bdb76` when last checked。
- [框架内] Owning-repository artifacts remain in `aili-workflows`; consumer snapshot 与 evidence remain in this repository。No A33 REMOVE authority exists。

## Preserved Rollback Worktrees / Evidence References

- [框架内] Earlier attachments `canonical-migration-a56a02b3` and `canonical-migration-26fb4046` plus final `canonical-migration-7eb35f35` were preserved; revalidate exact existence 与 identity before relying on any attachment。

## Subagent Activity

- [工具结果] Read-only security review of mapped writer roles found missing explicit writer paths and credential-name gaps；both were repaired and covered by tests。Subagent conclusions are evidence only。

## Blocker / Stop Reason

- [已知|用户] Real Linux terminal shortcut did not visibly toggle；用户结束当晚工作并要求记录。This failed required Test Plan evidence, so 8.6 remains open。

## Suggested Next-Session Prompt

从精确的不可变 handoff 快照 `openspec/changes/create-aili-pi-distribution/handoffs/20260723T004734Z--shortcut-pending.md` 恢复。它只用于导航，不是合同、权限、Git 真相、验证或完成证据。先重新验证当前 repository root、worktree、branch/HEAD、dirty 状态、权限、合同、附件和引用证据，并简要重述当前 scope；遇到冲突或 Unverified 项立即停止受影响工作，然后只从快照的 Next Action 继续。
