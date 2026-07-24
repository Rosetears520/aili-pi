# 测试文档：fix-subagent-inline-sdk-compatibility

## 0. 文档元信息

- 来源：`proposal.md`、`design.md`、`specs/subagent-runtime-compatibility/spec.md`、会话 `019f8eff-9eb1-7c70-b18e-184006882500`、当前 Pi/subagent SDK 源码与既有测试。
- 生成时间：2026-07-23。
- 适用版本 / 分支：Pi 0.81.1、`@agwab/pi-subagent@0.4.8`、当前 `fix/quota-animation-subagent-label` 工作树中的新独立 change。
- 状态：`implemented / local verification passed / live provider evidence unverified`。用户于 2026-07-24 授权仓库内实现和重复本地测试；真实 provider/credential live probe、dependency/lockfile、全局安装、Git 和发布仍未授权。

## 1. 被测对象、目标与边界

- 被测对象：AILI `subagent` wrapper 的 backend 参数兼容适配、显式 inline 诊断、权限/安全语义保持及 live/release evidence。
- 要支持的完成 / 接受 claim：普通省略/`auto` backend 的 single/parallel subagent 在 pinned runtime 上不再进入损坏 inline 初始化；显式 backend 和 authority boundaries 保持；release evidence 真实覆盖 shipped default。
- In scope：`src/runtime/subagents.ts`、subagent unit/integration/live tests、revision-bound live/release manifest/validator、README/troubleshooting、必要 provenance 描述。
- Explicitly not run / out of scope：真实 provider/credential live probes、dependency/lockfile、commit/push/publish/install；permission-mode matcher实现由另一个 change管理。
- 适用假设：pinned upstream 0.4.8 的 explicit headless 路径仍是当前兼容基础；该假设必须由 focused fixture 和单独授权 live probe 分层验证。

## 2. 需求 / 决策 / 风险追踪

| 需求 / 决策 / 风险 | 来源 | 任务 / Package | 文件 / Artifact | 验证命令 / 检查 | 证据 | 覆盖状态 |
|---|---|---|---|---|---|---|
| SUBCOMP-1 omitted/auto single/parallel 使用兼容 backend | spec Req 1；design D1 | 2.1, 3.1, 3.2 | `src/runtime/subagents.ts`、unit/integration fixtures | focused Vitest；检查 result backend | single/parallel 都记录 `headless`，无 raw create error | implemented |
| SUBCOMP-2 显式 backend 意图与 inline 诊断 | spec Req 2；design D1 | 2.1, 2.3, 3.1 | wrapper + unit fixtures | backend matrix fixture | headless/tmux/visible/sandbox 不漂移；inline 在模型前给 actionable error | implemented |
| AUTH-1 mode/tool/credential/non-recursion 不弱化 | spec Req 3；design D2 | 2.2, 3.2, 3.3 | wrapper、credential guard、generic integration fixtures | focused integration + seeded credential scan | `PI_PERMISSION_MODE` 保留；credential denied；child 无 subagent | implemented locally；live credential probe unverified |
| EVID-1 shipped default 必须被 live/release evidence 覆盖 | spec Req 4；design D3 | 4.1, 4.2 | `tests/integration/live-subagent.test.ts`、`manifests/live-verification.json`、release validator | separately approved live probe + `npm run validate:release` | probe 省略 backend、记录 backend/哈希、0 business-file changes | unverified — 需实现后单独授权 |
| DEP-1 不擅自改 dependency/lockfile | spec Req 5；design D4 | 1.2, 5.2 | `package.json`、`package-lock.json`、final diff | scoped diff inspection | dependency declarations与lockfile无 task-owned diff | implemented |
| RISK-1 renderer/executor backend 不一致 | design Risks | 2.2, 3.1 | wrapper renderer/execute | unit parity fixture | 两路径接收同一 effective backend | implemented |
| RISK-2 headless 无 UI 时权限误放宽 | design Risks | 3.2, 3.3 | permission forwarding fixtures | non-default mode env fixture + denied-path fixture | forwarded explicit mode；缺失/ask 仍 fail closed | implemented |
| RISK-3 parallel task selector混用导致 plain sibling回落 inline | BUILD evidence；design D1 | 2.1, 3.1 | compatibility planner + unit fixture | visible+plain / visible+sandbox / plain+sandbox matrix | 仅不可表达的 visible+plain 组合 pre-start fail closed | implemented |
| RISK-4 sandbox backend正确但 provider auth/egress不可用 | BUILD headless sandbox attempts | 3.1, 3.3, 4.1a | sandbox fixture + live evidence | deny-all sandbox failure remains visible | 不误报 inline fix或 provider readiness | implemented / live unverified |

