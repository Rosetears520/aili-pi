# AILI Compact

AILI Compact 是 Pi Session 之上的可逆上下文投影层。Pi JSONL/tree 始终是 append-only source of truth；AILI 只追加带版本的状态交易，并在 provider request 之前决定哪些原始消息、工具结果或摘要进入 provider context。它不删除或重写原始 Session，也不创建第二份 raw-conversation sidecar。

> 当前状态：本文描述本仓库本地 BUILD 中的 cooperative recovery（目标 `v0.1.14`）与 v3 lifecycle（目标 `v0.2.0`）。根包版本仍是 `0.1.13`；live provider、production overflow、candidate/version 和 release gate 未完成前，不应把这些目标版本写成已发布能力。

## Recovery：AILI 与 Pi 协作，而不是取消 Pi

`session_before_compact` 只有两种合法结果：

- 完整验证后的 `{ compaction: CompactionResult }`；
- JavaScript `undefined`，把 checkpoint、native summary 和 overflow retry 的最终控制权交回 Pi。

AILI 不返回 `{cancel:true}`、`null`、partial/error envelope，也不会把 planner、quality、index 或 provider serializer 失败伪装成成功。manual、threshold 与 overflow 都遵循同一条 deterministic-first / native-fallback 原则；AILI disabled 时不规划、不写 attempt cache，并对每次 hook 返回 `undefined`。

恢复不依赖另一个正常 agent turn：

| Surface | 行为 |
|---|---|
| Pi `/compact` | host-owned manual checkpoint；AILI enabled 时先尝试 deterministic coverage，失败就返回 `undefined`。它不会获得 native-only permit。 |
| `/aili-compact rescue` | idle 时只调用公开 `ctx.compact()` 一次，调用 `sendUserMessage()` 零次；策略为 deterministic-first。 |
| `/aili-compact rescue native` | 同样只调用一次 `ctx.compact()`、不创建正常 turn；只为下一次 exact matching manual hook 建立 one-use `NativeOnlyCompactPermit`。 |
| `/aili-compact rescue status` | read-only；不写 Session、不发消息、不调用 compact。 |
| `/aili-compact compress [focus]` | 创建一次性的 `ManualCompactPermit` 并启动一个短 agent turn，允许最多一次 semantic `aili_compact`；它不调用 `ctx.compact()`。 |

`CheckpointCoordinator` 以 session/branch/epoch/request 为边界管理 `idle`、`scheduled`、`invoking`、`inFlight`、`awaitingEpoch` 和 terminal states。一个 pressure cycle 最多进行一次 semantic attempt 和一次 checkpoint invocation，避免重复 suffix、callback/event race 或 repeated settle 触发 compaction storm。

### `compaction.enabled=false` 仍归用户所有

bootstrap/install/refresh 不再新增或刷新 `compaction.enabled=false`，也不会把历史上无 ownership marker 的 `false` 改回 `true`。这种值按 user-owned、provenance `unknown` 处理。

- `false` 会让 Pi 的 automatic threshold/overflow 通常不到达 Extension hook；
- Pi manual `/compact` 与 AILI enabled 时公开 manual rescue 仍走 host manual path；
- 要恢复 Pi automatic compaction，由用户自行编辑 `~/.pi/agent/settings.json`：

```json
{
  "compaction": {
    "enabled": true
  }
}
```

`/aili-compact off` 是独立的 append-only AILI control：它不改 Pi settings、不删除 journal；provider projection 返回原输入，AILI hook 返回 `undefined`，Pi `/compact` 仍由 host 处理。

## Public controls

主要命令为：

```text
/aili-compact context [offset] [limit]
/aili-compact stats
/aili-compact sweep [limit]
/aili-compact manual [on|off|status]
/aili-compact compress [focus...]
/aili-compact rescue [native|status]
/aili-compact decompress [one|raw] <b-ref...>
/aili-compact recompress <b-ref...>
/aili-compact cache [panel on|off]
/aili-compact prompt [reload]
/aili-compact on
/aili-compact off
/aili-compact restore-all
/aili-compact doctor
```

