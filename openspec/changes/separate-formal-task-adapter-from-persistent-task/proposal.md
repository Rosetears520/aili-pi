## Why

[参考方案|2026-08-21] `AILI-Pi_Subagent_优化与上下文压缩方案.md` 第五节 P1：普通 `task` 工具同时承担普通分发与 formal 分发，公开 schema 暴露 `formalContext`/`continuationAudit` 带来三个确定性问题（已源码核实）：

1. Main Agent 看到 OpenSpec change 后容易自动附加 formal 字段，把普通 review/实现误升级为 Formal package 执行。
2. Formal pair（formal-task-board.md/progress.txt）任意历史记录无效时，整个 change 的调度在 Agent allocation 前 fail-close，表现为"Subagent 启动失败"，普通 task/hub 被连累。
3. 模型必须手写与 board 字段逐字一致的 continuationAudit，抄错即整批被拒。

## What Changes

- 公开 `TASK_TOOL_SCHEMA` 删除 `formalContext`/`continuationAudit`（含交叉校验仅在内部作用域可达）；新增内部 `FORMAL_TASK_REQUEST_SCHEMA` 与 `validateFormalTaskRequest`。
- `TaskCoordinator` 新增 `submitTrusted`（可信内部通道）：formal_task 适配器、嵌套 formal 子代理、ROSE planner 使用；公开 `submit` 保持严格拒绝 formal 字段。
- 新增 `formal_task` 工具（普通 `pi.registerTool` 注册，非 canonical task helper）：模型面仅 `{changeId, packageId}`；适配器校验 v1 pair → 确认包存在且 `ready` → 从 board 字段构造普通 task 请求（含 continuationAudit，单一真源）→ `submitTrusted` 提交。
- 嵌套边界：formal 子代理的嵌套 task 工具获得 formal 字段能力（ancestry 规则要求精确重复 changeId）；普通子代理保持公开 schema；子代理工具表加入 formal_task。
- task 工具的 formal 相关 prompt 指引迁至 formal_task 描述；task 描述明确"formal 分发走 formal_task"。
- 不放松任何 fail-closed 语义；不写仓库特例；普通 task/hub 在 pair 无效时完全不受影响。

## Impact

- `src/runtime/persistent-agents/task-schema.ts`、`task-coordinator.ts`、`runtime.ts`、`production.ts`、新增 `formal-task-tool.ts`
- `src/runtime/formal-orchestration.ts`（导出 `exactTaskRequest`/`buildFormalPackageTaskRequest`）
- spec delta：MODIFIED `upstream-formal-agent-protocol-integration`（公开 formal 输入从 task 移至 formal_task）
- tests：persistent-agent-task / persistent-agent-runtime / formal-orchestration-runtime 套件更新 + 新增
