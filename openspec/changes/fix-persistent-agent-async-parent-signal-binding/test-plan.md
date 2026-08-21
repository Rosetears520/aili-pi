# 测试文档：fix-persistent-agent-async-parent-signal-binding

## 0. 文档元信息

- 来源：`proposal.md`、`context.md`、`design.md`、`specs/persistent-agent-orchestration/spec.md`、用户 2026-08-20 诊断（job-1/job-2 同毫秒 `scheduled task cancelled`）、`task-coordinator.ts` / `runtime.ts` / `production.ts` / `scheduler.ts` / `hub.ts` 源码。
- 生成时间：2026-08-21。
- 适用版本 / 分支：main 基线 `5ea8f52`、Pi `0.84.x` runtime。
- 状态：`proposed（DEFINE，未授权 BUILD）`。

## 1. 被测对象、目标与边界

- 被测对象：`TaskCoordinator.submit()` 的父信号绑定过滤（`src/runtime/persistent-agents/task-coordinator.ts`），使用 `tests/unit/persistent-agent-task.test.ts` 既有 deterministic harness（可控 executor + journal）。
- 要支持的完成 / 接受 claim：已接受的顶层 `async:true` 任务不随提交 turn 的 AbortSignal 取消；顶层同步任务与嵌套任务仍传播父取消；混合批次只取消同步项；executor 已返回结果不被父信号取消无声丢弃；提交时信号已终止不立即取消 async 任务。
- In scope：`src/runtime/persistent-agents/task-coordinator.ts`、`tests/unit/persistent-agent-task.test.ts`。
- Explicitly out of scope：Pi `ctx.signal` 上游语义、hub cancel / shutdown / scheduler close 既有通道（仅作为回归确认，不重设计）、`runLifecycle()` 完成边界检查、Agent history/tool-result 凭据脱敏（另行立项）、沙盒 denyRead 修复（独立 worktree 与暂存改动）。

## 2. 需求 / 决策 / 风险追踪

| ID | 需求 / 决策 / 风险 | 来源 | 任务 | 验证 | 预期证据 | 状态 |
|---|---|---|---|---|---|---|
| BIND-1 | 顶层 async 不绑定父信号 | spec Req1 "Parent turn signal aborts after async acceptance"；design D1 | 2.1, 3.1 | unit：AbortController 驱动真实 `submit` 绑定路径 | abort 后任务继续并 completed，`onAsyncSettled` 收到非空输出 | proposed |
| BIND-2 | 顶层 sync 仍绑定父信号 | spec Req1 "aborts synchronous submission" | 2.1, 3.2 | unit | abort 后 job/turn/agent aborted | proposed |
| BIND-3 | 混合批次选择性取消 | spec Req1 "Mixed batch partially bound"；design D1 | 2.1, 3.3 | unit：单次 submit 含 sync+async items | 仅 sync 项 aborted，async 项 completed | proposed |
| BIND-4 | 嵌套任务仍服从父任务取消 | spec Req4 "Nested task follows its parent task's cancellation"；`production.ts:1196-1207` | 3.4 | unit：ancestry submit + 父任务 signal abort | 嵌套任务 aborted（现状保持） | proposed |
| BIND-5 | 提交前信号已终止不取消 async | spec Req1 "already aborted at submission"；design R2 | 2.1, 3.6 | unit：预先 abort 的 controller | async 任务照常创建运行；同步提交被立即取消 | proposed |
| EVID-1 | 完成边界不丢已生成证据 | spec Req2 "Completion races the submitting turn's abort"、诊断症状二 | 2.2, 3.5 | unit：executor resolve 后同刻父信号 abort | async settlement 保留输出，非空 aborted 结果不出现 | proposed |
| CHAN-1 | 显式取消通道不回归 | spec Req3；context 取消通道盘点 | 2.2, 4.1 | 既有 hub cancel/shutdown/close 测试全过 | 通道行为与基线一致 | proposed |
| RISK-1 | 隐性依赖"turn 结束即清场" | design R1 | 1.2 | 代码检索 + 全量 `npm test` | 无其他 parentSignal 消费者；无回归 | proposed |
| RISK-2 | listener 泄漏 / 孤儿任务 | design D3 | 2.1, 4.1 | 全量测试 + typecheck | async 任务仍受 scheduler 持有与 close 覆盖 | proposed |
| RISK-3 | 只测 filter 漏掉真实绑定路径 | design R3 | 3.1-3.6 | 测试经 `submit(params, ancestry?, controller.signal)` 驱动 | 覆盖 listener 注册/触发/清理 | proposed |

## 3. 回归矩阵

| Case | 提交形态 | 父信号动作 | 期望 |
|---|---|---|---|
| A1 | 顶层 async:true（非阻塞角色默认） | accepted 后 abort | 任务继续执行并 completed；输出持久化且可经 settlement 读取 |
| A2 | 顶层 async:false（显式或 blocking 角色） | 运行中 abort | scheduler cancel 传播；job/turn/agent 终态 aborted |
| A3 | 同批 [sync 项, async 项] | abort | 仅 sync 项 aborted；async 项不受影响并完成 |
| A4 | 嵌套任务（ancestry 传入） | 父任务 signal abort | 嵌套任务 aborted（保持现状） |
| A5 | 顶层 async，executor 已 resolve | resolve 同刻 abort | 输出/证据保留；不出现空 output 的 aborted settlement |
| A6 | 顶层 async / sync 各一次提交 | submit 前 signal 已 abort | async 任务照常创建运行；sync 提交立即 cancelled |

## 4. 手动验证（可选，BUILD 后）

- 在真实 Pi 会话中提交两个 `async:true` 任务，等待父 turn 自然结束，用 `hub` 观察任务继续运行并最终 completed，输出/`agent://` 引用非空。
- 复现原故障场景（约 105 秒后父 turn 结束）：确认不再出现统一 `scheduled task cancelled`。
