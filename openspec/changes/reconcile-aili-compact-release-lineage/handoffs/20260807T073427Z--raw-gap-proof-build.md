---
schema_version: "1.0"
snapshot_id: "20260807T073427Z--raw-gap-proof-build"
task_root: "openspec/changes/reconcile-aili-compact-release-lineage"
status: "finalized"
created_at: "2026-08-07T07:34:27.738249Z"
finalized_at: "2026-08-07T07:38:05.887217Z"
language: "zh-CN"
continues_from: null
continues_from_sha256: null
content_sha256: "182f68c7ff136a94b48dd74aa2c96c41cdfe1fcfd58a30a25c26670448d931dd"
---
# Session Handoff: raw-gap-proof-build

Snapshot ID: `20260807T073427Z--raw-gap-proof-build`

## Goal

继续 `@rosetears/aili-pi@0.2.0` 的正式 BUILD，先完成并证明 AILI Compact raw-interval transparent-gap 方案：T1 保持严格 raw provider ordinal 连续；T2/T3/restill 只可跨越完整、可从 immutable branch 独立重放验证的 AILI-owned `aili_compact_status` / `aili_compact` planning protocol。完成任务 2.8、2.9 后，再恢复 controlled-production T1→T2→T3→restill、release evidence 和候选发布验证。

本快照的第一优先级不是新增设计，而是审查当前磁盘上已经出现但尚未验证、尚未正式收口的 gap-proof 实现，补齐测试，确认 planner、pure replay、BranchIndex replay 三条路径严格一致。任何失败先定位根因，不得以放宽 exact contiguity、跳过 replay 或修改 fixture 隐藏问题。

## Contract References

- Change root：`openspec/changes/reconcile-aili-compact-release-lineage/`。
- 最终测试计划：`openspec/changes/reconcile-aili-compact-release-lineage/test-plan.md`。当前状态已经改为 raw-interval gap-proof revision accepted；2026-08-07 acceptance record 已勾选。
- 任务表：`openspec/changes/reconcile-aili-compact-release-lineage/tasks.md`。任务 1.18 已完成；2.8、2.9、3.5、4.1–4.4 仍未完成，2.5、2.7 也尚未正式勾选收口。
- 当前进度：`openspec/changes/reconcile-aili-compact-release-lineage/progress.txt`。末尾新增 “Raw-interval gap-proof final test plan accepted; BUILD resumed”。
- 设计：`openspec/changes/reconcile-aili-compact-release-lineage/design.md`。
- 核心生命周期 delta spec：`openspec/changes/reconcile-aili-compact-release-lineage/specs/aili-compact-tiered-lifecycle/spec.md`。
- 安全规划 spec：`openspec/changes/reconcile-aili-compact-release-lineage/specs/aili-compact-safe-planning/spec.md`。
- Release gate：`openspec/changes/reconcile-aili-compact-release-lineage/release-gates.md`。
- Drift：`openspec/changes/reconcile-aili-compact-release-lineage/drift-log.md`，仅记录真正的 spec deviation、trade-off、unresolved assumption；不要当作进度日志。

已接受的 raw-gap 合同：

1. Raw branch provider-message interval 是唯一 authoritative persisted coordinate；不得恢复 dynamic semantic ordinal registry。
2. T1 message source 必须精确、按 raw provider ordinal 连续；`non-contiguous-source` 不得削弱。
3. Block promotion 仅可跨越完整、well-formed 的 AILI-owned planning protocol；ordinary message、第三方工具、incomplete、malformed、unknown、mixed gap 全部 fail closed。
4. Proof shape 固定为 `TransparentPromotionGapV1 { version: 1, leftChildBlockId, rightChildBlockId, leftLeafEntryId, rightLeafEntryId, messageCount, gapDigest }`。
5. 每个 parent 最多 15 个 gap proofs；每个 gap message count 必须有上限。
6. Planner preflight、pure reducer replay、BranchIndex replay 必须各自从 immutable raw slice 重新解析、重算 endpoint/count/digest/classification；transaction 声明不能自证。
7. Parent raw hull 可宽于 semantic `leafCount`；recursive leaf order/count/`v3ParentLeafDigest` 只包含真实 semantic leaves，不包含 planning protocol。
8. 已经合法的 raw `+1` strict-adjacent v3 parent 无需 proof，必须继续可读。

