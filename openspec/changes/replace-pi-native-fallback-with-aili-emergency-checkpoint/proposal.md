## Why

[已知｜用户目标] AILI Compact 启用时，所有上下文摘要内容都应由 AILI 生成。Pi 只保留公共会话基础设施职责：持久化 AILI 提供的 `CompactionEntry`、按 `firstKeptEntryId` 重建上下文、切换 epoch，以及在成功 checkpoint 后执行既有 overflow retry。Pi 不应再以 `fromHook:false` 生成原生摘要。

[已知｜真实 Session 调查] 对一个已脱敏 WSL Session fixture 的只读检查得到：

- Session 共 336 条 entry，只有 1 条 `CompactionEntry`，其 `fromHook:false`、`tokensBefore:283631`，没有 AILI checkpoint；
- 所有已检查的 `aili_compact_status` 都报告 `activeBlocks=0`，当前 Session 没有成功提交的 AILI semantic block 或 AILI custom transaction；
- 三次 `aili_compact` 分别以两次 `source-summary-scope-mismatch` 和一次 `pressure-stage-disallows-semantic` 结束；对应 provider usage 从 255601 增至 255753、从 263931 增至 264782、从 264782 增至 265074，没有发生压缩；
- 这些逻辑拒绝以普通、`isError:false` 的 tool result 结束，使“工具调用完成”容易被误判成“压缩已提交”；
- 唯一一次 Pi native compaction 曾把下一次真实 provider usage 从 283631 降到 50596，随后长会话又增长至约 278656。这证明 Pi checkpoint 能重建并缩减上下文，问题不是 Session 无法缩减，而是 AILI 从未提供可持久化的 checkpoint envelope。

[已知｜代码链路] AILI semantic compact 当前只在 Pi `context` hook 中替换下一次发给 provider 的 message projection；Pi `getContextUsage()` 则以最近一次 assistant usage 加原始 trailing messages 估算占用。因此 semantic transaction 即使成功，也要到下一次 provider 响应后才可能刷新占用。只有持久化 `CompactionEntry` 才会重建 Pi 当前上下文。现有 `planEmergencyGc()` 名称具有误导性：它只能截短已存在的 old-generation summary，不能从原始前缀生成摘要、不能处理 `activeBlocks=0`，也不会创建 checkpoint。

[根因｜现有 fallback] `autoRescue` 只是调用公共 `ctx.compact()`。`session_before_compact` 在完整 deterministic coverage 不可用时返回 JavaScript `undefined`，随后由 Pi native summarizer 生成摘要。它是 Pi fallback，不是 AILI fallback。若只禁止该路径而不新增 AILI emergency checkpoint，overflow 将在 `activeBlocks=0` 时停住且无法 retry。

因此需要把“Pi native fallback”替换为真正的“AILI emergency checkpoint”，并以 durable checkpoint 与真实 provider token 降幅定义成功，而不是以工具调用返回定义成功。

## What Changes

- **BREAKING — AILI-only summary ownership:** AILI Compact 启用时，manual、threshold、auto-rescue 和 overflow 的摘要内容只能来自 AILI。`session_before_compact` 只能返回一个完全验证的 AILI compaction envelope，或明确取消并报告失败；不得以 `undefined` 静默进入 Pi native summarizer。
- 新增 AILI emergency checkpoint planner。它在 `PRESSURE` 阶段提前冻结一个最大安全旧前缀、完整 protocol atoms、保留尾部和 source digest，并为候选生成不可变 `planId`/scope digest；模型只提交该候选的 summary，不再重新抄写容易失效的 range refs。
- emergency planner 必须支持 `activeBlocks=0`：从当前 epoch 的原始可丢弃前缀创建首个受质量校验的 semantic coverage，并立即形成 checkpoint candidate，而不是要求已有 old-generation block。
- 成功的 semantic candidate 应尽快触发一次公共 `ctx.compact()`；AILI 在 hook 中返回包含 exact cut、`tokensBefore`、summary、coverage identity 和 `details.ailiCompact.kind="emergency-checkpoint"` 的 envelope。Pi 持久化后的 entry 必须为 `fromHook:true`，随后重建上下文并允许原有 overflow request retry。
- AILI-owned摘要生成必须继承当前 session 的 provider、model、auth、headers、env、retry 与 `transport`，包括已配置的 SSE。BUILD 前必须重新确认 Pi 0.82.1 的公共能力；若 hook 内无法通过公共 API 安全调用同一 provider，则必须在 `CHECKPOINT_REQUIRED` 前预生成 candidate，或先取得上游公共 seam，禁止依赖 private API、修改 `node_modules` 或创建 Pi fork。
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
- Tests/evidence：从上述真实 Session 制作脱敏、仓库内 copied-session fixture；覆盖 `activeBlocks=0`、scope stale、PRESSURE 预生成、manual/threshold/overflow、SSE、AILI provider failure、一次 retry、reload/tree/fork、append-only byte prefix、`fromHook:true`、零 Pi summary provider call，以及首次 post-checkpoint usage 显著低于 `tokensBefore`。原始 Session 和任何敏感文本不得进入仓库。
- Compatibility：这是对已接受 cooperative/native-fallback recovery 契约的有意覆盖，必须新增 capability delta、design、tasks、test plan、migration 与 release gates，并顺序验证与 `fix-aili-compact-recovery-deadlock`、`redesign-aili-compact-lifecycle` 的合并规格。
- Non-goals：本 proposal 不实现广义指标面板、不删除历史、不改变 Pi CLI、不引入 Pi fork/private API、不修改 dependency/lockfile/version/settings/HOME，也不授权 Git、publish 或 release 操作。
