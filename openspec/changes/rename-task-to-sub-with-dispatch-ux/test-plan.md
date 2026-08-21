# Test Plan: rename-task-to-sub-with-dispatch-ux

| 层级 | 接口 | 位置 |
|---|---|---|
| 单元 | 权限模式名解析（条目/env/默认）与 bypass 判定 | tests/unit/persistent-agent-permission.test.ts |
| 集成 | yolo 下模型覆盖自动通过、effectiveModel 生效、decision=auto-approved-bypass（双模型夹具，print 无 UI） | tests/integration/persistent-agent-production.test.ts |
| 单元/集成 | 更名面（注册守卫、冲突、policy、包运行时、观察器） | 各持久 Agent 套件 |
| 单元 | agent-dispatch 字段选择（预览回退/结果身份/批次聚合/live 行/hub 摘要） | src/web/lib/agent-dispatch.test.mjs |
| 单元 | 异步结果卡片 | src/web/components/aili/AiliAgentResultCard.test.mjs |
| 单元 | MessageView sub/hub 折叠预览 | src/web/components/MessageView.test.mjs |

真实会话验收（用户）：yolo 下 sub.model 不弹窗且 hub jobs 里 decision 可见；新会话用 sub 派发；Web 观察 subagent 卡片、运行中进度行与异步结果卡片。