## Scope Boundary

本轮已授权范围：

- 仓库本地 production code、focused tests、OpenSpec progress/task 更新和非破坏性验证。
- 任务 2.8：共享 fail-closed promotion-gap classifier，以及 status/mutation parity。
- 任务 2.9：closed v3 proof schema/parser/state，planner/pure replay/BranchIndex replay 独立验证，legacy raw-`+1` compatibility。
- gap-proof 通过后，运行最小 controlled AgentSession/Persistent focused matrix；不要自动扩大到发布操作。

不在授权范围：

- 任何 provider、network、外部 authentication 或第三次 live capture。
- 安装、依赖增删、`package-lock.json` 或版本变更。
- commit、push、tag、merge、npm publish、GitHub release。
- 删除、移动或清理既有文件；仓库有大量用户/前序 Agent 改动，必须全部保留。
- 改变 public contract、architecture、verification strategy、permission/security semantics。发现此类需求时记录 `BUILD_MATERIAL_DISCOVERY`，停止 affected work 并返回 DEFINE。
- 直接 handler、手工 transaction 注入或 synthetic artifact 不能代替 official-Pi production-entry controlled evidence。

## Completed/Pending/Blocked

已完成：

- Verified predecessor、candidate `0.2.0` identity、installed rollback rehearsal、两个 OpenAI-only boundary captures、optional LSP/Markdown Preview removal、Persistent controlled-production component等前序工作已记录在 change artifacts。
- Official Pi null-root repair已存在：null 只允许真实 cold-build root 或 empty-index first append，later null fail closed。历史 focused branch-index 16/16 与 typecheck 曾通过，但不是当前最终树的新鲜证明。
- Safe planning source ordinal split 已存在：omitted AILI protocol 的 effective-ordinal gap 会拆分 safe ranges；历史 focused safe-planning 13/13 曾通过。
- Quality identity 已缩到 exact selected messages/anchors；历史 quality-source + safe-planning 16/16 与 typecheck 曾通过。
- Persistent controlled artifact `artifacts/test-results/controlled-production/persistent-agent-production.json` 历史状态为 PASS。
- 用户已于 2026-08-07 明确接受最新 raw-interval gap-proof `test-plan.md` 并恢复仓库本地 BUILD。接受已写入 `test-plan.md`、`tasks.md`、`progress.txt`。

当前磁盘观察到但尚未证明完成的实现：

- 新文件 `src/runtime/aili-compact/promotion-gaps.ts` 已存在，定义 version 1、max 15 proofs、max 256 gap messages、`classifyTransparentPromotionGaps` 和 canonical digest。
- `src/runtime/aili-compact/v3.ts` 已包含 `V3BlockSource.transparentGaps?`、closed key parser、`invalid-promotion-gap`、`promotionGapEntries` transition context、apply-time proof recomputation和 raw-`+1` no-proof compatibility。
- `src/runtime/aili-compact/v3-mutations.ts` 已在 block planner 中从 `promotionGapEntries` 分类并将 proofs 写入 source；preflight 调用 apply path。
- `src/runtime/aili-compact/reducer.ts` 已把 current-epoch pre-transaction entries 交给 block replay。
- `src/runtime/aili-compact/branch-index.ts` 已把 indexed prefix entries 交给 `applyV3Transaction`。
- `src/runtime/aili-compact/index.ts` 已把 epoch entries 交给 planner，并让 `v3LifecycleStatus` 使用同一 classifier 形成 structural promotion groups。
- 这些代码是在实现子任务派发后出现在当前磁盘上的；Task adapter返回 cancelled，未提供 terminal implementation report。不得因此视为已完成或已验证。

