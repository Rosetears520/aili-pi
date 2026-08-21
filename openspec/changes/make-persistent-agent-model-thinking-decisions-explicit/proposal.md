## Why

[参考方案|2026-08-21] `AILI-Pi_Subagent_优化与上下文压缩方案.md` 第四节 P0/P1：model/thinking 决策显式化。当前四个确定性缺口（均已源码核实）：

1. **静默丢弃**：`captureTaskModelRequest`（production.ts:494-524）catch 所有异常返回 `undefined`——未授权/歧义/不兼容的请求被无声吞掉，Main Agent 误以为已生效。
2. **重复确认**：即使 `CurrentTurnModelAuthority` 已从本轮用户提示解析出 explicit 授权，preflight 仍对每个 `task.model` 弹一次 Allow once（production.ts:1059-1074 未传 authority 快路径）。
3. **整层选择 + 一次性低于持久层**：`resolveModelChoice`（model-selection.ts:626-648）按整层取第一个存在的 `ModelOverride`，且无 direct-user-turn 层——用户本轮明确指令仍可能被全局 role 配置覆盖，model-only 的持久层会整体遮蔽带 thinking 的一次性请求。
4. **thinking-only 不完整**：task 边界在 `inherit-only` 下丢弃 thinking-only 请求（production.ts:1075-1077 的 else-if 守卫）；`hub model request` 无 thinking 字段；`hub send` 无 model/thinking 一次性覆盖（hub.ts:14-19、43、642-753）。

## What Changes

- `captureTaskModelRequest` 返回结构化结果：`absent` / `captured`（带验证后的请求）/ `rejected`（带原因）；不再静默吞错。
- 新增 `direct-user-turn` 最高解析层：本轮 explicit/delegated-choice authority 验证通过的请求直接应用、不再弹确认；model-proposed（inherit-only）仍需一次确认。
- model 与 thinking 分字段独立解析（各取第一个提供该字段的层）；层序：direct-user-turn > instance > project-role > user-role > confirmed one-shot > parent > profile > runtime。
- 不兼容 thinking 明确失败并报告来源与原因；一次性请求不可用时 decision 记为 rejected-unsupported，不静默换回。
- thinking-only 请求获得与 model 请求对等的一次确认路径（含 UI 文案区分），headless 下记为明确拒绝。
- 结构化 `SubagentModelDecision`（requested/effective/来源/overrideDecision/reason）进入 accepted 结果、Agent/job/turn 元数据与 turn.audit。
- `hub model request` 增加 thinking；`hub send` 增加仅作用于该 continuation turn 的 model/thinking 一次性覆盖。
- 更新 `docs/persistent-agents.md` 层级说明。

## Impact

- `src/runtime/persistent-agents/model-selection.ts`（层序/分字段/direct-user-turn/类型联合）
- `src/runtime/persistent-agents/production.ts`（capture 结构化、preflight 决策、审计）
- `src/runtime/persistent-agents/task-coordinator.ts`（CreatedTask/accepted 结果/metadata 透传）
- `src/runtime/persistent-agents/hub.ts`（model action thinking、send one-shot）
- `src/runtime/persistent-agents/types.ts`（投影字段）
- tests：model-selection / model-authority / hub / task 套件扩展
- spec delta：`subagent-model-selection` capability
