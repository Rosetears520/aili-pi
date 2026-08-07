# 分支说明：raw-gap-proof

## 分支标识

- 分支：`feature/reconcile-aili-compact-raw-gap-proof`
- 基线：`227d9dc9392a83748ac4cf77f5c386cbacf7957c`
- 目标包：`@rosetears/aili-pi@0.2.0`
- 远端仓库：`https://github.com/Rosetears520/aili-pi`
- 远端分支：尚未推送，因此目前没有已存在的远端分支链接。推送后的预期地址是 `https://github.com/Rosetears520/aili-pi/tree/feature/reconcile-aili-compact-raw-gap-proof`，该地址在 push 前不代表已发布分支。

当前分支已经创建并切换。工作树仍保留原有未提交改动；本次快照只整理 Compact runtime 依赖闭包、Compact 测试、相关脚本和本 OpenSpec change，其他 dirty 文件不会进入提交。创建说明时尚未执行 commit、push、tag、发布或清理操作；最终 Git 状态以 progress 记录和实际提交为准。

## 这条分支做什么

这条分支承载 AILI Compact raw-interval gap-proof 的局部 BUILD 工作，覆盖已接受变更 `reconcile-aili-compact-release-lineage` 的任务 2.8 和 2.9：

1. 保留 raw branch-message interval 作为权威来源，不改写 T1 的严格原始连续性。
2. 允许 T2/T3 只跨越完整、可重放、由 AILI 自己产生的 `aili_compact_status` / `aili_compact` planning protocol。
3. 通过一个共享的 fail-closed classifier 拒绝普通消息、第三方 tool protocol、缺失或未知 ordinal、不完整/损坏/混合 gap。
4. 为非空透明 gap 使用封闭的 `version: 1` raw-slice proof，绑定相邻 child、边界 leaf、消息数量和 canonical digest。
5. 让 planner、pure reducer 和 BranchIndex replay 从不可变 branch slice 独立重算 proof；legacy raw-`+1` adjacency 继续兼容。

相关契约位于 `test-plan.md`、`tasks.md`、`release-gates.md`，重点实现/验证入口包括：

- `src/runtime/aili-compact/promotion-gaps.ts`
- `src/runtime/aili-compact/v3.ts`
- `src/runtime/aili-compact/v3-mutations.ts`
- `src/runtime/aili-compact/reducer.ts`
- `src/runtime/aili-compact/branch-index.ts`
- `tests/unit/aili-compact-v3.test.ts`
- `tests/unit/aili-compact-v3-mutations.test.ts`
- `tests/unit/aili-compact-v3-reducer.test.ts`
- `tests/unit/aili-compact-branch-index-v3.test.ts`

## 当前目标与证据

目标不是用 fixture 或手工 promotion 绕过缺陷，而是让 production status、mutation validation 和三条 replay 路径对同一个透明 gap 得出相同结论。

已经完成的局部证据：

- `openspec validate reconcile-aili-compact-release-lineage --strict` 通过。
- 四个 raw-gap focused unit 文件通过：4 files / 51 tests。
- `npm run typecheck` 通过。
- 覆盖 AILI-only positive、ordinary/third-party/malformed/mixed/unknown negative、proof endpoint/count/digest/version/size/duplicate 检查、pure/BranchIndex parity 和 forged proof rejection。

当前未完成的关键证据：

- 两个 controlled-production 文件的联合运行超过 300 秒，没有报告，也没有生成 Compact controlled artifact。
- 单独 lineage case 在 60 秒边界仍未结束；Vitest worker 约 101% CPU，说明存在尚未定位的高成本路径。
- 当前源码显示 production index refresh 会经过 `v3ViewFor` → `buildV3RuntimeView`，可能重复重放完整历史；具体 hottest symbol 以及应该优化 production path 还是调整验证 fixture，仍未确定。
- `artifacts/test-results/controlled-production/aili-compact-agent-session.json` 缺失；已有 Persistent artifact 未因这次尝试更新。

## 距离可以发版还差什么

按照 `tasks.md`、`test-plan.md` 和 `release-gates.md`，当前不能称为 release-ready。主要缺口是：

1. 先解决 controlled AgentSession lineage 的超时/高 CPU 问题；若需要改变 production 架构或验证策略，应作为 `BUILD_MATERIAL_DISCOVERY` 返回 DEFINE，而不是在本分支猜测性修改。
2. 完成任务 2.5、2.7、2.8、2.9、3.5，以及 candidate-bound controlled-production、migration、performance、provenance、sanitizer 和 release-index 证据。
3. 重新运行受影响的 controlled T1 → T2 → T3 → T3-restill、status/mutation parity 和 Persistent Agent 检查，并让所有 artifact 绑定当前 `0.2.0` implementation hash。
4. 完成 test plan 中的 focused checks、typecheck、generated/compatibility/package/provenance validation、OpenSpec sequence、full `npm test`、release validation、diff check 和 package dry-run。
5. 完成人工审查：证据类别边界、真实 provider 的保留限制、恢复/迁移/回滚、cache/performance 表述、包内容和剩余 `Unverified` 声明。
6. 最后仍需分别取得 commit、push、tag、npm publish 和 GitHub release 的精确授权；本分支当前没有执行这些操作。

## 审查重点

审查时应重点判断：raw proof 是否真正从 immutable branch slice 重算；classifier 是否只放行完整 AILI-owned protocol；planner、mutation、pure replay、BranchIndex 是否完全一致；以及当前高 CPU 路径是否使 accepted controlled-production verification 实际不可执行。
