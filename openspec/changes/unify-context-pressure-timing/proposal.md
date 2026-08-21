## Why

[用户诉求|2026-08-21] 第一版统一压缩时机：WHEN 完全复用 `billion-context-pi` / `acp-kernel` 当前的 pressure/nudge 判定；HOW 继续按模型路由——Codex 会话交给 `pi-codex-compact`，其他模型保留 `billion-context-pi` 的模型驱动压缩路径。

[源码证据|已独立核实] 当前 `codex-remote-v2` 路由下没有任何自动压缩时机策略：ACP 的 context 管线在 Codex turn 上整体退出（ownership gate），Codex 侧只剩 Pi 内建 threshold 自动压缩与手动 `/compact`。两套 WHEN 并存时行为不可预期，且 Pi threshold 与 ACP 的 tier/growth 语义互不相通。

[源码证据|已独立核实] acp-kernel 0.0.19 的 `processTurn` 是纯函数并单独返回 `NudgeDecision { shouldInject, tier, breakdown.emergencyOverride, reason, contextUsage }`；`renderTags: "none"` 提供决策专用路径。Pi 0.84.2 的 `ExtensionContext.compact()`、`session_before_compact.reason (manual|threshold|overflow)` 与 `session_compact` 事件均为公开扩展面，且官方示例 `examples/extensions/trigger-compact.ts` 正是在 `turn_end` 上观察用量并调用 `ctx.compact()`。

## What Changes

- AILI 不重写任何阈值、不复制 `decideNudge` 算法：压力判定只来自 vendored `billion-context-pi` 新增的窄 API `createAcpPressureEvaluator()`（决策专用 processTurn 门面，内存态，不写 `<session>.acp.json`、不注入 nudge、不 prune、不返回改写消息）。
- Codex 路由（`codex-remote-v2`）在 `turn_end` 观察压力；`shouldInject` 为真且无 in-flight 时调用 `ctx.compact()`，由 `pi-codex-compact` 经 `session_before_compact (reason=manual)` 完成 Remote V2 压缩。
- 同一 epoch 内多次 `turn_end` 不得重复触发（in-flight 守卫）；任何成功的 Codex 路由压缩（压力触发或手动）后 `session_compact` 重置压力基线。
- Pi 内建 threshold 自动压缩在 Codex 路由上被拦截（`session_before_compact reason=threshold → {cancel:true}`，且该 gate 注册在 codex-compact 之前）；manual 与 overflow 放行，overflow 仍是最后安全兜底。
- 非 Codex 路由行为零改动：ACP 继续拥有 WHEN 与 HOW（nudge 注入、compress 工具、T1/T2/T3），其既有的 `session_before_compact` 取消逻辑不变。
- 观察失败只记录诊断，绝不猜测或强制压缩。
- 不修改 Pi 上游、不修改 `@narumitw/pi-codex-compact` 本体、不新增依赖、不做 ACP forceRelief / external pressure 模式、不自造 60/75/85 阈值、不做 checkpoint / continuation snapshot。

## Impact

- 新增 `src/runtime/context-pressure.ts`（AILI 拥有的编排层：turn_end 观察、in-flight 守卫、threshold gate、session_compact 重置）。
- `src/runtime/context-runtime.ts` 组装顺序改为 acp → pressure → codex（gate 必须先于 codex-compact 注册）。
- vendored `upstream/billion-context-pi/src/pressure-evaluator.ts` 新增并从 `src/index.ts` 导出；dist 用其自身 toolchain 重建（vendored 目录内 `npm ci && npm run build`，构建后移除其 node_modules 以维持单一 Pi 实例解析）。
- 治理面同步：`tests/unit/context-upstream-inventory.test.ts` 符号锚点、`manifests/provenance.json`、`THIRD_PARTY_NOTICES.md`。
- spec delta：MODIFIED `provider-routed-context-runtime` 的 "Compaction ownership is selected by provider"。