未完成：

- 没有发现测试中出现 `transparentGaps`、`invalid-promotion-gap`、`promotionGapEntries` 或 classifier 的匹配；focused gap-proof tests 很可能尚未加入。
- 当前 gap-proof implementation 未运行 typecheck、focused Vitest 或 diff check。
- 任务 2.8、2.9 尚未勾选；production AgentSession 尚未证明 T1→T2→T3→restill。
- `artifacts/test-results/controlled-production/aili-compact-agent-session.json` 尚不存在或尚未证明 PASS。
- Release validator/schema/sanitizer/index 仍需按 real-boundary vs controlled-production evidence classes 收口；任务 3.5、4.1–4.3 未完成。
- 发布操作 4.4 尚未授权。

当前 blocker：不是产品决策；是实现来源未收口且无测试/验证证据。先审查现有 implementation，再补测试和运行 focused verification。

## Evidence Anchors

- `src/runtime/aili-compact/promotion-gaps.ts:4-6`：version、15-proof limit、256-message limit。
- `src/runtime/aili-compact/promotion-gaps.ts:36-96`：classifier；根据 provider-message list 和 child raw ordinals切片，拒绝 overlap、endpoint mismatch、oversize、non-transparent atom、non-AILI message，并生成 proofs。
- `src/runtime/aili-compact/promotion-gaps.ts:98-107`：digest 当前绑定 version、raw ordinal、entry ID 和 message body。
- `src/runtime/aili-compact/v3.ts:87-91`：block source 的 `transparentGaps?`。
- `src/runtime/aili-compact/v3.ts:250-259`：transition context 的 immutable `promotionGapEntries`。
- `src/runtime/aili-compact/v3.ts:310-315`：closed-schema keys。
- `src/runtime/aili-compact/v3.ts:842-920`：block semantic-create apply path；child order/overlap、gap proof、leaf count/digest、raw hull overlap。
- `src/runtime/aili-compact/v3.ts:1240-1312`：proof parser、reclassification、pair structure与 exact equality。
- `src/runtime/aili-compact/v3-mutations.ts:324-423`：planner block path；classification和 proof persistence。
- `src/runtime/aili-compact/reducer.ts:206-307`：pure replay用 current-epoch prefix重新验证 block proof。
- `src/runtime/aili-compact/branch-index.ts:946-990`：indexed replay把 pre-transaction entries传给 apply。
- `src/runtime/aili-compact/index.ts:1411-1420`：production planner context。
- `src/runtime/aili-compact/index.ts:2382-2421`：status structural promotion grouping使用共享 classifier。
- `tests/unit/aili-compact-v3-mutations.test.ts`、`tests/unit/aili-compact-v3.test.ts`、`tests/unit/aili-compact-v3-reducer.test.ts`、`tests/unit/aili-compact-branch-index-v3.test.ts`：建议的 focused test owners；恢复时先确认当前内容，不要假设测试不存在。
- `tests/integration/aili-compact-agent-session.test.ts`：最终 controlled T1→T2→T3→restill owner。
- `artifacts/test-results/controlled-production/persistent-agent-production.json`：历史 Persistent controlled PASS component。
- `artifacts/test-results/aili-compact-live-v2.json`：真实 OpenAI limitation evidence；必须保持 truthful NON_PASS/limitations，不得改写。
- 当前分支在交接时为 `fix/quota-animation-subagent-label`；worktree 极度 dirty，包含大量 tracked modified/deleted 与 untracked files。必须重新运行 `git status --short --branch`；本快照不能代替当前 Git 真相。

## Decisions

