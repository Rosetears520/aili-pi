# 测试文档：persist-subagent-backend-and-external-cli

## 0. 文档元信息

- 来源：`proposal.md`、`design.md`、两份 capability spec、`tasks.md`，以及现有 `src/runtime/persistent-agents/` 与相关测试。
- 生成时间：2026-08-30
- 适用版本 / 分支：当前工作树 `main`；实现前仍有混合未提交改动，不能将现有结果当作本变更通过证据。
- 状态：ACCEPTED。用户于 2026-08-30 接受 prompt→working→input-ready 完成标准，并授权继续实现；随后要求 Parent 在已有权限内自动代答、缺少高风险授权时直接拒绝而不弹出用户确认。

## 1. 被测对象、目标与边界

- 被测对象：全局 subagent 后端设置命令、外部 CLI Herdr driver、CUI Agent 的 prompt→working→input-ready 生命周期、普通 Herdr pane 分配、foreground/background 结算和 YOLO capability detection。
- 要支持的完成 / 接受 claim：用户可持久设置新 Agent 的 backend；授权外部 CUI Agent 的启动、活动 pane、任务完成、取消和失联状态与普通 `sub` 的可观察生命周期一致；YOLO 状态不被伪造。
- In scope：`managed`/`herdr` global/clear、已有 project/session 优先级、固定 Agent kind/native argv、授权拒绝、run/turn/pane identity、post-prompt working guard、input-ready 结算、同 tab pane 分配、后台与恢复。
- Explicitly not run / out of scope：真实 vendor CLI 安装、登录、账单/网络写入、发布、实际 YOLO 操作、真实 Herdr smoke；这些各自须单独精确授权。
- 适用假设：测试使用 fake Herdr、bridge 与 vendor executable；真实环境只能补强对应 claim，不能替代确定性矩阵。

## 2. 需求 / 决策 / 风险追踪

| 需求 / 决策 / 风险 | 来源 | 任务 / Package | 文件 / Artifact | 验证命令 / 检查 | 证据 | 覆盖状态 |
|---|---|---|---|---|---|---|
| 全局 backend 设置、clear、保留 Herdr 配置、原子失败 | `persistent-subagent-backend-preference` | 2.1 | settings、backend tests | `vitest run tests/unit/persistent-agent-backends.test.ts` | 写入/锁/替换/clear fixture | PLANNED |
| 当前会话立即生效、已有 Agent 冻结、优先级不变 | 同上 | 2.2 | production、backend tests | 同上 + persistent-Agent integration fixture | new/existing/precedence fixture | PLANNED |
| CLI 仅由当前用户精确产品授权 | `herdr-external-cli-agent` | 3.1 | external-cli、sub/production tests | `vitest run tests/unit/persistent-agent-external-cli.test.ts tests/unit/persistent-agent-sub.test.ts` | authorized/mismatched/stale/no-allocation fixture | PLANNED |
| 固定无 shell argv、凭据拒绝、YOLO truthful | 同上；D3 | 1.3、3.2 | external-cli tests | 同上 | fake executable/help/argv/denial fixture | PLANNED |
| 普通 Pi subagent tab/pane allocator 复用 | 同上；D2 | 3.3 | Herdr adapter tests | `vitest run tests/unit/herdr-backends.test.ts` | same-tab split/new-tab fallback/no collision fixture | PLANNED |
| 前台仅在本次 prompt 进入 working 后返回 input-ready 才结算 | 同上；D2/D5 | 1.1、1.2、3.4 | Herdr/sub/production tests | `vitest run tests/unit/herdr-backends.test.ts tests/unit/persistent-agent-sub.test.ts` | pre-idle/working/idle-done/blocked/unknown fixture | PLANNED |
| 背景、shutdown、loss/restart 无 prompt 重放 | 同上 | 3.4 | coordinator/Herdr tests | targeted unit + integration test | accepted/settled/lost/no-replay fixture | PLANNED |
| Parent 仅在已有权限内自动代答，缺少高风险授权直接拒绝且不弹窗 | interaction requirement；D5 | 3.5 | interaction/permission tests | targeted unit + integration test | ordinary auto-answer + credential/high-risk deny fixture | PLANNED |
| 类型和注册回归 | 所有任务 | 4.2 | scoped diff | `npm run typecheck` | fresh typecheck output | PLANNED |
| 真实 Herdr + 已登录 CLI 的 CUI 生命周期 | D2、D3、风险表 | 4.3 | repository-local redacted artifact | operation-gated manual smoke | prompt 后 working→input-ready 状态证据 | UNVERIFIED / AUTHORIZATION REQUIRED |

