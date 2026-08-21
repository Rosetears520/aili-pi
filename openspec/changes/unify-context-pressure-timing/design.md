# Design: unify-context-pressure-timing

## D1. 决策专用 evaluator（vendored 窄 API）

`upstream/billion-context-pi/src/pressure-evaluator.ts` 导出 `createAcpPressureEvaluator(adapter?)`：

- 内部 `createRuntime(adapter)`，与主管线共用 `configFor`/`resolveConfig`（env > adapter（含用户 `~/.pi/acp.json` 合并，首个观察时按 session 应用一次）> `liveContextLimit` > 150K）与 token 优先序（`ctx.getContextUsage().tokens` > `estimateTokens` chars/4）。
- 每 session（`getSessionFile() ?? getSessionId()`）一份内存 `CompressionState`（`createInitialState()` 起），`processTurn({ messages, state, config, tokenCount, renderTags: "none" })` 只取 `turn.nudge` 映射为 `AcpPressureDecision { shouldRelieve, emergency, tier, usage, tokenCount, contextLimit, reason }`，保存 `turn.state` 供后续基线/cadence。
- 不落 `<session>.acp.json`、不注入 nudge、不 prune、不返回改写消息；`reset(ctx)` 重建基线。重启后首次观察只建基线（安全降级）。

选择 vendored 窄 API 而非在 AILI 侧重写转换/配置：避免两份 WHEN 漂移（用户设计稿第 10 节的明确要求）。

## D2. AILI 编排层

`src/runtime/context-pressure.ts` 的 `wireContextPressure(pi, { ownsCodexContext, evaluator, log? })`：

- `turn_end`：`ctx.model` 存在且 owner 为 codex 时 `observe(ctx)`；`shouldRelieve` 且无 in-flight → 置 in-flight，`ctx.compact({ onComplete/onError: 清 in-flight })`。观察点选 `turn_end` 而非 `context`：与 Pi 官方 `trigger-compact.ts` 示例一致，不在 provider 请求进行中打断。
- `session_before_compact` gate：`reason === "threshold"` 且 Codex owner → `{ cancel: true }`（manual/overflow/非 Codex/无 model → 放行）。gate 注册顺序必须在 codex-compact 之前（cancel 短路语义）。
- `session_compact`：Codex owner → 清 in-flight + `evaluator.reset(ctx)`。
- `session_before_switch` / `session_shutdown`：清 in-flight + reset（卫生性）。
- 一切 evaluator/compaction 异常只走 `log` 诊断，不破坏宿主管线。

`src/runtime/context-runtime.ts`：`acp(pi) → wireContextPressure(...) → codex(pi)`；`options.pressureEvaluator` 可注入（测试）。evaluator 与 ACP extension 同样的 `autoUpdate: false` 姿态。

## D3. 非 Codex 零改动

ACP 的 `context` 管线、nudge 注入、`compress` 工具、`session_before_compact` 全量取消在非 Codex owner 下原样保留；evaluator 不参与该路径。

## D4. 构建

vendored dist 重建：`cd upstream/billion-context-pi && npm ci && npm run build && rm -rf node_modules`（删除 node_modules 是必须的：否则其中第二份 `@earendil-works/pi-coding-agent` 会造成 dual-instance 类型冲突与运行时歧义）。

## D5. 明确不做

不自造 60/75/85 阈值；不复制 `decideNudge`；不做 ACP `forceRelief` / `pressureControl: external`；不做 checkpoint/continuation snapshot；不把 T2/T3 复制给 Codex（无 ACP block，天然不会触发）；不修改 `@narumitw/pi-codex-compact`；不新增依赖或 lockfile 变更。
