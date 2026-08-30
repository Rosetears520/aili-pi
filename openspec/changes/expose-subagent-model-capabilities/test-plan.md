# 测试文档：expose-subagent-model-capabilities

## 0. 文档元信息

- 来源：本 change 的 `proposal.md`、capability spec、`design.md`、`tasks.md`；当前 persistent-Agent runtime/tests；官方 Pi 0.84.4 model/extension API 文档
- 生成时间：2026-08-29
- 适用版本 / 分支：当前 `aili-pi` dirty 工作树；官方 Pi 0.84.4
- 状态：accepted；用户已授权 repository-local BUILD（2026-08-29）

## 1. 被测对象、目标与边界

- 被测对象：Parent-turn Subagent Model Catalog、当前轮 model/thinking/CLI 授权摘要、model-only omitted-thinking 解析、共享 preflight、默认 Pi/显式外部 CLI 路由、Herdr nested CLI runner、AILI-owned ACP delegation retirement 与 `SUB_*` 错误。
- 要支持的完成 / 接受 claim：父代理能在首次 `sub` 调用前看到当前可用模型能力但不会把可见性当作授权；只换模型不指定 thinking 时使用目标模型默认值；未指定 CLI 始终使用 Pi；明确指定 CLI 时才在 Herdr Pi Agent 中执行 help-first 非交互调用；`acp_delegate*` 不再与 `sub` 竞争；authority/backend/role 不兼容在 durable allocation 前失败，CLI executable/help/runtime 阻塞在已授权 Herdr Pi turn 中明确失败。
- In scope：纯 catalog projection、`before_agent_start` 注入、model/thinking/CLI authority、`sub.cli` schema、atomic backend preallocation、Herdr immutable runner modifier、deterministic probe helper、fake CLI fixtures、billion-context factory lock-disable/source-dist parity、文档和非浏览器测试。
- Explicitly not run / out of scope：真实 provider/vendor CLI 请求、真实 CLI login/auth/help、credential command、远程 catalog refresh、AILI-authored 用户 HOME 配置变更、Browser/E2E、真实 Herdr pane 启动、外部 CLI 原生 Driver/TUI/session resume、视频/ASR、依赖/lockfile、Git/publish/release。
- 适用假设：Pi 0.84.4 installed types/API 为 BUILD 基线；configured-auth/available 只表示本地可选，不证明请求时 provider 成功。

## 2. 需求 / 决策 / 风险追踪

