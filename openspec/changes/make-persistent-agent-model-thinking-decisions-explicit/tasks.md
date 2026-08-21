## 1. 分字段解析与 direct-user-turn 层

- [x] 1.1 `model-selection.ts`：新增 `direct-user-turn` 层与来源字面量；`ResolveModelInput.directUserTurn`；`resolveModelChoice` 改为 model/thinking 分字段层选择，裸模型 gate 覆盖 one-shot 与 direct-user-turn。
- [x] 1.2 既有层序单测全部保持通过（instance > project-role > user-role > one-shot > parent > profile > runtime），新增：direct-user-turn 覆盖 instance；model 与 thinking 异层来源；direct-user-turn thinking-only。

## 2. 结构化捕获与决策（task 路径）

- [x] 2.1 `captureTaskModelRequest` 返回 `absent | captured | rejected(+reason)`，删除静默 catch。
- [x] 2.2 production preallocate：explicit/delegated 直接应用；inherit-only（含 thinking-only）一次确认；headless/deny/dismiss 记 rejected；`SubagentModelDecision` 进入 `TaskPreflightResult`、`CreatedTask`、accepted 结果、Agent/job/turn metadata 与 turn.audit。
- [x] 2.3 one-shot 不可用的回退分支改记 `rejected-unsupported`。

## 3. hub 入口

- [x] 3.1 `hub model` action 增加 `thinking` 并透传到 `ModelConfigurationService` 请求。
- [ ] 3.2 (deferred) `hub send` 增加 turn 级 `model`/`thinking` one-shot，走同一决策管线，turn 元数据记录 decision，不落持久配置。

## 4. 文档与验证

- [x] 4.1 更新 `docs/persistent-agents.md` 层级说明与 thinking-only/hub 入口。
- [x] 4.2 扩展 `persistent-agent-model-selection` / `model-authority` / `task` / `hub` 测试；`npm run typecheck`、聚焦套件、`npm test`、`openspec validate --strict` 通过。
