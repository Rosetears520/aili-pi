# 最终测试计划: add-herdr-execution-backend

> **状态: 已接受。** 用户已于 2026-08-26 明确接受本测试计划并授权实施("直接开始做吧,可以一部分一部分的做")。BUILD 生效,实施按 tasks.md 分阶段推进。

## 0. 文档状态与门禁

- 阶段:BUILD
- 接受状态:已接受(2026-08-26,用户在会话中明确授权)
- BUILD 附加约束:
  1. 实施按 Phase 0 → 4 顺序,每阶段边界执行 §4 基线并留痕;
  2. Phase 0 的 Herdr 协议/安装链/子进程启动验证(任务 1.2–1.4)仍是 Phase 2 前置门;若 socket API 与设计假设不符,须先回写 design.md 并与用户重新确认。

## 1. 测试目标与证据等级

目标:证明 (a) managed 后端零语义回归;(b) backend 解析/冻结/无回退语义正确;(c) Herdr 表面、child bridge、安全等价、reconcile 行为符合 specs;(d) InteractionBroker 与 ActivityBus 两后端一致;(e) 安装检测与官方三连安装可控且幂等。

| 等级 | 含义 |
|---|---|
| A | 自动化测试(unit/integration,fake Herdr server) |
| B | operation-gated:真实 Herdr + Pi 环境人工/半自动验收并留痕 |
| N | 不可测试授予项(文档/许可证处置),以审查记录为证据 |

## 2. 计划中的测试与 artifact

| 领域 | 计划测试 | 等级 |
|---|---|---|
| backend 解析/优先级/冻结/无回退 | `tests/unit/persistent-agent-backend-resolution.test.ts` | A |
| Run 记录/生命周期/活动 overlay 分离 | `tests/unit/persistent-agent-run-records.test.ts` | A |
| loadout 快照与严格恢复(交集/diff/拒绝) | `tests/unit/persistent-agent-loadout-resume.test.ts` | A |
| 旧 journal 默认解释为 managed | `tests/unit/persistent-agent-storage` 扩展 | A |
| Herdr client(fake server:握手/snapshot+缓冲事件/重连/版本不匹配) | `tests/integration/herdr-client-fake-server.test.ts` | A |
| Surface 拓扑/命名/metadata/预检零残留 | `tests/integration/herdr-surface.test.ts` | A |
| Child bridge(握手/token/seq-ack/重放/轮转/幂等) | `tests/integration/herdr-child-bridge.test.ts` | A |
| 安全 bootstrap(失败关闭/拒绝扩权/脱敏) | `tests/integration/herdr-child-security.test.ts` | A |
| 重启 reconcile(reattach/degraded/lost 三分支) | `tests/integration/herdr-reconcile.test.ts` | A |
| InteractionBroker(路由/仅暂停自身/失败关闭/unexpected-blocked) | `tests/integration/interaction-broker.test.ts` | A |
| ActivityBus(词汇一致/辅助标注/stall 不改变生命周期) | `tests/unit/activity-bus.test.ts` | A |
| 并发/批量(全量预检、surface 饱和、独立失败、32 turn 保持) | `tests/integration/persistent-agent-concurrency.test.ts` 扩展 | A |
| 安装检测与官方三连安装(stub 命令/幂等/失败显式) | `tests/bootstrap/herdr-install-detect.test.ts` | A |
| 管理命令族(切换提示/managed focus 不支持/inspect) | `tests/unit/agent-management-commands.test.ts` | A |
| 真实 Herdr + Pi 全链路(spawn/send/focus/cancel/resume/重启 reattach/ask/permission/write/bash/batch/并发/切回 managed) | `tests/integration/herdr-live-gated.test.ts`(gated) | B |
| 第三方处置与 NOTICE | 审查记录 | N |

## 3. Traceability matrix

