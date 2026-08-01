## Why

本独立提案的目标是：AILI Compact 启用时，所有上下文摘要内容都由 AILI 生成。Pi 只保留公共会话基础设施职责：持久化 AILI 提供的 `CompactionEntry`、按 `firstKeptEntryId` 重建上下文、切换 epoch，以及在成功 checkpoint 后执行既有 overflow retry。Pi 不应再以 `fromHook:false` 生成原生摘要。本提案本身不证明其已被接受或实现。

一份未附在本提案中的脱敏 WSL 会话诊断记录曾报告以下现象。由于本提案不包含可复核的源会话或独立验证记录，下列计数、token 数值和运行时状态不能单独作为验收或完成依据：

- 诊断记录报告仅观察到 Pi 原生生成的 `CompactionEntry`，其 `fromHook:false`，且未观察到 AILI checkpoint；精确 entry 数和 `tokensBefore` 未在本提案内复核；
- 已检查的 `aili_compact_status` 快照据报均为 `activeBlocks=0`，但本提案不把该外部运行时快照视为持续成立的当前状态；
- 多次 `aili_compact` 据报以 `source-summary-scope-mismatch` 或 `pressure-stage-disallows-semantic` 结束，未形成 durable checkpoint；精确调用次数和 provider usage 变化仍需可复现证据；
- 这些逻辑拒绝据报会以普通、`isError:false` 的 tool result 结束，因此“工具调用完成”不能作为“压缩已提交”的依据；
- 诊断记录还报告一次 Pi native compaction 后的 provider usage 明显下降。该现象只能支持需要验证 durable checkpoint 重建路径的假设，不能在缺少可复核证据时证明具体降幅或根因。

起草时的代码链路检查表明，AILI semantic compact 只在 Pi `context` hook 中替换下一次发给 provider 的 message projection；Pi `getContextUsage()` 则以最近一次 assistant usage 加原始 trailing messages 估算占用。因此 semantic transaction 即使成功，也要到下一次 provider 响应后才可能刷新占用。只有持久化 `CompactionEntry` 才会重建 Pi 当前上下文。起草时检查到的 `planEmergencyGc()` 只能截短已存在的 old-generation summary，不能从原始前缀生成摘要、不能处理 `activeBlocks=0`，也不会创建 checkpoint。这些实现事实必须在 BUILD 前按目标版本重新确认。

本提案基于以下待 BUILD 前复核的根因判断：`autoRescue` 只调用公共 `ctx.compact()`；`session_before_compact` 在完整 deterministic coverage 不可用时返回 JavaScript `undefined`，随后由 Pi native summarizer 生成摘要。该路径属于 Pi fallback，而不是 AILI fallback。若只禁止该路径而不新增 AILI emergency checkpoint，预计 overflow 会在 `activeBlocks=0` 时停住且无法 retry。

因此需要把“Pi native fallback”替换为真正的“AILI emergency checkpoint”，并以 durable checkpoint 与真实 provider token 降幅定义成功，而不是以工具调用返回定义成功。

## What Changes

