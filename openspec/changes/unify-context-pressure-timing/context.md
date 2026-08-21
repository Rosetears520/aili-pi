## Context

- 基线：`main` 分支，阶段 1 提交（parent-signal 修复）之后；规格基于 2026-08-21 的源码核实。
- `src/runtime/context-runtime.ts` 是组合根：ACP 先注册、codex-compact 后注册，`ContextTurnRouter` 按 turn 冻结 owner（`openai-codex`+`openai-codex-responses` → `codex-remote-v2`，其余 → `billion-context`），`agent_end`/`session_before_switch`/`session_shutdown` 解冻。
- `session_before_compact` 的 `{cancel:true}` 在 Pi 的 ExtensionRunner 中立即短路后续 handler（最后一个非 undefined 结果生效），因此 threshold gate 必须注册在 codex-compact 的 handler 之前，否则远程压缩已先行发生。
- Pi 官方 `examples/extensions/trigger-compact.ts` 展示的合规模式：`turn_end` 上读取 `ctx.getContextUsage()`，越阈时 `ctx.compact({ onComplete, onError })`。本变更的 WHEN 判定换成 ACP evaluator，触发模式与官方示例一致。
- acp-kernel 0.0.19 默认 nudge 参数（核实自 `node_modules/acp-kernel/dist/index.js`）：`growthRatio 0.05 / growthFloor 50K / growthCap 50K / minGrowthFloor 20K / minGrowthRatio 0.45 / emergencyThresholdPct 0.8`；即 T1 普通 pressure 约为「可压缩内容 ≥ 50K 且距参考点增长 ≥ 22.5K」，≥ 80% 触发 emergency 覆盖。AILI 不复制这些数字，只消费 `shouldInject`。
- vendored `upstream/billion-context-pi`（0.1.34，adapted）的主管线在 `context` 事件内 `processTurn` + nudge 注入 + `session_before_compact` 全量取消；evaluator 复用同一 `entriesToCoreMessages` / `estimateTokens` / `resolveConfig`（含 `ACP_MODEL_CONTEXT_LIMIT` env > adapter `modelContextLimit`（合并用户 `~/.pi/acp.json`）> `ctx.getContextUsage().contextWindow` > 150K 回退）与 token 优先序（真实 usage > chars/4 估算）。
- vendored dist 由 tsup 打包（acp-kernel 内联）；在 vendored 目录内 `npm ci && npm run build` 重建后必须删除其 `node_modules`，否则其中安装的第二份 `@earendil-works/pi-coding-agent` 会与仓库根的 Pi 形成 dual-instance 类型/运行时冲突（已实测）。
- 首次观察只建立基线不触发（重启后安全降级）；压力失败/压缩失败只清 in-flight，不动 ACP 基线，由 kernel 自身的 lastNudgeShown/growth cadence 防风暴。
- 参考材料：`AILI-Pi_Subagent_优化与上下文压缩方案.md` 第六节（本变更取代其中 60/75/85 分档与 forceRelief 提案的第一版范围）与用户提供的《Unify Context Pressure Timing Across Providers》第一版设计稿。
