# Session Handoff: create-aili-pi-distribution

## Goal

[已知|用户] 在官方 Pi 之上实现独立 `@rosetears/aili-pi` distribution：薄 Linux/macOS bootstrap、固定 canonical skill snapshot、Pi 特化 ROSE、5 个 lifecycle prompts、19 个 fresh child-process subagents、session-only bounded YOLO、capability registry/optional packs 和 doctor；日常入口保持 `pi`。

## Active Change / Contract References

- [工具结果] Change root：`openspec/changes/create-aili-pi-distribution/`
- [工具结果] Proposal：`proposal.md`
- [工具结果] Architecture：`design.md`
- [工具结果] Capability contracts：`specs/*/spec.md`（6 个）
- [工具结果] Implementation queue：`tasks.md`（47 项，0 项完成）
- [已知|用户] Accepted verification contract：`test-plan.md`（2026-07-22 明确接受，无 waiver）
- [工具结果] Maintained decisions/language：`context.md`
- [工具结果] Requirements record：`interview.md`
- [工具结果] Upstream agent checklist：`upstream-skill-migration.md`
- [工具结果] Deferred visual references：`theme-references.md`

## Lifecycle / Backend

- [工具结果] Lifecycle：`DEFINE` complete；readiness `READY`。
- [工具结果] Backend：OpenSpec `spec-driven`。
- [工具结果] `openspec status --change create-aili-pi-distribution --json`：proposal/design/specs/tasks complete，apply state ready。
- [工具结果] `openspec validate create-aili-pi-distribution --strict`：passed。
- [框架内] 下一 lifecycle gate 是用户显式 `/build`；handoff 与 test-plan acceptance 都不等于 BUILD 或操作授权。

## Scope Boundary

### In scope

- [已知|用户] Official Pi Package，不 fork/rebrand，不改 `pi` CLI。
- [已知|用户] `aili-workflows` 是 shared skill 正文唯一 canonical source；Pi release 嵌入固定 commit/hash 原样 snapshot，无 runtime fetch/semantic overlay。
- [已知|用户] ROSE runtime、5 prompts、19 role profiles、`aili_task`、permission modes、registry/doctor、Unix thin bootstrap。
- [已知|用户] 全量兼容状态：`native/adapted/optional/blocked`；稳定候选不得有未解释 `blocked`。

### Out of scope for this change

- [已知|用户] Theme/TUI/font implementation、native Windows、OS sandbox、默认安装全部 optional integrations。
- [已知|用户] Theme 后续独立 OpenSpec change；当前只保留 `theme-references.md`。
- [框架内] Core installer 不接管 Pi settings/auth/session/update/remove，不建立平行 package receipt。

## Completed / Pending / Blocked Packages

### Completed

- [工具结果] 所有 DEFINE artifacts 已创建并重读。
- [工具结果] Requirements-grilling material decisions 已收敛。
- [工具结果] Official Pi、Oh My Pi 和社区 subagent prior art 已只读调研；未向 `.worktrees/` clone repository。
- [已知|用户] Final `test-plan.md` 已接受。

### Pending

- [工具结果] `tasks.md` 47 项全部 pending；没有生产实现。
- [框架内] BUILD 应按 tasks 1→8 的依赖顺序推进，并在正式 BUILD 启动后由 ROSE 创建/维护 `progress.txt`。

### Operation-gated

- [工具结果] `/home/rosetears/code/aili-pi` 当前不是 Git repository。
- [框架内] `git init`、remote、非默认 branch 需要新的 exact operation approval。
- [框架内] dependency/lockfile 操作需要新的 exact approval。
- [框架内] `aili-workflows` attachment/read/write 需要 exact source + revision + destination 的 A33 approval；当前广义意图不能替代。
- [框架内] commit、push、npm publish、release 分别需要独立 approval。

## Touched Files / Artifact References

- [工具结果] `openspec/changes/create-aili-pi-distribution/.openspec.yaml`
- [工具结果] `proposal.md`, `design.md`, `tasks.md`, `test-plan.md`, `context.md`, `interview.md`
- [工具结果] `upstream-skill-migration.md`, `theme-references.md`, `handoff.md`
- [工具结果] `specs/pi-distribution-installation/spec.md`
- [工具结果] `specs/canonical-skill-synchronization/spec.md`
- [工具结果] `specs/rose-lifecycle-runtime/spec.md`
- [工具结果] `specs/subagent-orchestration/spec.md`
- [工具结果] `specs/permission-modes/spec.md`
- [工具结果] `specs/capability-registry-doctor/spec.md`

## A33 Attachment / Owning-Repository Artifact Destinations

- [工具结果] 当前没有 A33 attachment。
- [框架内] Host 预期是初始化后的 `Rosetears520/aili-pi` 当前目录。
- [框架内] Canonical skill 正文修改归 `aili-workflows` owner；其 change/artifacts 必须写在该 repository，不得只在 `aili-pi` 留 semantic patch。
- [框架内] `aili-pi` 只拥有 lock、原样 snapshot、Pi adapters、compatibility manifests 和 consumer evidence。

## Preserved Rollback Worktrees / Evidence References

- [工具结果] 无 preserved rollback worktree；没有执行 ADD/REMOVE。
- [框架内] 后续 attachment 的 ADD 和 non-force REMOVE 需要不同的 fresh exact approvals。

## Evidence Anchors

- [已知|外部] Pi package/extension/security baseline：`design.md`、`interview.md` 中固定到 Pi `0.81.1`/对应 revision 的链接；BUILD 时必须重新确认 latest。
- [已知|外部] `aili-workflows` DEFINE 调研基线：commit `c40e4fc0c78391354a3b0fc4822a73b84ff3225f`，当时 inventory 为 64 skills、ROSE + 19 subagents、5 commands；这不是 BUILD 时的 current Git truth。
- [已知|外部] Subagent 决策：Pi official child-process example 为主；审计后可选择性适配 `@agwab/pi-subagent` 的 MIT process-group/interrupt/tool-ceiling patterns；不采用 OMP runtime。
- [工具结果] OpenSpec strict validation passed；product tests 尚不存在或未运行。