## 3. 选定验证

| 条件 / Claim | 命令或直接检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| Global config writer correctness | `vitest run tests/unit/persistent-agent-backends.test.ts` | 覆盖 schema、解析、优先级、原子失败和 command 行为的纯本地 fixture | 不证明真实 HOME 文件或用户交互已执行 |
| External launch and authorization | `vitest run tests/unit/persistent-agent-external-cli.test.ts tests/unit/persistent-agent-sub.test.ts` | 可确定性验证 registry、授权、argv、拒绝与 sub lifecycle 适配 | 不证明任一 vendor CLI 在真实账户下可运行 |
| Herdr lifecycle and pane policy | `vitest run tests/unit/herdr-backends.test.ts tests/integration/persistent-agent-production.test.ts` | fake daemon/Agent 能覆盖 tab/pane、post-prompt working guard、input-ready 结算、取消和 Parent integration | 不证明真实 vendor CUI 的检测模式兼容 |
| Cross-module type coherence | `npm run typecheck` | 捕获 TS contract 和注册面不一致 | 不替代行为或真实 runtime 验证 |
| Broader regression after focused pass | `npm test` | 仅在实现影响范围仍有未覆盖集成风险时运行 | 不证明发布、安装或外部 CLI 成功 |

## 4. 条件性场景 / 权限用例

- 只有在用户明确授权后，才运行一个已安装、已登录 CLI 的 Herdr smoke；命令、CLI 产品、目标工作区和证据目录须在执行前单独确认。
- Smoke 必须验证：CUI Agent 启动、在同一 AILI tab 中分配独立 active pane、prompt 前 idle 不结算、prompt 后进入 working、返回输入框时 idle/done 结算、blocked 保持活动、取消状态可见且不泄露 vendor 原始输出。
- 任何安装、登录、授予 vendor 权限、网络写入、提交或 push 不属于 smoke 授权。

## 5. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|
| Unverified | 各真实 vendor CUI 是否能被当前 Herdr 检测器稳定识别 working 与 input-ready | 影响真实 CLI 的支持矩阵 | 先用 fake Agent lifecycle 固化契约；每个真实 CLI smoke 须单独授权 |
| Unverified | 各已安装 vendor CLI 的当前 YOLO/non-interactive flag | 影响是否添加该 CLI 的固定 bypass argv | 由 bounded `--help` capability evidence 决定；缺失即 `yolo-unavailable` |
| Blocked | 当前工作树含大量混合未提交变更 | 可能污染 diff、测试和提交范围 | 实现前确认提交范围或单独授权新 worktree |

## 6. 执行记录

- PASS：backend/external CLI/storage/sub focused tests，93/93。
- PASS：production/runtime/permission/interaction focused tests，15/15。
- PASS：最终聚焦矩阵，109/109；`npm run typecheck`；strict OpenSpec；adapter evidence verify；extension/package/compatibility isolated rerun，7/7。
- PARTIAL：完整 `npm test` 为 894 passed、2 skipped、2 failed；失败是并发执行下的 package-load 5 秒超时与 existing Agent running→parked race。两个失败文件随后一起隔离重跑 7/7。完整并行套件不记 PASS。
- PASS（限定）：真实 Agy CLI 1.1.22 通过 Herdr kind `agy` 在同一 AILI tab 的 sibling pane 启动，使用 help 已确认的 YOLO flag，完成固定无工具 prompt 并回到 input-ready `idle`；测试 pane 已关闭。
- UNVERIFIED：本次 Parent 尚未再次 `/reload`，因此真实 smoke 验证的是底层 Herdr/Agy CUI 路径，不是新增 `sub cli: agy-cli` 的热加载公开 schema；其他真实 CLI 产品也未获运行授权。
- BLOCKED：Herdr blocked 状态没有结构化操作 packet，因此非 YOLO 下无法证明普通确认是否在现有授权内。当前 fail-closed 且不弹用户对话框。

## 7. Final acceptance gate

- [x] 用户明确接受最终测试计划；修订后的 CUI lifecycle 与 policy-bounded Parent auto-decision 于 2026-08-30 获得继续实现授权。
