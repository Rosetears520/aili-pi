## Why

当前 Pi `0.82.1`/`0.83.0` 的公开 Extension surface 支持两种安全结果：AILI 在 `session_before_compact` 中返回一个完整验证的 `CompactionResult`，或返回 JavaScript `undefined` 让 Pi 使用活动 Agent runtime 完成原生摘要、持久化、epoch 重建和 overflow retry。公开 surface 不提供绑定活动 `ModelRuntime`/`streamFn` 的 extension-owned summary operation，也不提供可去重的 continuation receipt 或可证明阻断每次 provider dispatch 的 veto。

因此，本 change 不再追求 AILI-only summary ownership。它改为强化当前可实现的 cooperative contract：AILI 优先复用已接受的 semantic coverage 形成 deterministic checkpoint；任何 disabled、ineligible、stale、invalid 或 exception 路径都精确 fall through 到 Pi native recovery。成功必须由持久化的 `CompactionEntry`/新 epoch 证明，不能由 tool completion、callback 或 provider-only guidance 冒充。

目录 ID 保留为历史 change identity；它不再表示“删除 Pi native fallback”，而表示删除不可实现的 AILI-only 假设，并把 emergency recovery 收敛到 Pi 已公开的接口。

## What Changes

- checkpoint ownership 固定为 cooperative/hybrid：AILI deterministic-first，Pi native final recovery。
- manual、threshold、overflow、Pi `/compact` 和 `/aili-compact rescue` 共用 exact total return matrix：完整 `{ compaction }` 或 JavaScript `undefined`；不得返回 cancel、partial envelope 或 false success。
- `activeBlocks=0`、coverage gap、protocol split、quality/source mismatch、stale tuple 和 planner exception 都返回 `undefined`；AILI 不在 hook 内新增 secondary provider summary request。
- AILI 可依据 `getContextUsage()`、保守 estimate、host reserve 和 pressure policy 在 idle/`agent_settled` 边界主动调用一次公开 `ctx.compact()`。90% 可作为不可上调的 proactive observation threshold，但不是当前公开 API 无法证明的 per-dispatch zero-request firewall。
- persisted `session_compact`/新 epoch 是 durable checkpoint success 的权威事实。`fromExtension=true` 且 AILI details 可验证时记录 deterministic origin；`fromExtension=false` 时记录 Pi native origin；无法安全判断时保持 `Unverified`。
- overflow retry/continuation 完全由 Pi 拥有。AILI 观察 `willRetry`，但不调用 `sendMessage()`/`sendUserMessage()` 合成 continuation，也不承诺不存在公开 receipt 时的 exactly-once 语义。
- 每个 session/branch/epoch/pressure cycle 仍最多调度一次自动 checkpoint；不新增三次 retry 命令或第二套 continuation ledger。
- provider-only suffix 继续保持 transient、bounded、epoch/state-consistent 和 non-authoritative；不可执行的 action 不得被广告为可执行。
- Session JSONL/tree 保持 append-only，不写 raw-conversation sidecar，不迁移或重写既有 CompactionEntry。
- 配置继续使用 canonical `checkpoint.mode="hybrid"`、`deterministic=true`、`nativeFallback=true`、`autoRescue=true`。运行时只读解析；不执行 `aili-only` 或 HOME 配置迁移，不修改 official Pi settings。
- branch/tree summary 继续由 Pi 的公开原生路径拥有；AILI 只在生命周期事件后重建自己的 branch/epoch 状态。

## Capabilities

### New Capabilities

- `aili-compact-emergency-checkpoint`: 在 Pi 公开 Extension seam 上协调 proactive checkpoint、deterministic-first/native-fallback arbitration、persisted-epoch success、pressure-cycle dedupe 和 truthful status。

### Modified Capabilities

- `aili-compact-checkpoint-recovery`: 保留 AILI 与 Pi 的 mandatory cooperative recovery backend、exact custom-or-undefined hook matrix、Pi host retry 和 production `AgentSession` evidence。
- `reversible-context-compression`: 细化 transient guidance、durable checkpoint origin 和 post-checkpoint usage 的 truthful status，不改变既有 command/config ownership。

## Impact

- Runtime scope: `src/runtime/aili-compact/` 的 hook arbitration、pressure coordinator、persisted epoch/origin、provider suffix 和 doctor/status；预计复用现有实现，仅在契约测试发现偏差时做 bounded 修正。
- Test scope: custom-or-undefined matrix、empty catalog native fallthrough、one-attempt-per-cycle、callback/event races、custom/native persisted epoch、host overflow retry、suffix truth、append-only/session isolation 和 hybrid config no-write。
- Compatibility: 使用 Pi `0.82.1` 已公开的 common subset；Pi `0.83.0` source evidence显示该 subset仍存在，但本 change 不安装或升级 Pi，也不把 source-only evidence冒充运行验证。
- Non-goals: 不新增 provider adapter、raw-prefix model summarizer、synthetic continuation、pre-dispatch private hook、Pi fork/private API、dependency/lockfile/version/settings/HOME 变更，也不授权 Git、install、publish 或 release 操作。