- **BREAKING — AILI-only summary ownership:** AILI Compact 启用时，manual、threshold、auto-rescue 和 overflow 的摘要内容只能来自 AILI。`session_before_compact` 只能返回一个完全验证的 AILI compaction envelope，或明确取消并报告失败；不得以 `undefined` 静默进入 Pi native summarizer。
- 新增 AILI emergency checkpoint planner。它在 `PRESSURE` 阶段提前冻结一个最大安全旧前缀、完整 protocol atoms、保留尾部和 source digest，并为候选生成不可变 `planId`/scope digest；模型只提交该候选的 summary，不再重新抄写容易失效的 range refs。
- emergency planner 必须支持 `activeBlocks=0`：从当前 epoch 的原始可丢弃前缀创建首个受质量校验的 semantic coverage，并立即形成 checkpoint candidate，而不是要求已有 old-generation block。
- 成功的 semantic candidate 应尽快触发一次公共 `ctx.compact()`；AILI 在 hook 中返回包含 exact cut、`tokensBefore`、summary、coverage identity 和 `details.ailiCompact.kind="emergency-checkpoint"` 的 envelope。Pi 持久化后的 entry 必须为 `fromHook:true`，随后重建上下文并允许原有 overflow request retry。
- AILI-owned摘要生成必须继承活动 session 的 provider、model、auth、headers、env、retry 与 `transport`，包括已配置的 SSE。BUILD 前必须重新确认 Pi 0.82.1 的公共能力；若 hook 内无法通过公共 API 安全调用同一 provider，则必须在 `CHECKPOINT_REQUIRED` 前预生成 candidate，或先取得上游公共 seam，禁止依赖 private API、修改 `node_modules` 或创建 Pi fork。
- 一个 session/branch/epoch pressure cycle 仍只允许一次自动 emergency attempt。AILI provider/transport、质量或持久化失败后允许一次明确的 `/aili-compact rescue retry`；再次失败必须保持原始 Session 可恢复、报告 bounded error，并停止而不是调用 Pi native summarizer或自动循环。
- 修正成功语义：`aili_compact` 的 scope、pressure、quality 和 transaction 拒绝必须暴露 `ok:false`/明确 warning；只有 durable semantic transaction 或 `fromHook:true` checkpoint 才能显示“压缩成功”。
- 修正占用语义：checkpoint 落盘后、首次 post-checkpoint assistant usage 到达前，UI 应显示 `rebuilding/unknown`，不得继续展示旧的高水位作为压缩后占用；首次真实响应必须展示新的 provider usage。Provider-only semantic projection可展示为“待 checkpoint 的 projected reduction”，但不得冒充 durable context reduction。
- 保持 Session JSONL/tree append-only，不删除、覆盖或搬移原始消息，不创建 raw-conversation sidecar。这里的“清空前文”仅指旧前缀不再进入当前 provider context，并由 checkpoint 切换到新 epoch。

## Capabilities

### New Capabilities

- `aili-compact-emergency-checkpoint`: AILI-owned raw-prefix emergency planning、summary generation、quality/coverage validation、checkpoint envelope、strict no-native failure policy、一次显式 retry，以及 durable/token-reduction success semantics。

### Modified Capabilities

- `aili-compact-checkpoint-recovery`: 将 deterministic-or-Pi-native cooperation 改为 AILI-only summary ownership；Pi 仅持久化 AILI envelope、重建 epoch 与执行成功 checkpoint 后的 overflow retry。
- `reversible-context-compression`: 明确 provider projection、durable checkpoint 和 raw append-only Session 三种状态；修正 tool completion 与 compression success 的语义。

## Impact

- Runtime：`src/runtime/aili-compact/` 中 safe planning、mutations、quality、projection、compaction、recovery、provider suffix 与 command wiring，以及 `src/runtime/index.ts` 的 doctor/status 集成。
- Public behavior：`/aili-compact rescue native` 移除或永久拒绝；新增 `/aili-compact rescue retry`；checkpoint 配置需要表达 `aili-only` ownership，并迁移/诊断旧的 `hybrid`/`nativeFallback:true` 配置。
- Host contract：Pi 仍是 `CompactionEntry`/SessionManager/epoch/overflow-retry 的唯一公共基础设施所有者，但不再生成摘要。任何所需的 provider/transport seam 必须来自 Pi 公共 API。
- Tests/evidence：使用具备明确来源且经批准的脱敏仓库内 copied-session fixture，或使用能够复现同一状态的合成 fixture；覆盖 `activeBlocks=0`、scope stale、PRESSURE 预生成、manual/threshold/overflow、SSE、AILI provider failure、一次 retry、reload/tree/fork、append-only byte prefix、`fromHook:true`、零 Pi summary provider call，以及首次 post-checkpoint usage 显著低于 `tokensBefore`。原始 Session、不透明运行时标识和任何敏感文本不得进入仓库；没有可复核 fixture 时，精确运行时结论保持未验证。
- Compatibility：本提案会有意替换 cooperative/native-fallback recovery 契约，必须新增 capability delta、design、tasks、test plan、migration 与 release gates，并顺序验证与 `fix-aili-compact-recovery-deadlock`、`redesign-aili-compact-lifecycle` 的合并规格。
- Non-goals：本 proposal 不实现广义指标面板、不删除历史、不改变 Pi CLI、不引入 Pi fork/private API、不修改 dependency/lockfile/version/settings/HOME，也不授权 Git、publish 或 release 操作。