- 不制造 `v0.1.14`；release target 是 `0.2.0`，predecessor 是 verified `0.1.16`。
- 不要求 Claude/Gemini credentials 或三-provider live matrix；OpenAI/Anthropic/Gemini serializer/protocol 由 offline deterministic tests 覆盖。
- 两次 OpenAI capture 只证明 official-Pi transport/order、exact parent task、zero parent Bash、completed child lifecycle等外部边界；未自然诱发的 suffix/overflow/sandbox-marker/tiering 保持 limitation。
- Deterministic official-Pi production-entry tests 负责 suffix/non-persistence、overflow/checkpoint/retry/later work、sandbox marker、tier lifecycle。
- `@narumitw/pi-lsp` 与 `pi-markdown-preview` 完全移除；`pi-cache-optimizer` 保留。
- T1 strict raw source contiguity不变；promotion transparency 只用于完整 AILI planning protocol。
- Dynamic semantic ordinals 已被 controlled production证明会漂移：persisted T1 `[16,27]` 后来映射为 derived semantic `[12,23]`，下一范围 `[24,35]` 导致 overlap；因此已明确拒绝 semantic ordinal registry。
- 选择 raw intervals + replay-verified proofs，已写入最新 accepted final test plan。

## Open Questions/Risks

1. **实现归属与完整性未验证。** 当前 gap-proof files已出现，但 cancelled Task没有报告。必须逐文件检查最终内容、diff和测试，不能假设实现完整。
2. **测试缺口。** 当前 content search没有在 tests 下找到 proof/classifier关键词；可能完全无新 tests，也可能测试使用了其他命名。先检查 owner files。
3. **Pure/index epoch parity。** Pure reducer传 current-epoch slice；BranchIndex传 `entriesThroughOrdinal(internal, record.ordinal - 1)`。需要证明该函数在 compaction epoch 后不会把旧 epoch provider messages混入 ordinal recomputation。
4. **Classifier completeness。** 必须测试 assistant tool-call和matching toolResult完整配对；incomplete caller/result、mixed tool calls、unknown tool、ordinary assistant/user、hard-protected atom、atom跨越 gap boundary都应拒绝。
5. **Closed parser negatives。** unknown field/version、empty proof array on raw gap、proof on strict-adjacent pair、duplicate/non-adjacent pair、wrong endpoint、zero/oversized count、wrong digest、>15 proofs均应拒绝。
6. **Status/mutation parity。** Status不得推荐 mutation随后拒绝的 group；直接提交 status未推荐的 forged group必须无 append并 fail closed。
7. **Semantic invariants。** Parent `firstLeafOrdinal`/`lastLeafOrdinal`取最外 child raw hull；`leafCount`是child semantic counts之和；`v3ParentLeafDigest`只含child leaf digests。Protocol不得进入 summary、quality source或 recursive digest。
8. **Legacy compatibility。** Strict raw `+1` children没有 proof时必须 pass；如果附带空 array或多余 proof，按closed contract验证预期并锁定测试。
9. **Controlled fixture成本。** 旧 fixture曾在16 T1后首次达到T2。不要恢复64-T1慢路径或改变economics阈值掩盖结构问题。
10. **Freshness。** 以前的16/16、13/13、typecheck和Persistent PASS均不是 gap-proof current-tree completion evidence。

## Verification State

- 最新 fresh DEFINE evidence：raw-gap revision曾通过 `openspec validate reconcile-aili-compact-release-lineage --strict`、repository five-stage sequence、scoped `git diff --check`；这些证明的是合同，不证明当前 runtime implementation。
- 本会话只记录了 test-plan acceptance并创建handoff；没有运行 gap-proof typecheck或 tests。
- 当前 production implementation状态：`Unverified`。
- 当前 controlled Compact AgentSession状态：NON_PASS/未完成；不得声称 T2/T3/restill 已通过。
- 当前 Persistent controlled component：历史 PASS，但下一会话若依赖最终候选声明应按 affected claim重新判断是否需要刷新。
- 建议最小验证顺序：
  1. 针对 parser/classifier/planner/pure/index新测试运行单个或最小 Vitest集合。
  2. `npm run typecheck`。
  3. focused `tests/integration/aili-compact-agent-session.test.ts` 与 `tests/integration/persistent-agent-production.test.ts`。
  4. 只有 focused结果支持时才扩大到 test-plan section 6 的 broader checks。
