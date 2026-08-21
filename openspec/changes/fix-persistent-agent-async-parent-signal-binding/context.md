# Change Context: Persistent Agent Async Parent-Signal Lifecycle Binding

## Goal

[已知|用户] 修复顶层 `async:true` 持久 Agent 任务被父 Agent tool-call/turn AbortSignal 错误取消的生命周期绑定缺陷，并以回归测试锁住该语义。用户先完成了只读诊断并要求：核实诊断是否成立，然后先写 OpenSpec 提案。BUILD 未授权，本变更当前仅产出 DEFINE 文档。

## Confirmed Evidence

### 代码证据（本会话已独立核实）

- `src/runtime/persistent-agents/runtime.ts:480-482`：顶层 `task` 工具 `execute(_toolCallId, params, signal, ...)` 将 Pi tool-call signal 原样传给 `runtime.task.submit(params, undefined, signal, ...)`。
- `src/runtime/persistent-agents/task-coordinator.ts:522-532`：`submit()` 对 `parentSignal` 注册 abort listener，遍历 `prepared.created` 无差别 `this.cancel(task.jobId)`，未按 `task.effectiveAsync` 过滤；`parentSignal.aborted` 时立即触发；`Promise.allSettled` 后移除 listener。
- `src/runtime/persistent-agents/task-coordinator.ts:746`：`effectiveAsync = ancestry ? false : role.blocking ? false : item.async ?? true` —— 嵌套任务恒为同步；顶层非阻塞角色默认 async，`blocking` 角色强制 sync。
- `src/runtime/persistent-agents/task-coordinator.ts:863-869`：`runLifecycle()` 在 `execute()` 成功返回后检查 `context.signal.aborted` 并 throw，catch 分支以 `{ output: "", error }` 覆盖已产出 output，状态置 `aborted`。
- `src/runtime/persistent-agents/production.ts:1196-1207`：嵌套 task 工具把子 Agent 自己的 turn signal 传给 `submit(params, ancestry, signal, ...)` —— 嵌套绑定父任务信号是既有设计，应保留。
- 取消通道盘点：hub cancel（`src/runtime/persistent-agents/hub.ts:881-894` → `cancelJob` 桥）、session shutdown（`src/runtime/persistent-agents/production.ts:727-734` → `runtime.shutdown()`）、调度器 close（`src/runtime/persistent-agents/scheduler.ts:153-157`：排队任务 cancel、运行任务 abort）、任务自身失败。异步输出持久化经由 settlement 后的 `onAsyncSettled`（`task-coordinator.ts:834-838`、`runtime.ts:186`）。

### 上游文档证据（已独立核实）

- `@earendil-works/pi-coding-agent/docs/extensions.md:826`："Use `ctx.signal` for nested async work inside the handler. This lets Esc cancel model calls, `fetch()`, and other abort-aware operations started by the extension."
- `extensions.md:994-1002`：`ctx.signal` 是 "current agent abort signal"，仅在活跃 turn 事件（tool_call/tool_result/message_update/turn_end 等）期间有定义，idle 或非 turn 上下文中通常为 `undefined`。

### 会话证据（用户提供，原始 session 产物未在磁盘定位到）

- job-1 / job-2 两个顶层 async 任务于 `2026-08-20T08:53:09.846Z` 同一毫秒统一 `scheduled task cancelled`，此前持续工作约 105 秒；期间无 hub cancel、无 session shutdown。
- `ideate-test-matrix-evidence` 的 history 已含完整结构化总结（实际完成主要工作），但状态为 aborted、`agent://` 输出为空。

### 规范谱系证据

- `openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/specs/persistent-agent-orchestration/spec.md`：
  - "Top-level tasks support bounded async and synchronous execution"：默认非阻塞任务 "returns Agent/job IDs without waiting and the parent can continue while the child runs"。
  - "Async results are durable and exactly once in the parent transcript"。
  - "Cancellation is explicit and transcript preserving"：取消经由显式 `hub cancel`。

## Confirmed Decisions

- 根因是 `TaskCoordinator.submit()` 的父信号生命周期绑定，不是 subagent 自身失败、模型报错或 hub 误操作；hub wait 只是观察者。
- 修复 SHALL 在 `submit()` 绑定处按 `effectiveAsync` / ancestry 过滤；不得通过修改 Pi signal 语义、轮询 workaround 或绕开调度器实现。
- 已接受顶层 async 任务的合法终止事件仅限：显式 hub cancel、runtime/session shutdown、调度器 close、自身失败。
- 嵌套任务与顶层同步任务的父信号绑定 SHALL 保持不变（join 语义：调用方等待结果，调用方取消则传播）。
- `runLifecycle()` 完成边界的 aborted 检查保持不变；显式取消与完成竞争时 abort 优先，但该路径不再被父 turn 信号触发。
- 用户诊断建议的过滤谓词 `!task.effectiveAsync || ancestry !== undefined` 中，`ancestry !== undefined` 在当前 `effectiveAsync` 推导（嵌套恒 sync）下是防御性冗余；保留以显式表达"嵌套永远绑定祖先生命周期"的意图，防止未来推导变化时回归。
- 提交时 `parentSignal.aborted` 已为真的立即触发分支 SHALL 只作用于 parent-bound 子集（async 任务不因"提交前信号已终止"被立即取消）。
- Agent history/tool-result 凭据脱敏（第二个 Agent 的 history 读取被凭据扫描拒绝）是独立缺陷，另行立项，不进入本变更。

## Boundaries

- 不修改 Pi 上游 signal 语义，不新增后台执行通道，不改动 dependency/lockfile、`node_modules`、`~/.pi/agent`。
- 本变更仅为 DEFINE（proposal/context/design/tasks/test-plan/spec 增量）；BUILD、commit、push、publish 均需单独精确授权。
- 当前工作区已暂存的沙盒 denyRead 修复与 `.worktrees/fix-sandbox-deny-read-symlink` worktree 不受本变更影响、不被触碰。
