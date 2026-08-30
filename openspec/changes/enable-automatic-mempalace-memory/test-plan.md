# 测试文档：enable-automatic-mempalace-memory

## 0. 文档元信息
- 来源：`proposal.md`、`design.md`、`specs/automatic-mempalace-memory/spec.md`、`tasks.md`、现有 observational-memory/MemPalace 源码与测试
- 生成时间：2026-08-28
- 适用版本 / 分支：当前 `aili-pi` 工作树；Pi 0.84.2 基线
- 状态：accepted（用户于 2026-08-28 明确要求继续实现）

## 1. 被测对象、目标与边界
- 被测对象：主动混合 Observer、token/高价值双触发、Parent MemPalace port、standing policy、压缩前 checkpoint、跨项目 recall 和有界状态生命周期。
- 要支持的接受 claim：自动记忆能在不要求用户说“记住”的情况下选择性提炼并通过 MemPalace 持久化/召回；不会按每个 run 调模型；不会修改任何压缩机制；失败不会产生虚假成功或替代存储。
- In scope：纯本地/假 MemPalace 自动化测试、现有 context/compaction 兼容性、权限、隐私、幂等、性能边界和文档检查。
- Explicitly not run / out of scope：默认不执行真实 MemPalace 写入、删除、mining、import、Palace 初始化；不做 Browser；不修改或重新验收压缩算法本身。
- 适用假设：真实自动外部操作只有在目标环境授予匹配 standing policy 后才启用；测试默认使用 fake port。

## 2. 需求 / 决策 / 风险追踪
| 需求 / 决策 / 风险 | 来源 | 任务 / Package | 文件 / Artifact | 验证命令 / 检查 | 证据 | 覆盖状态 |
|---|---|---|---|---|---|---|
| 主动但非逐 run Observer | spec: Proactive hybrid observation | 1.2, 2.1 | observational-memory scheduler/controller/extension | focused trigger tests | ordinary=0 observer; token/high-value=1 bounded batch | planned |
| source cutoff 不遗漏/不重复 | spec: Token-triggered observation | 1.1, 1.2 | ledger/source coverage | branch/out-of-order/retry tests | exact `coversUpToId` assertions | planned |
| 压缩前 checkpoint 且压缩零修改 | spec: Durable checkpoint; design D4 | 4.1, 4.2 | extension pre-compaction listener; existing context files unchanged | focused integration + task diff inspection | hook returns no replacement; compaction owner/output fixtures unchanged | planned |
| scoped standing authority | spec: Automatic operations authority | 3.1, 3.2 | MemPalace port/policy | fake MCP approval matrix | only search/checkpoint covered; destructive classes denied | planned |
| 全局可搜索、逻辑作用域 | spec: Globally searchable scope | 3.3, 4.3 | mapping/recall | cross-project fixture matrix | preference applies; foreign project decision reference-only | planned |
| 选择性、去重、冲突、重试 | spec: selective/idempotent | 2.2, 2.3, 3.1 | controller/port | candidate and ambiguous-completion tests | no pre-success commit or blind replay | planned |
| 有界 recall、当前证据优先 | spec: proactive recall | 4.3 | recall/context provider | budget/topic/cache tests | one search/injection per run; stable hash/omitted | planned |
| 无本地持久 cache/outbox | spec: bounded buffering | 4.4 | ledger/pending lifecycle | source inspection + lifecycle tests | IDs only; release on terminal paths; no filesystem writes | planned |
| body-free status/provenance | spec: controls | 5.1 | extension/status | redaction/static/runtime tests | no raw body/credential output | planned |

## 3. 选定验证
| 条件 / Claim | 命令或直接检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| 类型、触发、过滤、ledger、promotion、recall 行为 | focused Vitest memory suites | 直接覆盖确定性输入输出与失败路径 | 不证明真实 MemPalace 可用 |
| Parent port 与权限生命周期 | fake MemPalace integration suite | 可稳定模拟成功、拒绝、超时、ambiguous、重复和恢复 | 不证明远端版本的全部并发语义 |
| 压缩实现未改变 | task-scoped diff + existing context/compaction compatibility tests | 检测被禁止的源码修改、返回值/owner/fixture 漂移 | 不重新证明压缩质量 |
| 类型和包集成 | `npm run typecheck`; focused package/capability/doctor checks | 覆盖公开类型、打包入口和诊断声明 | 不代表运行时真实写入成功 |
| 仓库回归 | `npm test` | 覆盖记忆与现有 Herdr/Prompt/Web/context 交叉回归 | 不授权外部操作或发布 |
| 正式契约一致性 | `openspec validate enable-automatic-mempalace-memory --strict` | 检查 requirement/scenario/artifact 一致性 | 不等于用户接受或 BUILD 授权 |

## 4. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|
| Unverified | 当前 MemPalace release 的 checkpoint/search 返回 ID、ambiguous completion 和跨进程原子幂等细节 | live adapter/reconciliation | 实现前读取已安装 provider schema；fake port 保持保守契约；真实操作需另行授权 |
| Unverified | Pi 自动/手动压缩入口是否都等待同一 async pre-compaction hook | 完整 pre-compaction 覆盖 | 按 Pi 0.84.2 官方接口与现有 integration fixture 验证；不修改压缩实现补偿 |
| Open Question（不阻塞文案） | 初始 token 绝对值/ratio 和 recall token 预算 | 成本/召回量 | 先采用设计中的可配置保守默认，基于现有 context metadata 测试边界；不改变压缩阈值 |

## 5. Final acceptance gate
- [x] 用户明确接受最终测试计划（2026-08-28）
- [x] 用户授权该 change 的 repository-local BUILD（2026-08-28）
- [ ] 真实 MemPalace 自动外部操作在目标环境具备精确 standing policy；否则仅 fake-provider 验证并标记 live write `Unverified`

## 6. 执行记录（2026-08-28）

- 聚焦 memory/MCP/observer/extension/context 测试：PASS。
- `npm run typecheck`：PASS。
- capabilities/generated/package/compatibility/audit/doctor：PASS。
- `openspec validate enable-automatic-mempalace-memory --strict`：PASS。
- Fresh full suite（全部 review repair 后）：`npx vitest run --no-file-parallelism`，839 passed / 2 skipped，118 passed files / 2 skipped files。
- 默认并行 full-suite 曾分别出现两个与本 change 无关的既有时序 flaky；对应 focused rerun 均 PASS，顺序 full-suite PASS。
- Live MemPalace：`Unverified`，未执行。开发环境观察到 3.6.0，与接受的 3.7.0 不匹配；未安装或升级。