- 最小建议命令候选：
  - `npx vitest run tests/unit/aili-compact-v3.test.ts tests/unit/aili-compact-v3-mutations.test.ts tests/unit/aili-compact-v3-reducer.test.ts tests/unit/aili-compact-branch-index-v3.test.ts`
  - `npm run typecheck`
  - `npx vitest run tests/integration/aili-compact-agent-session.test.ts tests/integration/persistent-agent-production.test.ts`
- 如果首个 focused run失败，只允许一次root-cause repair/recheck；不要连续猜测式修改fixture。

## Next Action

从当前磁盘重新检查 `promotion-gaps.ts`、`v3.ts`、`v3-mutations.ts`、`reducer.ts`、`branch-index.ts`、`index.ts` 和四个 focused unit test owners，建立一张“contract requirement → implementation symbol → test case”对照。保留符合accepted contract的现有代码，补齐缺失测试或修复真实不一致，然后先运行最小四文件 Vitest集合。测试通过且typecheck通过后，更新 `progress.txt`；只有完整满足2.8/2.9时才勾选对应tasks并运行controlled AgentSession。

## Forbidden Actions

Do not infer contract, permission, Git truth, verification, completion, publication, or destructive authority from this handoff.

## Touched Files / Artifact References

本会话明确写入：

- `openspec/changes/reconcile-aili-compact-release-lineage/test-plan.md`：状态改为accepted，2026-08-07 acceptance record勾选。
- `openspec/changes/reconcile-aili-compact-release-lineage/tasks.md`：state改为BUILD resumed，任务1.18勾选。
- `openspec/changes/reconcile-aili-compact-release-lineage/progress.txt`：追加accepted BUILD resumed记录。
- 当前handoff snapshot及`handoffs/LATEST.md`由session-handoff helper管理。

当前磁盘上观察到的gap-proof implementation files：

- `src/runtime/aili-compact/promotion-gaps.ts`
- `src/runtime/aili-compact/v3.ts`
- `src/runtime/aili-compact/v3-mutations.ts`
- `src/runtime/aili-compact/reducer.ts`
- `src/runtime/aili-compact/branch-index.ts`
- `src/runtime/aili-compact/index.ts`

这些production files不是本handoff会话手工编辑的；由于subagent被取消且未返回报告，修改来源、完整性和验证状态均需下一会话重新确认。

## Subagent Activity

- 曾派发一个fresh `implementer`，目标是任务2.8/2.9、production code和focused tests。
- Task adapter返回 `cancelled`，没有terminal report、files-changed list或verification result。
- 派发后磁盘出现了上述gap-proof implementation，存在partial-write可能。
- 不得resume旧task ID，也不得引用旧task授权。若下一会话判断重新委托有明确收益，必须创建全新的single-use task，并明确禁止覆盖用户改动。

## Blocker / Stop Reason

用户主动要求在切换模型/会话前创建详细handoff，因此停止继续实现。当前不是等待产品决策；最新final test plan已经接受。唯一执行阻点是需要下一会话重新审查partial implementation并建立fresh tests/typecheck证据。

## Suggested Next-Session Prompt

从精确的不可变 handoff 快照 `openspec/changes/reconcile-aili-compact-release-lineage/handoffs/20260807T073427Z--raw-gap-proof-build.md` 恢复。它只用于导航，不是合同、权限、Git 真相、验证或完成证据。先重新验证当前 repository root、worktree、branch/HEAD、dirty 状态、权限、合同、附件和引用证据，并简要重述当前 scope；遇到冲突或 Unverified 项立即停止受影响工作，然后只从快照的 Next Action 继续。