`context` 默认 `offset=0`、`limit=32`，上限 64；`sweep` 默认 8、范围 1..16。`manual` 只控制 semantic compression permission，与 `autoCooling` 独立。`restore-all` append 一个 explicit-user control，停用当前 epoch 的 semantic blocks 并关闭 automatic cooling；它不删除摘要或 raw source，自动 lifecycle 也不能悄悄撤销它。

模型侧有六个固定 surface：

- `aili_compact`：`range`、`message`、`blocks` 三种模式；新 v3 T1 每个交易对应一个 exact safe range，`blocks` 接受 2..16 个 current v3 block refs；
- `aili_decompress`：1..16 个 current block refs，可选 `depth:"one"|"raw"`；
- `aili_prune`：只处理完整、已消费且满足保护规则的 tool-result atoms；
- `aili_search_context`：只读 current-branch exact search；
- `aili_compact_status`：发布 current catalog、safe ranges、blocks、quality/index/recovery diagnostics；
- `aili_context_recap`：读取 active summaries，不恢复 raw source。

Mutator 必须是当前 assistant message 的 sole tool call，并使用当前 `catalogId`；`mNNNNNN`、`bNNNNNN` refs 只在其 branch/epoch/catalog scope 内有效。

## Safe ranges、token economics 与 quality gate

### Complete protocol atoms

AILI 先把 provider-visible history 分成完整 protocol atoms。默认 recent tail 同时满足：

- newest 8 个 whole atoms；
- 至少 `min(12000, floor(0.10 * contextWindow))` estimated tokens。

如果 context window 不可用，使用完整 12,000-token fallback，不发明更小的 cap。跨 token boundary 的 tool-call/result atom 整体保护；unfinished turn、incomplete/malformed protocol、binary/secret/protected atom 和 newest user message 始终 hard-protected。

`aili_compact_status` 返回 maximal contiguous safe ranges，包括 exact refs、catalog/scope/source digests、token bounds 和 exclusion counts。提交的 range 或 message set 必须精确等于同一 catalog 下的一条 recommendation；source 变化、scope 变宽/变窄、跨 protected atom 或 stale digest 都以 `source-summary-scope-mismatch`/stale 类错误 fail closed，不会在 summary 写好后静默过滤 source。

### Conservative token economics

字符数只用于诊断，不能授权 mutation。AILI 按 provider/model/estimator version 计算 source lower bound、replacement upper bound、one-time upper cost、guaranteed steady-state savings 和 break-even turns。replacement 包括 recap wrapper、refs、topic/mode/tier/count、summary、lineage、suffix 与 provider overhead；one-time cost 包括 discovery、resent source、model output、tool call/result、quality surface、cache invalidation estimate 和 reserve。

默认 hard minima 为：

| Tier | `minSteadySavingsTokens` |
|---|---:|
| T1 | 256 |
| T2 | 512 |
| T3 | 768 |

`minSavingsRatio=0.20`；最大 break-even turns 为 `NORMAL=8`、`PRESSURE=4`、`FORCE_SEMANTIC=1`。`CHECKPOINT_REQUIRED` 与 `OVERFLOW_RECOVERY` 不启动新的 semantic operation，而是进入 cooperative checkpoint recovery。unknown provider 使用宽 `1..8` bytes/token、message overhead `1..16`、tool-part overhead `4..64`，因此可能保守地判定 ineligible。

本地 serializer boundary 使用 Pi 的 OpenAI Completions/Responses、Anthropic Messages 与 Google Gemini converter 来冻结计量 surface；这不发送 provider request。真实 tokenizer、billing 和 cache semantics 仍以 provider-reported usage 为准。

### Local fail-closed quality

`quality.enabled=true` 为默认值。runtime 在精确解析 refs 后冻结 source，自己构建 versioned manifest，并在 append 前本地检查 goals/constraints、decisions、artifacts/symbols、failures/blockers、verification、open work、protocol provenance 等事实。caller 不能提交自制 manifest。

