# Drift Log

## 2026-08-21 — hub send one-shot deferred (task 3.2)

`hub send` 的 turn 级 model/thinking one-shot 需要扩展 `LiveAgentAdapter` 协议（子会话按 continuation turn 解析并应用一次性模型、turn 结束后恢复持久配置），涉及 production 的 live adapter 实现与 hub turn 生命周期的跨层改造。为保证本变更其余语义（静默丢弃消除、direct-user-turn 层、分字段解析、thinking-only 全任务路径、hub model thinking）的交付质量，本条延后为独立后续提交/变更，规格条目保留在 spec delta 中未删。

未做任何静默近似实现：当前 `hub send` 拒绝未知字段（strictKeys），不会出现"看似支持实际无效"的半实现。
