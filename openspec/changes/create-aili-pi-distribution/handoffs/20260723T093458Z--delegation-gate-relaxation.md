---
schema_version: "1.0"
snapshot_id: "20260723T093458Z--delegation-gate-relaxation"
task_root: "openspec/changes/create-aili-pi-distribution"
status: "finalized"
created_at: "2026-07-23T09:34:58.091937Z"
finalized_at: "2026-07-23T09:37:00.446798Z"
language: "zh"
continues_from: null
continues_from_sha256: null
content_sha256: "59813d0e3732321a6a7f99112f3d62c5c0576f22ffdcd3e11d0203804ab785a1"
---
# Session Handoff: delegation-gate-relaxation

Snapshot ID: `20260723T093458Z--delegation-gate-relaxation`

## Goal

下一会话继续调整 delegation-first parent mutation gate。当前实现要求每个 agent loop 先有成功 `subagent`，用户认为过于严苛且可能拖慢流程；需要在不丢失复杂任务 delegation 价值的前提下收窄 gate。

## Contract References

- 项目规则：`AGENTS.md`
- 当前 OpenSpec 合同：`openspec/changes/create-aili-pi-distribution/specs/rose-lifecycle-runtime/spec.md`
- 任务与测试矩阵：同一 change root 下的 `tasks.md`、`test-plan.md`
- 当前 gate 实现：`src/runtime/delegation-gate.ts`
- 当前用户反馈：不接受“每个 loop 必须成功调用 subagent”作为最终策略；尚未选择具体放宽方案。

## Scope Boundary

**In scope:** 重新定义 parent gate 的触发范围、修改运行时代码/测试/README/OpenSpec/证据哈希，并完成本地验证。

**Out of scope:** 新增 agent CLI、替换 Pi、修改第三方扩展行为、全局 harness 文件、依赖/lockfile、版本号、commit、push、tag、npm publish、global-home 或 provider side effect。

## Completed/Pending/Blocked

- **Completed:** 已实现当前严格 gate；父级 `write`/`edit`、写入型 `lsp_fix`、未知或潜在变更 shell 会在本 loop 成功 delegation 前被阻止；只读工具可用；child marker 不受父 gate 阻止且 credential/path guard 保持生效。
- **Completed:** 已加入 focused tests、runtime 注册、README、OpenSpec/test-plan/progress/drift-log 和 adapter evidence 更新。
- **Pending:** 选择并实现放宽策略；同步调整测试、文档和 evidence；重新运行验证。
- **Blocked:** 没有技术阻塞；当前只有策略决策未定。发布当前改动仍需单独批准。

## Evidence Anchors

- 当前 branch：`build/create-aili-pi-distribution`
- 当前 HEAD：`853589dd40f2961952ecc10934c79c28ccf47120`
- 工作树有本次未提交改动；`graphify-out/` 为未跟踪目录，不属于本任务交付物。
- `src/runtime/delegation-gate.ts` SHA-256：`bf401914ecd6a196922c7f47fc34606ac685df4570f8b0eaa933a97ed5d2b2bd`
- 最新验证：`npm run typecheck`、`npm test`（80 passed，3 skipped）、focused gate/subagent tests（33 passed）、compatibility/provenance/release validation、Linux Package E2E、npm pack dry-run、`openspec validate ... --strict`、`git diff --check` 均通过。
- 已发布的 `@rosetears/aili-pi@0.1.4` 不包含本地未提交 gate 改动。

## Decisions

- 保持单一 Pi Extension 入口和 upstream-owned 第三方扩展边界。
- 保留 child credential marker 豁免；不得因此削弱 credential/path 防护。
- 当前严格 gate 仅作为待调整基线，不应直接视为最终用户体验。
- 建议优先评估“会话级一次 delegation + 复杂任务才强制 gate”的组合方案，但这只是建议，不是已批准决策。

## Open Questions/Risks

- **Open Question:** 采用哪种放宽策略：A）每个会话只要求一次成功 delegation；B）仅多文件/架构/发布/安全等复杂任务强制；C）默认只警告、不阻止。
- **Open Question:** 如果采用复杂度 gate，如何稳定、可测试地定义“简单任务”和“高风险任务”。
- **Risk:** 完全移除硬 gate 会让 delegation-first 退化为提示，无法防止主 agent 直接修改。
- **Unverified:** 一次只读设计 subagent 在模型启动阶段失败，未产生结果，未自动重试。

## Verification State

当前实现的本地验证为 fresh/pass；本 handoff 只新增导航文件，没有改变运行时代码。策略调整后必须重新验证 typecheck、focused/full tests、adapter evidence、provenance、release validation、package dry-run 和 strict OpenSpec。

## Next Action

下一会话先向用户确认 A/B/C 策略；若采用推荐的 A+B，移除按 `agent_start` 的每 loop 强制重置，并为简单任务增加可测试的 fast path，然后更新对应测试、合同和证据，再执行完整本地验证。

## Forbidden Actions

Do not infer contract, permission, Git truth, verification, completion, publication, or destructive authority from this handoff.

## Touched Files / Artifact References

本次当前 gate 相关文件：

- 新增：`src/runtime/delegation-gate.ts`、`tests/unit/delegation-gate.test.ts`
- 修改：`src/runtime/credential-guard.ts`、`src/runtime/index.ts`、`src/runtime/rose-context.ts`、`tests/unit/runtime.test.ts`
- 证据/文档：`README.md`、`manifests/adapter-evidence.json`、`openspec/changes/create-aili-pi-distribution/{specs/rose-lifecycle-runtime/spec.md,tasks.md,test-plan.md,progress.txt,drift-log.md}`

## Subagent Activity

曾尝试派遣一个只读设计 subagent；其模型在启动阶段失败，没有可用结果，也没有自动重试。当前实现依据本地 Pi API/source inspection、focused tests 和全套本地验证建立。

## Blocker / Stop Reason

用户已指出当前“每 loop 必须成功 subagent”过于严苛，但尚未选定 A/B/C 放宽策略；因此下一会话应先确认策略，再修改运行时代码，避免无批准的行为漂移。

## Suggested Next-Session Prompt

从精确的不可变 handoff 快照 `openspec/changes/create-aili-pi-distribution/handoffs/20260723T093458Z--delegation-gate-relaxation.md` 恢复。它只用于导航，不是合同、权限、Git 真相、验证或完成证据。先重新验证当前 repository root、worktree、branch/HEAD、dirty 状态、权限、合同、附件和引用证据，并简要重述当前 scope；遇到冲突或 Unverified 项立即停止受影响工作，然后只从快照的 Next Action 继续。
