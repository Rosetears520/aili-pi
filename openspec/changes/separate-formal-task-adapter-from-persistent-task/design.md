# Design: separate-formal-task-adapter-from-persistent-task

## D1. Schema 拆分（task-schema.ts）

- `ItemFields` 删除两个 formal 字段；`FORMAL_ITEM_FIELDS = {...ItemFields, formalContext, continuationAudit}` 派生 `FORMAL_TASK_REQUEST_SCHEMA`（flat/batch 联合，`additionalProperties: false`）。
- `normalizeItem` 接受 `allowedKeys`；`validateTaskRequest(raw, profiles, { formal? })` 默认公开；`validateFormalTaskRequest` 为内部入口。所有 formal 交叉校验（Specialized selector、显式 async、audit 兄弟、canonicalRole、writeScope 一致）仅内部作用域可达。

## D2. 可信通道（task-coordinator.ts）

- `submit` → `submitValidated(..., formal=false)`；新增 `submitTrusted(...)` → `formal=true`。公开 submit 对 formal 字段报 unknown fields；嵌套 ancestry 的 formalChangeId 重复规则不变（仅内部可达）。

## D3. formal_task 适配器

- `formal-task-tool.ts`：`FORMAL_TASK_TOOL_SCHEMA { changeId, packageId(pattern) }`；`buildFormalTaskDispatch(repositoryRoot, input)`：resolveFormalTaskBoardRoot（fail-closed 码）→ pairState present → parseFormalTaskBoard v1 → 包存在 → Status=ready → `buildFormalPackageTaskRequest`（formal-orchestration 导出，内部 exactTaskRequest 从 board 字段构造 audit）。
- runtime.ts 注册：普通 `pi.registerTool`（在 task 之后、hub 之前），execute 走 `buildFormalTaskDispatch` + `submitTrusted`，renderers 复用 TASK_RENDERERS。
- production.ts 子代理：formal 子代理（input.item.formalContext 存在）的嵌套 task 用 FORMAL_TASK_REQUEST_SCHEMA + submitTrusted；所有子代理获得 formal_task 工具（同样经 submitTrusted，ancestry 带 formalChangeId 传播）。

## D4. 文案

task 描述/指南移除 formal 分发细节，指向 formal_task；formal_task 描述承载 board 校验、不回落、worker 边界语义。

## D5. 明确不做

不改 hub formal send 的 continuationAudit 通道（其由持久 formalContinuationIdentity 记录驱动校验）；不放松 fail-closed；不改 ROSE planner 的完整 gate 矩阵（formal_task 只做 runtime 级 pair/status 校验，planner 语义独立保留）。