| 需求 / 决策 / 风险 | 来源 | 任务 / Package | 文件 / Artifact | 验证命令 / 检查 | 证据 | 覆盖状态 |
|---|---|---|---|---|---|---|
| 只显示当前 scope 内 available+authenticated models | spec catalog requirement；D1 | 1.2, 2.1 | catalog projection + unit fixtures | focused catalog tests | canonical ids、thinking、modality、scope fixtures | Planned |
| Catalog 可见不等于授权 | spec authority requirement；D3 | 1.2, 1.3, 2.3, 3.1–3.2 | `input` provenance + authority/injection tests | model-authority focused tests | only `interactive|rpc` input creates one-turn authority | Planned |
| 每个 Parent 用户轮次刷新一次，不做网络 refresh | spec catalog lifecycle；D2 | 3.1, 3.2 | `before_agent_start` fixtures | production integration tests | first call visible、next turn refresh、same turn stable | Planned |
| model-only 不继承 Parent xhigh | user decision；selection spec；D4 | 1.1, 4.1–4.3 | model-selection fixtures | `persistent-agent-model-selection.test.ts` | GLM uses isolated-child Pi medium+clamp default and `model-default` source | Planned |
| 默认不等于最高等级 | user decision；D4 | 4.1, 4.2 | GLM/xhigh/max/non-reasoning/setting-leak fixtures | focused resolver tests | medium is clamped by target capability; max is not chosen merely because it is highest; file-backed Parent settings do not leak | Planned |
| managed/Herdr 同一冻结 loadout | selection spec；D5 | 1.3, 5.1 | preflight/backend tests | backend + production integration tests | canonical model/thinking/source/speed/loadout inputs equal | Planned |
| stale catalog 零分配失败 | spec dispatch requirement | 5.1 | coordinator fixtures | sub/coordinator tests | no Agent/job/turn/pane/process allocation | Planned |
| 错误码单次出现并提供可复制纠正示例 | spec errors；D5 | 5.2 | error fixtures | focused `SUB_*` tests | supported levels + current-turn wording | Planned |
| modalities 不冒充 ASR/tools | spec modality requirement；D6 | 2.1, 5.3 | negative capability fixtures | projection/policy tests | catalog never claims MP4/ASR; definitive result waits for preflight tool policy | Planned |
| 目录有界且无敏感信息 | spec bounded output；D1/D7 | 2.2, 3.2 | renderer/redaction tests | large catalog + secret canary fixtures | stable truncation, zero canary leak | Planned |
| 无第二 catalog/tool/authorization owner | proposal non-goals；D2/D7 | 3.2–3.3, 8.3 | source inventory | static owner scan + full suite | no `sub_models`, no tool re-registration/persistence | Planned |
| 未指定 CLI 默认 Pi | external CLI spec；D9/D10 | 7.1–7.3 | schema/authority/backend fixtures | `persistent-agent-external-cli.test.ts` | no `cli` means unchanged Pi path; prior value does not stick | Planned |
| 只有当前用户可选择外部 CLI | external CLI spec；D9 | 7.1, 7.2 | explicit/ambiguous/unauthorized fixtures | authority + schema tests | full product phrase required; model cannot self-authorize | Planned |
| 显式 CLI 使用 Herdr 中的 Pi runner | external CLI spec；D10 | 7.3, 7.4 | backend/modifier/audit fixtures | backend + production tests | driver remains pi-cli; nestedCli separate | Planned |
| probe 必须 version→help 且有界 | external CLI spec；D11 | 7.5, 7.6 | fake executable matrix | local fake CLI tests | exact argv/order, 5s limits, 64 KiB cap, group cancellation | Planned |
| modifier 只允许 help-supported 非交互调用 | external CLI spec；D11 | 7.4, 7.6 | immutable prompt/loadout + fake help fixtures | modifier/backend tests | no install/login/bypass/interactive/resume guidance; uncertain mode blocks | Planned |
| 正常 HOME 与 vendor 网络边界明确 | user decision；D12 | 7.4–7.6, 8.1 | disclosure/audit/negative fixtures | docs + prompt + redaction tests | explicit CLI permits its normal auth/config/cache/network for task; AILI does not claim internal inspection | Planned |
| AILI-owned ACP delegation 永久关闭 | external CLI spec；D8 | 6.1, 6.2 | factory/user-config/tool/prompt inventory | context-runtime tests | delegate true cannot override factory false; compression remains | Planned |

## 3. 选定验证

| 条件 / Claim | 命令或直接检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| Resolver/default correctness | `npx vitest run tests/unit/persistent-agent-model-selection.test.ts tests/unit/persistent-agent-model-authority.test.ts` | 直接覆盖四种 model/thinking 组合及 authority | 不证明 provider 在线可调用 |
| Zero-allocation and backend equivalence | `npx vitest run tests/unit/persistent-agent-sub.test.ts tests/unit/persistent-agent-backends.test.ts tests/integration/persistent-agent-production.test.ts tests/integration/persistent-agent-runtime.test.ts` | 覆盖 preflight、durable state、managed/Herdr loadout 与 managed continuation 拒绝 | 不启动真实 Herdr pane |
| Dynamic Parent context | `npx vitest run tests/unit/persistent-agent-model-capabilities.test.ts tests/integration/persistent-agent-production.test.ts` | 检查 `input` provenance、前置可信 transform 保留 user source、normalized-digest one-shot correlation、后置 transform/handled/mismatch/abort/consecutive/steer/follow-up 清理、multi-handler `systemPrompt` chaining、幂等、轮次刷新 | 不证明所有模型会遵循提示文本 |
| External CLI workflow | `npx vitest run tests/unit/persistent-agent-external-cli.test.ts tests/unit/herdr-backends.test.ts` with repository-local fake executables | 覆盖默认 Pi、atomic Herdr routing、immutable modifier、version/help probe、缺失/ambiguous/oversized/hanging/auth-block/no-safe-mode、非黏连、structured probe audit 和 final-command model-reported evidence | 不证明 Pi 模型会正确解释每个真实 vendor help，也不证明服务可用 |
| ACP sole-delegation convergence | `npx vitest run tests/unit/context-upstream-inventory.test.ts tests/unit/context-provider-router.test.ts tests/integration/context-runtime-load.test.ts` plus source/dist parity inspection | 证明 package-owned ACP instance 不再注册 delegate，同时保留 context/compaction/compression | 不抑制用户独立安装的第三方 Extension |
| Security/privacy | secret canary、large-catalog、scope/auth/CLI negative fixtures；`npm run test:audit-redaction` | 验证 allow-list、sandbox/权限边界、错误脱敏 | 不证明远端 provider/vendor CLI 安全 |
| Type/package compatibility | `npm run typecheck`; `npm run validate:package`; `npm run validate:generated`; `npm run validate:provenance`; `npm run validate:compatibility` | 检测 Pi API/type drift 和生成/打包漂移 | 不授权发布 |
| Repository regression | `npx vitest run --no-file-parallelism`; `openspec validate expose-subagent-model-capabilities --strict` | 覆盖跨模块回归与 artifact 一致性 | 不执行 Browser、真实 provider 或真实 Herdr |