## 3. 选定验证

| 条件 / Claim | 命令或直接检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| 参数适配与显式 backend 行为正确 | `npx vitest run tests/unit/subagents.test.ts tests/integration/generic-subagent.test.ts` | 直接覆盖 wrapper、fake Pi argv/env、lifecycle 和安全回归 | 不证明真实 provider/auth 可用 |
| TypeScript/整体受影响测试无回归 | `npm run typecheck`；`npm test` | 覆盖公开 schema、现有 integrations 与编译契约 | 不证明 TUI 或外部 provider 行为 |
| 默认真实路径可用 | `AILI_LIVE_GENERIC_SUBAGENT_PROBE=1 npx vitest run tests/integration/live-subagent.test.ts`，仅在单独批准后 | 使用真实 Pi/auth，且必须省略 backend、记录 effective backend | 不授权写业务文件、凭据读取或其他 provider 操作 |
| release evidence 不能 false PASS | `npm run validate:release`；manifest/hash inspection | 验证 default-path probe、backend 与 revision hashes 的绑定 | 不代表 publish/release 已获准 |
| OpenSpec/包边界完整 | `openspec validate fix-subagent-inline-sdk-compatibility --strict`；`npm pack --dry-run --json`；`git diff --check` | 检查规范格式、tarball 边界与文本 diff | 不授权 commit/push/publish |
| 无 dependency/YOLO 越界 | final scoped diff inspection | 直接确认 `package*.json`、permission integration 无任务内变更 | 不证明另一个 YOLO 问题已解决 |

## 4. 条件性场景 / 边界 / 权限用例

| ID | 条件 | 预期结果 | 状态 |
|---|---|---|---|
| EDGE-1 | `visible:true` + auto | upstream 选 tmux，不被强制 headless | implemented (planner matrix) |
| EDGE-2 | sandbox enabled + auto | upstream 选 headless，domain 配置原样保留 | implemented (planner + fake-Pi sandbox matrix) |
| EDGE-3 | async omitted backend | 启动 headless run，status/wait/reconcile 仍读同一 durable run | implemented |
| EDGE-4 | explicit inline | 模型调用前停止；无 `failureKind:model` 误诊和 raw TypeError | implemented |
| EDGE-5 | parent YOLO | headless child 获得 `PI_PERMISSION_MODE=yolo`，credential guard 仍 hard deny | implemented locally；live credential probe unverified |
| EDGE-6 | lifecycle action | 参数逐字节保持，不创建新 run | implemented |
| EDGE-7 | parallel auto: visible task + plain task | pre-start validation，要求拆分或显式兼容 backend | implemented |
| EDGE-8 | parallel auto: visible + sandboxed，无 plain task | 保留 upstream per-task tmux/headless resolution | implemented |
| EDGE-9 | real `sandbox:true` model worker无 provider auth/egress | visible fail-closed result；不出现 inline create异常；不计为 provider pass | observed / provider success unverified |

## 5. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|
| Unverified | 未发布 upstream 是否已有现代 SDK inline 修复 | 未来是否可移除 adapter | dependency 变更前做 bounded upstream check；本 change 不升级 |
| Unverified | 实现后的真实 omitted-backend provider completion | stable release readiness | 取得精确 live-probe 批准后执行；未执行则 release row 保持 non-pass |
| Resolved | no-dependency headless compatibility adapter已实施；mixed visible+plain auto组合 fail closed | 不阻塞本地实现 | provider-backed readiness仍由独立 live gate控制 |

## 6. Final acceptance gate

- [x] 用户于 2026-07-24 明确接受最终测试计划并授权仓库内 BUILD；dependency/lockfile、真实 provider probe、Git、publish/release/install 仍需各自单独批准。
