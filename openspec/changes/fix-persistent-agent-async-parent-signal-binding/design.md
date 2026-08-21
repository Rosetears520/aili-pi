# Design: Persistent Agent Async Parent-Signal Lifecycle Binding

## D1 绑定过滤（核心修复）

`TaskCoordinator.submit()` 现状（`task-coordinator.ts:522-532`）：

```ts
let abortListener: (() => void) | undefined;
if (parentSignal) {
  abortListener = () => {
    for (const task of prepared.created) void this.cancel(task.jobId);
  };
  parentSignal.addEventListener("abort", abortListener, { once: true });
  if (parentSignal.aborted) abortListener();
  void Promise.allSettled(prepared.created.map((task) => task.handle.result)).then(() => {
    if (abortListener) parentSignal.removeEventListener("abort", abortListener);
  });
}
```

改为先计算 parent-bound 子集，listener 的注册、立即触发与清理都只作用于该子集：

```ts
const parentBoundTasks = prepared.created.filter(
  (task) => !task.effectiveAsync || ancestry !== undefined,
);

if (parentSignal && parentBoundTasks.length > 0) {
  abortListener = () => {
    for (const task of parentBoundTasks) void this.cancel(task.jobId);
  };
  parentSignal.addEventListener("abort", abortListener, { once: true });
  if (parentSignal.aborted) abortListener();
  void Promise.allSettled(parentBoundTasks.map((task) => task.handle.result)).then(() => {
    if (abortListener) parentSignal.removeEventListener("abort", abortListener);
  });
}
```

- `ancestry !== undefined` 在当前 `effectiveAsync` 推导（`task-coordinator.ts:746`，嵌套恒 sync）下是防御性冗余；保留以显式表达"嵌套任务永远绑定祖先生命周期"，防止未来推导变化时回归。
- 批内混合（如一个 `blocking` 角色 sync 项 + 一个非阻塞 async 项）天然只取消 sync 项。
- 提交时 `parentSignal.aborted` 已为真的立即触发分支同样只作用于 parent-bound 子集。

理由：`effectiveAsync:false` 表示调用方 join 结果——顶层 sync 等待 settlement、嵌套任务由父任务的 turn 信号拥有——父取消应传播；顶层 `effectiveAsync:true` 任务在 `submit()` 返回 `accepted` 后与父 turn 无 join 关系，其生命周期只受显式通道（hub cancel / shutdown / close / 自身失败）管辖。

## D2 完成边界检查保持不变

`runLifecycle()` 的 `if (context.signal.aborted) throw ...`（`task-coordinator.ts:864`）不改：

- 修复后 async 任务的 `context.signal` 只会因显式 cancel/shutdown/close 而 abort；用户已表达取消意图时 abort 优先是可接受语义。
- 同步/嵌套任务的等待调用方已消失，丢弃其结果无额外影响。
- 若未来要求"显式取消竞争中仍保留已生成证据"，作为独立需求另行演进，本变更不扩大范围。

## D3 无泄漏与无孤儿

- async 任务不再注册父信号 listener，不存在 listener 泄漏。
- async 任务仍由 scheduler 持有：capacity 上限、`close()`（排队 cancel + 运行 abort）、session shutdown 均覆盖，不会成为孤儿。
- hub wait / output / history 的观察路径不变。

## 风险

- R1（语义放宽担忧）：可能存在依赖"父 turn 结束即清场 async"的隐性使用者。评估：规范谱系明确 async 是 "the parent can continue while the child runs" 且取消必须显式（hub cancel），现行父信号清场是缺陷不是特性；且 shutdown/close 仍全量清场，会话退出不受影响。任务 1.2 以代码检索确认无其他 `parentSignal` 消费者。
- R2（启动即取消竞态）：`parentSignal.aborted` 立即触发分支保留，但只对 parent-bound 子集生效；async 任务不因提交前信号已终止被立即取消。
- R3（测试假成立）：只断言 filter 结果可能漏掉真实绑定路径。回归测试直接以 `submit(params, undefined, controller.signal)` 驱动，覆盖 listener 注册、触发与清理。