## 4. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|
| Unverified | configured-auth 模型的请求时 credential/provider 可用性 | 运行时仍可能失败 | 保留 provider-request revalidation；不在本 change 做真实调用 claim |
| Unverified | Claude Code/Gemini/Codex/OpenCode/Grok 各安装版本的真实非交互参数、认证状态、HOME/cache 写入和 vendor 网络/source 行为 | fake CLI 只能证明 probe/modifier contract | 每个新 Pi Agent 使用 bounded version/help；用户已接受正常 HOME，真实 vendor 行为须单独执行授权 |
| Unverified | 不同模型是否遵循“catalog 不等于授权”的提示 | 模型行为可能偏离 | 权限由 `input` provenance + preflight 代码强制，提示只改善选择质量 |
| Deferred | 大于 64 项 catalog 的交互式完整浏览 | 被截断模型不会自动展示 | 输出 omitted count 且禁止猜测；若实际需求出现再单独提案 read-only browser/tool |
| Deferred | MP4/audio/ASR 转写能力 | model modality 无法回答该能力 | 需要独立媒体工具/角色提案；本 change 只禁止 catalog 冒充 |
| Blocked before BUILD | 与两个旧 change 的 `subagent-model-selection` / preflight 范围重叠 | 并行实现会产生双合同 | 按 task 1.4 写回 supersession/dependency 后才能 BUILD |

## 5. Final acceptance gate

- [x] 用户明确接受最终测试计划（2026-08-29）
- [x] 用户另行授权 repository-local BUILD（2026-08-29）
- [ ] 真实 provider/vendor CLI、真实 Herdr pane、Browser/E2E 如需执行须另行授权

## 6. BUILD 验证证据（2026-08-29）

- 聚焦测试（66 通过）：`tests/unit/persistent-agent-model-selection.test.ts`、`persistent-agent-model-authority.test.ts`、`persistent-agent-model-capabilities.test.ts`、`persistent-agent-external-cli.test.ts`、`persistent-agent-sub.test.ts`、`persistent-agent-backends.test.ts`、`herdr-backends.test.ts`、`context-upstream-inventory.test.ts`、`context-provider-router.test.ts`；`tests/integration/context-runtime-load.test.ts`、`persistent-agent-production.test.ts`、`persistent-agent-runtime.test.ts` 随全量套件通过。
- 关键行为证据：GLM 5.3-flash 目标默认（medium→high clamp，不再继承父 xhigh / 不自动最高）；当前轮模型/thinking/CLI 授权捕获与 inherit-only 缺省；SUB_CLI_DENIED、SUB_CLI_MANAGED_CONTINUATION 在任何 Agent/job/turn/pane 分配前失败；runner modifier 哈希进入冻结 loadout 且不落盘原始 help；probe 矩阵含 64KiB 截断、凭据脱敏、挂起超时与 pre-abort；`applyUserConfig` 单调禁用 delegation；隔离子代理默认不泄漏父/项目 settings。
- 全量：128 文件 / 891 用例，888 通过、2 skip；1 个既有 `web-foreground-lifecycle` 就绪超时抖动在单文件复跑通过（与本变更无关）。
- 静态验证全过：typecheck、validate:package、validate:generated（21 角色 / 20 路由）、validate:provenance、validate:capabilities、validate:compatibility（40 记录）、doctor、audit-redaction。
- 未执行（未授权）：真实 provider/vendor CLI、真实 Herdr pane、Browser/E2E、依赖/lockfile、Git、publish/release。