## Subagent Activity

- [工具结果] 两次 read-only public web research 已完成：Pi/package/prior-art inventory，以及 official Pi vs OMP vs community subagent architecture。
- [工具结果] 没有 implementation subagent，没有外部 clone，没有代码写入。
- [框架内] 不复用旧 task context/task ID；后续若需 agent，fresh single-use dispatch。

## Decisions Made

- [已知|用户] Clean install 使用 official Pi latest；已有 Pi 默认不强更；`--update-pi` 显式升级；不兼容时在 AILI mutation 前 fail-closed。
- [已知|用户] 首发 Linux/macOS，Windows 后续。
- [已知|用户] Thin bootstrap = official Pi installer + `pi install`；核心不复制 package manager。
- [已知|用户] Subagents：fresh、single-use、terminal、max concurrency 2、no resume/retry/recursion，最终 model-visible result 上限 50 KiB。
- [已知|用户] Permission：session-only `standard ↔ bounded-yolo`；`Ctrl+Shift+Alt+A` + `/aili-mode` fallback；高风险门禁和 noninteractive ask=>deny 保留。
- [已知|用户] Canonical skills 正文在 `aili-workflows` backend-neutral 化；`aili-pi` 不维护 semantic overlay。
- [已知|用户] 第三方代码必须通过 license/provenance/API/maintenance audit 后才能 dependency/adapt；不清楚则 reference-only。

## Open Questions

- [开放问题] Theme/TUI/font 的准确设计与“JetBrains Maple Mono”身份留给后续独立 change。
- [开放问题] 未来 optional pack 如创建 Package 外部文件，其 receipt/rollback/ownership 需独立 DEFINE。

## Risks / Unknowns

- [未验证] BUILD 时 Pi latest/API/Node floor。
- [未验证] npm scope/package publish 权限。
- [未验证] 64-skill 逐文件 migration inventory、OpenCode regressions 和 Pi behavior evidence。
- [未验证] Child auth inheritance、Unix process-tree cleanup、JSONL/stderr/details/final-result caps。
- [未验证] Shortcut 在 terminal/tmux/SSH 的传递。
- [未验证] Linux/macOS clean-machine E2E。
- [未验证] Project-local `AGENTS.md`、Git branch/status 与所有 external attachment permissions。

## Verification State

- [工具结果] OpenSpec artifact completeness：passed。
- [工具结果] OpenSpec strict validation：passed。
- [已知|用户] Test-plan acceptance：accepted，无 waiver，无 residual 被接受为 completion evidence。
- [未验证] Implementation/typecheck/unit/integration/E2E/package dry-run/security/secret/provenance checks：尚未运行，因为 production project 尚未初始化。

## Blocker / Stop Reason

- [工具结果] 当前停止原因是用户主动切换 session，不是 DEFINE contract failure。
- [框架内] 实施动作尚未授权；当前目录非 Git repository，因此不能直接开始写 production code。

## Next Action

1. [框架内] 下一 session 先把本文件视为导航，重新读取 `context.md`、accepted `test-plan.md`、proposal/specs/design/tasks 和当前 OpenSpec status/validation。
2. [框架内] 用户显式进入 `/build create-aili-pi-distribution`。
3. [框架内] 在第一个 write 前，单独询问并取得以下 exact operation approval：在 `/home/rosetears/code/aili-pi` 执行 Git 初始化、设置 `origin=https://github.com/Rosetears520/aili-pi`、创建非默认开发分支。
4. [框架内] Git/rules gate 完成后再合成 BUILD package queue；dependency/lockfile 和 upstream attachment/write 到达时分别询问。

## Forbidden Actions

- [框架内] 不从 handoff 推断 BUILD、Git、dependency、attachment、commit/push/publish/release 权限。
- [框架内] 不直接写 main/master/trunk，不跳过 branch/status/rules gate。
- [框架内] 不在 `aili-pi` 手写第二份 skill 正文或 semantic overlay。
- [框架内] 不在 runtime 跟随 `aili-workflows/main`。
- [框架内] 不采用 OMP runtime，不 fork/rebrand Pi，不替换 `pi` CLI。
- [框架内] 不把 permission gate 宣称为 sandbox，不弱化 bounded-YOLO 高风险门禁。
- [框架内] 不实现当前 change 之外的 theme/TUI/font/Windows/OS sandbox。
- [框架内] 不复制 license/provenance 不清晰的社区代码。
- [框架内] 不修改 accepted `test-plan.md` 的 scope/acceptance，除非新 material-delta 先回到 DEFINE 并重新接受。

## Suggested Next-Session Prompt

```text
/build create-aili-pi-distribution

从 `openspec/changes/create-aili-pi-distribution/handoff.md` 恢复，但把 handoff 仅作为导航。重新读取 context.md、已接受的 test-plan.md、proposal.md、design.md、tasks.md、全部 specs，并重新运行 OpenSpec status/strict validation。

先不要写生产代码。当前 `/home/rosetears/code/aili-pi` 尚未初始化 Git；请先向我申请一次精确批准：git init、设置 origin 为 https://github.com/Rosetears520/aili-pi、创建非默认开发分支。依赖/lockfile、aili-workflows attachment/write、commit/push/publish/release 仍需各自单独批准。批准并完成 Git/rules gate 后，再按 accepted test-plan 和 tasks.md 生成 BUILD package queue，从任务 1 开始实施。
```
