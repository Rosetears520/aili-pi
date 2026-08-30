# Herdr 空闲 Child 生命周期与 Hub 续接提案

状态：已实现并通过聚焦测试（2026-08-28）。本文不开放 write/edit/bash，也不改变已接受的每-Run安全边界。

## 1. Hub 与 Subagent 的关系

`sub` 是唯一创建/执行 Child Turn 的入口，`task_id` 是稳定 Child Session identity。`hub` 不创建另一套 Subagent：

- `hub jobs` 查看同一 Coordinator Journal；
- `hub wait` 等待该 Child 当前/最近 Job；
- `hub output/history` 读取同一 parent sidecar；
- `hub send` 对 settled `task_id` 调用当前 `sub` continuation，并以 background turn 执行；
- `hub cancel` 取消该 Child 当前 Job。

因此 Hub 是 `sub` 的控制/续接面，不是第二个 Agent runtime。运行中的 task 仍返回 `SUB_BUSY`；`hub send` 不偷偷 steer。

## 2. 当前 Herdr 行为

当前已采用“每个 Run 一个新 child process、稳定 Pi session 可续接”：

1. 新 Run 分配新 runId、per-Run loadout/token/bridge；
2. 若旧 child 尚存，下一 Run 启动前才发送 shutdown；
3. 已完成但暂无新任务时，旧 child 可能继续占用进程和 pane agent 状态；
4. pane 会在后续并发/顺序需求中拆分或回收。

这满足 incarnation 身份，但空闲资源释放不够积极。

## 3. 建议目标：不用即关，用时恢复

Turn settlement 成为 child process 的明确结束边界：

```text
turn.completed / turn.failed
  → durable settlement + output/event flush
  → bridge session.exiting
  → child graceful shutdown
  → confirm process stopped
  → close its pane; close the AILI tab when no sibling remains
  → release surface permit
  → keep only the durable Pi session path
```

下一次 `sub(task_id=...)` 或 `hub send(task_id=...)`：

```text
resolve stable Agent + Pi session
  → allocate new Run/loadout/token
  → create a fresh AILI tab/pane (or join an already-live parallel AILI tab)
  → start fresh child process
  → load the same Pi session
  → verify bridge runId/agentId/loadoutHash
  → execute continuation
```

结果是 Pi session 持久，而 child process、pane 和空闲 AILI tab 都是短命资源。

## 4. 与 pi-config/tmux 行为参考的关系

`amosblomqvist/pi-config` 与 `pi-interactive-subagents` 仅作为公开行为参考：可见 multiplexer pane、任务运行期间有 child、结束后 pane/process 可关闭或回收、后续通过持久会话重新启动。实现继续使用 Herdr socket API、AILI Journal 和 Pi Session，clean-room 编写；不复制 pi-config 源码。

## 5. 需要修改的实现点

1. `backends/herdr/adapter.ts`
   - 成功和失败 settlement 后统一执行 graceful shutdown；
   - 等待 bridge/process confirmed stop 后 `dropSurface`/release permit；
   - confirmed stop 后关闭 pane；同 tab 无 sibling 时关闭整个 tab，不能把 terminal text 当完成证据。
2. `herdr-child/index.ts`
   - shutdown barrier 等待 event log flush、pending interaction 清零；
   - interaction pending 时禁止 auto-exit。
3. restart reconcile
   - settled Run + 残留 child：关闭并回收；
   - live Run：按现有 bridge/event evidence reattach；
   - session 文件保留用于 task_id continuation。
4. Hub
   - `hub send` 只对 settled task 创建新 Run；
   - `hub wait` 可等待旧 Run settlement，但不复活 child。

## 6. 验收场景

- 单任务完成后 child 进程退出，pane 与空闲 AILI tab 关闭，session 文件仍存在。
- 同 task_id 续接启动新 runId/new process/new tab，历史上下文保留。
- 两个并行任务运行时保留两个 pane；各自完成后独立关闭，不误杀 sibling。
- pending permission/question 阻止 auto-exit，回答后继续或 fail-closed。
- parent crash 后 live child 可重接；settled残留 child 被清理且不重放。
- surface permit 仅在 confirmed stop 后释放。
- Hub output/history 在 child 关闭后仍可读取。

## 7. 使用频率说明

当前 Herdr Subagent 相比早期版本看起来使用较少，主要不是 Herdr 失效，而是：

- 路由策略改为 benefit-based，不再为每个非平凡动作强制派 Agent；
- Herdr Phase 3 前只允许静态只读角色，implementer/test 等写角色会被拒绝；
- background/hub 曾被隐藏，跨 Turn 调度能力降低；
- 主 Agent 多次直接执行以避免重复上下文和写冲突。

background/hub 已恢复后，只读调查、审查和规格挖掘的使用率会回升。完成 Herdr permission/sandbox/write-role 等价后，实施和测试角色才能安全提高使用频率。