span 使用 JavaScript UTF-16 half-open offsets；normalization 是 Unicode NFC 加 CRLF/CR 到 LF，不 trim、不 collapse whitespace、不 case-fold。hard fact 丢失、完成状态矛盾、stale durable ref、malformed surrogate、unknown version、extractor/evaluator error 都会让整个 mutation fail closed。错误只返回版本、tier、bounded codes/counts 与 refs，不回显 source body、secret 或 raw fact text。这个 gate 不做隐藏 provider call，也不声称可以证明完整 semantic equivalence。

显式 expert override `quality.enabled=false` 会显示在 doctor/transaction metadata 中；缺少 accepted quality evidence 的新 block 不能用于 deterministic checkpoint coverage。

## v3 tiered lifecycle

新写入使用 closed tagged union `aili.compact.tx.v3`，共有 `semantic-create`、`decompress`、`recompress`、`cooling`、`control` 五个 payload arms。所有状态变化 append-only；parent activation 与 child deactivation 由 reducer 原子派生，caller 不能提交 state booleans。

| Tier | Exact source |
|---|---|
| T1 | 一个 contiguous、atom-aligned safe raw-message range |
| T2 | 2..16 个 active、contiguous、parentless T1 children |
| T3 | 2..16 个 active、contiguous、parentless T2 children |
| T3 restill | 2..16 个 T3 children，rank 仍为 T3 |

Lineage 只由 IDs、tier/rank、epoch、ordered recursive leaf digest/count、contiguity、transaction identity、cycle 与 single-active-parent validation 证明；`summary.includes(child.summary)` 或文本相似度不是 lineage proof。projector 只显示 maximal active nodes，不会同时显示 parent 与 descendant。

T3 restill 默认启用，阈值为 `minChildren=2`、`minSourceTokens=8000`、`minSavingsTokens=1024`、`minSavingsRatio=0.25`、`maxSummaryTokens=3000`、`minTurnsSinceCreate=8`。v1/v2 blocks 保留为 maximal legacy leaves，但绝不能作为 v3 child；唯一升级方式是 explicit legacy decompression，随后对暴露的 exact safe raw messages 创建新 T1。

### Decompress、recompress 与 restore-all

- `depth:"one"` 是 v3 parent 默认行为：原子停用 parent，并恢复 immediate children。
- `depth:"raw"` 接受 1..16 个不重叠 roots；用 child IDs 与 recursive digests 计算 unique closure。closure 包含 roots，最多 256 blocks；T1 raw 会恢复原始 messages。
- legacy v1/v2 decompression 保持 raw-leaf 行为。
- `recompress` 只重新激活 exact previously decompressed parent；leaf digest、child closure、tier、quality、projection version 与 explicit-decompression provenance 必须不变，并且不能产生 overlapping active parent。它不会生成或修改 summary。
- `restore-all` 的 explicit-user state 高于 cooling、age、index rebuild、calibration、quality migration 与 automatic promotion；只有用户明确请求且 provenance 完整的 recompression 才能恢复 prior parent。

Persisted custom/native `CompactionEntry.id` 成为新 epoch。旧 epoch blocks 派生为 inactive/query-only，不能 project、repair、decompress、recompress 或成为新 parent，但 unchanged Session history 仍可用于 bounded archived metadata 和 current-branch source search。

## Legacy repair、迁移与 old-binary rollback

P0 repair 使用独立 `aili.compact.repair.v1`，不是 v1/v2 semantic/control variant。每个交易包含 1..16 个 deterministic ordered evidence objects，并绑定 exact branch、epoch、source digest、GC replay provenance、lineage 与 later-state digest。planner 先把候选分为 eligible/ineligible，再批处理；replay 在 fresh state 上全量复验并 all-or-none apply。repair entry 不包含 source text，也不重写旧 Session。

`session_start`、`session_tree` 与 fork/leaf activation 会先完成 selected branch snapshot、semantic/repair replay、permitted repair append、fresh replay 和 reduce/project validation，再发布 provider projection、catalog 与 doctor state；branch 在过程中移动会放弃旧 activation 并重来，任何 invariant failure 都启用 bounded diagnostic 加 exact raw fail-open。

迁移顺序是 readers before writers：

