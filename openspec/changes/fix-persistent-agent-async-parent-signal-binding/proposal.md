## Why

[会话证据|用户提供] 2026-08-20 两个顶层 `async:true` 任务（含 `ideate-test-matrix-evidence`）正常启动并持续工作约 105 秒后，在完全相同的时刻 `2026-08-20T08:53:09.846Z` 以 `scheduled task cancelled` 统一 aborted。期间没有任何 hub cancel 操作，也没有 session shutdown；hub wait 只是观察到了取消结果，不是取消源。`ideate-test-matrix-evidence` 的 history 中已出现完整结构化总结（实际完成主要工作），但状态为 aborted 且 `agent://` 输出为空。

[源码证据|已独立核实] 顶层 `task` 工具把 Pi 当前 tool-call/turn 的 AbortSignal 原样传给持久 Agent 调度器（`src/runtime/persistent-agents/runtime.ts:480-482`），而 `TaskCoordinator.submit()` 为该信号注册的 abort listener 无差别取消本次创建的全部任务，包括已经返回 `accepted` 的 `async:true` 任务（`src/runtime/persistent-agents/task-coordinator.ts:522-532`，未按 `task.effectiveAsync` 过滤）。父 Agent turn 结束时 Pi 终止该信号，本应独立继续运行的异步 Agent 因此被统一终止。

[上游文档证据|已独立核实] Pi `docs/extensions.md:826` 明确 `ctx.signal` 用于 handler 内嵌套异步工作的取消传播，且仅在活跃 turn 事件期间有定义、idle 时通常为 `undefined`（`extensions.md:994-1002`）。它是 turn 级取消信号，不是持久后台任务的生命周期所有权。

[源码证据|已独立核实] 第二个症状同根：`runLifecycle()` 在 executor 成功返回后仍检查 `context.signal.aborted` 并 throw（`task-coordinator.ts:864`），catch 分支以 `{ output: "", error }` 覆盖已产出 output。父信号取消与完成边界竞争时，已生成的结果与证据被无声丢弃。

## What Changes

- `TaskCoordinator.submit()` 的父信号绑定只覆盖需要 join 父生命周期的任务：`effectiveAsync:false` 的同步任务与嵌套任务；顶层 `effectiveAsync:true` 任务不再监听提交时的 tool-call/turn signal（含提交时信号已 abort 的立即触发分支）。
- 已接受的顶层 async 任务只允许以下事件终止：显式 hub cancel、runtime/session shutdown、调度器 close、自身失败。既有显式取消通道全部保持不变。
- 嵌套任务的父信号绑定保持不变：嵌套任务由其父任务的 turn 信号拥有（`production.ts:1196-1207` 传入的是子 Agent 自己的 turn signal），父任务取消仍应传播。
- `runLifecycle()` executor 返回后的 aborted 检查保持不变：显式取消与完成竞争时 abort 优先；修复后该路径不再被父 turn 信号触发。
- 在 `tests/unit/persistent-agent-task.test.ts` 增加回归：顶层 async 不随父信号取消、顶层 sync 仍随父信号取消、混合批次只取消同步项、嵌套任务仍服从父任务取消、executor 已返回结果时不得无声丢失已生成证据。
- 不修改 Pi 上游 signal 语义、不新增后台执行通道、不改动 dependency/lockfile。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `persistent-agent-orchestration`：
  - "Top-level tasks support bounded async and synchronous execution" 补充父 turn 信号不是已接受 async 任务的取消源，以及同步/混合/嵌套批次的取消传播场景。
  - "Cancellation is explicit and transcript preserving" 枚举已接受 async 任务的合法终止事件，排除提交 turn 的结束。
  - "Async results are durable and exactly once in the parent transcript" 补充完成边界与提交 turn 取消竞争时不得丢弃已生成输出的场景。

## Impact

影响 `src/runtime/persistent-agents/task-coordinator.ts` 与 `tests/unit/persistent-agent-task.test.ts`；`src/runtime/persistent-agents/runtime.ts`、`production.ts` 的信号传递入口无需改动。本提案仅为 DEFINE 产物，BUILD/实现未授权；不涉及 dependency/lockfile、commit、push、publish。诊断同时提到的 Agent history/tool-result 凭据脱敏是独立缺陷，另行立项，不在本变更范围。当前工作区已暂存的沙盒 denyRead 修复与 `fix-sandbox-deny-read-symlink` worktree 不受本变更影响。
