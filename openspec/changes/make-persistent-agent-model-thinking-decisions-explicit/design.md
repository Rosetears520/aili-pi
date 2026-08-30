# Design: make-persistent-agent-model-thinking-decisions-explicit

## D1. 分字段层序（model-selection.ts）

- `ModelLayer`/`ModelChoiceSource` 增加 `direct-user-turn`（source 字面量 `direct-user-turn`）。
- `ResolveModelInput` 增加 `directUserTurn?: TaskModelRequest`（生产方保证已经 `validateCurrentTurnModelRequest` 授权；与 `oneShot` 同为"已授权值，先过校验器"契约）。
- `resolveModelChoice` 内层表变为：`[{direct-user-turn}, instance, project-role, user-role, one-shot]`；`modelLayer` = 第一个 `value?.model` 非空的层，`thinkingLayer` = 第一个 `value?.thinking` 存在的层。候选模型解析跟随 `modelLayer`（裸模型 gate 相应放宽到 one-shot 与 direct-user-turn）；`thinking` 显式值来自 `thinkingLayer`（否则走既有继承/默认链）。`layer`/`source`/`modelSource` 取 `modelLayer`，`thinkingSource` 取 `thinkingLayer`，`persistent`/`oneShot` 语义按 `modelLayer`（思考独立来源不影响）。

## D2. 结构化捕获与决策（production.ts）

- `captureTaskModelRequest` → `{ outcome: "absent" | "captured" | "rejected"; request?; reason? }`：inherit-only 保持语法级捕获；explicit/delegated 校验失败返回 `rejected + reason`，不再吞错。
- preallocate 决策矩阵：
  - authority ∈ {explicit, delegated-choice} 且 captured → `directUserTurn = request`，不确认；decision = `accepted-direct-user` / `accepted-delegated-choice`。
  - inherit-only 且 captured（model 或 thinking-only）→ 一次 UI 确认（文案区分 model/thinking/组合）；confirm → one-shot，decision = `confirmed-model-proposal`；deny/dismiss/headless → decision = `rejected-unauthorized`（headless reason 标明 no-UI）。
  - rejected → decision = `rejected-unauthorized` + reason。
  - 无请求 → `inherited`。
  - one-shot 解析 `ModelSelectionError(layer==="one-shot"|"direct-user-turn")` 的既有回退分支 → decision 改记 `rejected-unsupported` + 错误信息。
- `SubagentModelDecision { requestedModel, requestedThinking, overrideDecision, reason? }` 挂在 `TaskPreflightResult`，由 `CreatedTask` 透传：accepted 结果新增 `modelDecision` 字段；Agent/job/turn metadata 写 `overrideDecision`/`modelRequestReason`；executor 的 `turn.audit` 一并带上。

## D3. hub（第二提交）

- `hub model` action schema 增加 `thinking`（七档字面量联合），`modelHub` request 构造 `parseOverride` 的 thinking 版本。
- `OrdinaryHubSendSchema` 增加 `model?/thinking?`；`HubService.send` → `startMessageTurn` 携带 turn 级 one-shot，经同一 capture/authority 管线解析（无 authority 时按 inherit-only 语义处理：headless 拒绝并回传 decision），turn 结束后不落任何持久配置（现有 hub turn 已显式写 null 的行为扩展为写 decision）。

## D4. 兼容

- `ModelOverride` 保持 `model: string`（配置层语义不变）；部分值只在请求层（`TaskModelRequest`）流动。
- 既有单测的层序断言（instance > project > user > one-shot）不回归；新增 direct-user-turn 用例。

## D5. 用户消息到 current-turn authority 的投影

- Parent dispatch adapter 在处理当前用户消息时识别明确、值域封闭的 subagent 模型指令，例如“subagent 用 `gpt-5.6-luna`”或“这些 subagent 用 `thinking=high`”。该用户指令生成仅对当前 turn 有效的 `CurrentTurnModelAuthority { mode: "explicit" }`，`allowedModels`/`allowedThinking` 只包含用户点名值；未点名字段继续继承。
- 授权还绑定当前用户消息和目标范围（本轮全部 subagent，或用户明确点名的 selector/package）。Parent 生成的后续 `sub` 调用只有在请求值和目标范围完全匹配时才能直接应用；模型自行增加、替换或扩大 model/thinking 仍按未授权请求拒绝。
- Herdr 与 managed 后端共享同一 preflight 决策和审计。Herdr driver 只消费已经解析的 loadout，不自行授权、拒绝或降级模型。目标模型必须存在于当前已认证目录并支持请求的 thinking；否则严格失败，不回退。
- 该 authority 在当前用户 turn 结束后销毁，不写入 Agent、role、project 或 user 持久配置；后续消息如需继续覆盖必须再次明确指定。

**Alternative considered:** 把 `sub` 工具参数视为用户授权。拒绝，因为参数由模型生成，不能证明用户意图。**Alternative considered:** 将用户指定写入 role 配置。拒绝，因为用户要求的是当轮覆盖，不应污染后续任务。

## D6. 明确不做

- 不改 `ModelConfigStore` 的配置 schema（role 覆盖仍需 model）；不引入持久 TurnSubagentPreference；不做 FleetView UI；不让 Herdr 维护第二套 model/thinking 权限规则。