1. 保留 v1/v2 readers 与 append-only byte prefix；
2. 先启用 repair/v3 reader、reducer、projector 与 fail-open；
3. 再启用 v3 writes、tiering、index/cooling；
4. 通过 copied-session、fork/epoch、rollback 与 candidate gates 后才允许 version/release mutation。

回滚不会删除 repair、v3 transaction 或 `CompactionEntry`。旧 runtime 可能 ignore/reject standalone repair entry；pre-v3 binary 也可能 ignore/reject v3 custom state，并从 unchanged raw history 重建较旧投影。它无法保证理解 v3 summaries，可能重新暴露 raw source。需要退回旧 binary 时，应先在受控副本中演练；若旧版本恢复 exclusive cancellation，先关闭 AILI 或以 no-extensions Pi 启动，再执行 host native `/compact`。不要通过重写/删除 JSONL 来“清理” v3。

## Provider suffix、cache 与 performance

动态 pressure/catalog/action guidance 不再写入 dynamic system prompt。AILI 在最终 context projection 后最多追加一个 transient provider-only message：

```text
role=custom
customType=aili-compact-provider-suffix
display=false
timestamp=0
```

它最多 2,048 characters / 512 estimated tokens，在 `NORMAL` 且无 action 时省略。它不会进入 Session JSONL、refs、search、source coverage 或 migration output；每次 request 都重新构建。它仍计入 token economics 和 `suffixFingerprint`/`fullProviderInputIdentity`。

Cache diagnostics 明确区分：

- `staticSurfaceIdentity`：provider/model + byte-exact static system/tools/immutable guidance；
- `logicalProviderPrefixIdentity`：AILI projector 的 pre-suffix logical provider messages；
- `suffixFingerprint`：exact suffix 或 `none`；
- `fullProviderInputIdentity`：logical prefix + branch/epoch/projection + suffix。

logical identity 不是 provider private cache key。只有 provider-reported usage 才能算实际 cache hit；相同 logical/full identity 而无 usage 不能报 hit。`/aili-compact cache` 的 current Session totals 与 AILI repeated-request stability 仍是两个独立 section。

### BranchIndex 与 pure fallback

`BranchIndex` 以 session/path/branch/epoch/replay version 为 scope，维护 entries、protocol atoms、v1-v3 blocks/lineage、refs、alignment fingerprints、token subindexes 与 canonical digests。same-branch append 可 incremental update；branch/epoch/session mismatch 或 ancestry proof 失败触发 cold rebuild。任何 malformed ID、digest、lineage、catalog 或 index/oracle mismatch 都把 index 标记 unhealthy，并使用 pure reducer/catalog/projector 或 exact-input fail-open；index 永远不是 Session 可读性的单点依赖。

固定性能 contract 是 algorithmic evidence，不是 wall-clock/heap 保证：10K cold build、same-branch append、100K scoped ref lookup、LRU=4 与 structural-record bounds 必须通过 deterministic counters 和 pure-oracle equality；duration/heap 只记录比较环境。当前本地 BUILD 已由 registered Extension production entry 通过固定种子 10K-message/100K-reference、pure-oracle equality、scan tripwire、D=1 append、fault fail-open、fork/epoch、LRU=4 与 sanitizer 门禁，脱敏结果在 `artifacts/test-results/aili-compact-lifecycle-performance.json`。这只证明当前实现绑定的 deterministic production-entry contract；在 0.2.0 candidate/version/provenance 绑定重新运行前，不能扩张成 candidate、live provider 或通用 wall-clock/heap PASS。

### Exact result-only cooling profiles

Cooling 只允许替换 tool result body；assistant tool call、IDs/name、result role/status、sibling order 与 protocol metadata 始终保留。age/grace 自身不是 consumption evidence，必须有 later successful settled provider request 观察过 exact result identity。

| Profile | Default policy |
|---|---|
| `retrieval` | `read/grep/find/ls/web/fetch/get/search/diagnostics` 等 exact names；至少 2 个 later observed turns，latest equal result 保持 raw。 |
| `execution-evidence` | `bash/test/build`；success 至少 3 个 observed turns；error 即使超过 5-turn floor 仍必须有 same-identity explicit durable resolution。 |
| `mutation-evidence` | `edit/write/fix/apply/apply_patch`；automatic cooling 默认关闭。 |
| `protocol-control` | `aili_*`、`task`、`hub`、session/control surfaces；永不 automatic cooling。 |
| `unknown` | unmatched/malformed tool；keep raw。 |