| Spec 要求 | 测试 | 状态 |
|---|---|---|
| subagent-execution-backends / 路由与默认 | backend-resolution | PLANNED-A |
| subagent-execution-backends / managed 等价 | 全量现有套件(断言不改) | PLANNED-A |
| subagent-execution-backends / 用户唯一选择与冻结 | backend-resolution + management-commands | PLANNED-A |
| subagent-execution-backends / 无静默回退 | backend-resolution + herdr-client(fake 断连) | PLANNED-A |
| subagent-execution-backends / Run 与 overlay 分离 | run-records + activity-bus | PLANNED-A |
| subagent-execution-backends / permit 分离 | concurrency 扩展 | PLANNED-A |
| subagent-execution-backends / batch 一致性 | concurrency 扩展 | PLANNED-A |
| subagent-execution-backends / loadout 严格恢复 | loadout-resume | PLANNED-A |
| herdr-execution-surface / socket 优先与版本守卫 | herdr-client-fake-server | PLANNED-A |
| herdr-execution-surface / 无缺口重连 | herdr-client-fake-server | PLANNED-A |
| herdr-execution-surface / 拓扑与命名 | herdr-surface | PLANNED-A |
| herdr-execution-surface / metadata 身份 | herdr-surface + herdr-reconcile | PLANNED-A |
| herdr-execution-surface / 两步启动门控 | herdr-surface + herdr-live-gated | PLANNED-A / GATED-B |
| herdr-execution-surface / 检测+官方三连安装 | herdr-install-detect + 一次性真实安装留痕 | PLANNED-A / GATED-B |
| herdr-execution-surface / 重启 reconcile 三分支 | herdr-reconcile + herdr-live-gated | PLANNED-A / GATED-B |
| herdr-execution-surface / stall 无副作用 | herdr-reconcile + activity-bus | PLANNED-A |
| herdr-execution-surface / 人工接管与 controlMode | herdr-live-gated | GATED-B |
| herdr-child-bridge / 端点与鉴权 | herdr-child-bridge | PLANNED-A |
| herdr-child-bridge / 双写事件日志与重放 | herdr-child-bridge | PLANNED-A |
| herdr-child-bridge / 权威完成证据 | herdr-child-bridge + herdr-live-gated | PLANNED-A / GATED-B |
| herdr-child-bridge / 启动纪律 | herdr-live-gated | GATED-B |
| herdr-child-bridge / 安全 bootstrap | herdr-child-security | PLANNED-A |
| herdr-child-bridge / 阶段能力门控 | backend-resolution(能力预检) | PLANNED-A |
| herdr-child-bridge / 命令面与 auto-exit 屏障 | herdr-child-bridge + interaction-broker | PLANNED-A |
| agent-interaction-broker / 单一权威与渲染 | interaction-broker | PLANNED-A |
| agent-interaction-broker / 路由/暂停/失败关闭/unexpected-blocked | interaction-broker | PLANNED-A |
| agent-activity-observability / 统一事件与辅助标注 | activity-bus | PLANNED-A |
| agent-activity-observability / 一致展示字段 | renderer/web 检查 + 人工留痕 | PLANNED-A / GATED-B |
| agent-activity-observability / 用户级命令族 | management-commands | PLANNED-A |
| agent-activity-observability / inspect 与手工输入标记 | management-commands + herdr-live-gated | PLANNED-A / GATED-B |

## 4. 必须保持的现有基线

每个阶段边界执行并留痕:`npm run typecheck`、`npm test`、integration 套件、`npm run validate:capabilities`、`npm run validate:generated`、`npm run validate:package`、`npm run test:audit-redaction`、`npm run test:doctor`。managed 语义零回归是所有阶段的硬性验收条件。

## 5. 验收清单(全过才可将 herdr 标记为正式 backend)

- managed 零语义回归;切换只影响新 Agent;模型不能切换 backend;
- `sub`/现有命令跨 backend 等价;AgentId 仍为权威身份;同 Agent 串行 Turn;
- 批量预检 all-or-none 保持;AILI scheduler 仍是并发权威;
- Herdr 进程不绕过 model/tool/permission/sandbox/workspace policy;
- 完成证据不来自终端文本或 Herdr idle;Parent 重启可 reattach;失联不自动 replay;
- loadout 恢复不扩权;pending interaction 阻止 auto-exit;
- TUI/Web 呈现 backend/driver/run/activity/控制模式;安装检测幂等、失败显式;
- 第三方许可证与 NOTICE 完整,无 pi-config 代码复制。

## 6. 2026-08-28 fresh verification

- `npm run typecheck`: PASS.
- `npm test`: 767 passed / 2 live-gated skipped.
- capabilities/generated/package: PASS.
- audit-redaction: 19 PASS; doctor: 16 PASS.
- Herdr focused security/interaction/activity/backend/storage tests: PASS.
- Real reloaded Herdr write role: `aili.implementer`, backend `herdr`, driver `pi-cli`, run `run-17`, wrote and reread `.tmp/herdr-write-acceptance/result.txt`; child settled idle with zero pending interactions.
- Canonical catalog currently has no bash-enabled role; real bash is N/A, while exact child SandboxController/profile/tool-policy paths have deterministic tests.
- OpenSpec strict validation: PASS.
