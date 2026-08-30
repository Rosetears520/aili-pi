# Drift Log

## 2026-08-21 — hub send one-shot deferred (task 3.2)

`hub send` 的 turn 级 model/thinking one-shot 需要扩展 `LiveAgentAdapter` 协议（子会话按 continuation turn 解析并应用一次性模型、turn 结束后恢复持久配置），涉及 production 的 live adapter 实现与 hub turn 生命周期的跨层改造。为保证本变更其余语义（静默丢弃消除、direct-user-turn 层、分字段解析、thinking-only 全任务路径、hub model thinking）的交付质量，本条延后为独立后续提交/变更，规格条目保留在 spec delta 中未删。

未做任何静默近似实现：当前 `hub send` 拒绝未知字段（strictKeys），不会出现"看似支持实际无效"的半实现。

## 2026-08-28 — 用户消息必须产生当轮显式授权

真实 Herdr 调度显示当前默认 `inherit-only` 会拒绝 Parent 在 `sub` 参数中传入的 model/thinking，即使用户消息已经明确点名目标模型。此前契约只描述了“已存在 explicit authority 后如何解析”，没有完整定义用户消息如何生成该 authority。

本次 DEFINE 增补：用户当前消息中的明确 subagent model/thinking 指令生成仅限该 turn、值和目标范围受限的 `explicit` authority；managed/Herdr 共用，工具参数不自授权，目录不可用/能力不兼容严格失败，turn 后不持久化。该行为尚未实现，记录为 tasks 3.3/4.3，等待修订 test-plan 接受和 BUILD 授权。

## 2026-08-29 — model-only Parent-thinking fallback superseded

`expose-subagent-model-capabilities` 已接受测试计划并获得 repository-local BUILD 授权。该 change canonicalize `subagent-model-selection`，并 supersede 本 change 中“显式切换模型但省略 thinking 时继续落到 Parent thinking”的冲突解释：新规则使用当前 isolated persistent child 的 Pi 默认（`medium` 经目标模型 capability clamp），来源记录为 `model-default`。当前轮授权、字段优先级和 strict fail-closed 仍由两个 change 共同承认；本 change 尚余的 `hub send` one-shot task 3.2 保持独立，不由新 change 代替。