Project override 必须是 exact tool name，只能选择 named profile 或收紧阈值；wildcard 与削弱 protocol/secret/binary/incomplete/current-turn/open-failure protection 的值会被拒绝。durable `task`/`hub` refs 在 result、later messages、quality、tier/checkpoint coverage 或 open work 任一 surface 出现时都是 hard protection；cooling stub 不能充当 deterministic checkpoint semantic coverage。

## Configuration and diagnostics

配置从 global `~/.pi/agent/aili-compact.jsonc` 与 project `.pi/aili-compact.jsonc` 读取，project 覆盖 global；AILI 不创建或迁移这些文件。关键 defaults：

```jsonc
{
  "enabled": true,
  "manualMode": false,
  "autoCooling": true,
  "planning": { "enabled": true },
  "quality": { "enabled": true, "warningPolicy": "record" },
  "providerSuffix": { "enabled": true, "maxChars": 2048, "maxTokens": 512 },
  "protection": {
    "preserveRecentAtoms": 8,
    "preserveRecentTokens": 12000,
    "preserveRecentTokenCapRatio": 0.10,
    "preserveLastUserMessage": true
  },
  "tiers": {
    "enabled": true,
    "restill": {
      "enabled": true,
      "minChildren": 2,
      "minSourceTokens": 8000,
      "minSavingsTokens": 1024,
      "minSavingsRatio": 0.25,
      "maxSummaryTokens": 3000,
      "minTurnsSinceCreate": 8
    }
  },
  "index": { "enabled": true, "snapshotLru": 4 }
}
```

`planning.enabled=false` 只关闭 automatic safe-range discovery/recommendation/attempt、promotion/restill 与 proactive suffix；它不关闭 manual mutation/restoration、hard protection、quality、BranchIndex correctness、P0 checkpoint/native fallback/rescue/overflow。`maxBlockAge` 仍可解析但仅产生 `config-deprecated:maxBlockAge`，绝不因 age 停用 top-level semantic coverage。

`/aili-compact doctor` 会分别报告 reducer/repair/reference/projection/quality/token economics/calibration/suffix/index/checkpoint/coordinator/epoch/cache 状态。provider behavior、effective setting override、native origin 或 extension order 无法由公开 evidence 证明时必须显示 `Unverified`，不能由 registration 或 config value 推导为 PASS。

## Independently authored prior-art boundary

本设计只把 `ranxianglei/opencode-acp@v1.14.3`、commit `00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb` 作为行为比较参考。AILI Compact 的 Pi JSONL append-only、可逆 DAG、branch/epoch、公开 hook、native fallback 与 fail-open 实现均在本仓库独立编写；没有授权或采用该参考项目的 source、prompt、schema、fixture、test、documentation text 或 asset。

这是一条文档级 provenance 边界，不代表 candidate package 的 provenance/SBOM/notices 已更新。那些产物仍须在单独授权的 version/candidate 阶段重新生成并验证。

## 仍属 Unverified / 未授权

在对应 evidence 与单独授权完成前，以下不是 PASS：

- official Pi 0.82.1 production `AgentSession` 的 real context-length overflow、persisted checkpoint、original-request retry 与 continued work；
- OpenAI、Anthropic、Google Gemini 三个 family 的 live suffix role、tokenization、quality、cache 与 threshold/native behavior；
- long T1→T2→T3→T3 restill human quality review；
- controlled third-party context handler 在 AILI 前/后两种注册顺序，以及 unknown third-party order；
- copied real-session migration、old-binary rollback 与 disposable-HOME candidate rehearsal；
- 0.2.0 candidate 绑定后的性能重跑、live TUI resize/status；
- package version/lock/provenance/SBOM/candidate mutation，以及 commit、push、tag、publish、release。

Fake-provider、local converter、unit/integration 或 synthetic `CompactionEntry` evidence 只能证明本地 state/return contracts，不能替代这些 live gates。
