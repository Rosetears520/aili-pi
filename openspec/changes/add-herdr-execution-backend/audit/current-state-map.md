# Phase 0 审计:sub 控制面现状调用图与职责映射(add-herdr-execution-backend)

> 任务 1.1 产物。只读审计,无行为变化。基线:工作树 @ 2026-08-26(pi peer 0.84.2,本机 pi 0.84.3)。

## 1. 调用图(sub → delivery)

```text
pi Extension (extensions/index.ts → src/runtime/index.ts: task-runtime 组件)
  └─ registerPersistentAgentRuntime (production.ts:1509)
       └─ PersistentAgentProduction.register (production.ts:724)
            ├─ registerPersistentAgentTools (runtime.ts:446)      ← 注册 sub 工具 + /sub-cancel /aili-agent-model /codex-fast
            ├─ pi.on("before_agent_start")                        ← 捕获 CurrentTurnModelAuthority(只捕获,不建 sidecar)
            └─ pi.on("session_shutdown")                          ← controller dispose + runtime.shutdown
  └─ sub execute (runtime.ts:459)
       └─ PersistentAgentRuntime.sub.submit / submitTrusted
            └─ SubCoordinator.submitValidated (sub-coordinator.ts:523)
                 ├─ assertNoCredentialMaterial(输入)
                 ├─ serializeSubmission(promise-tail 互斥)
                 │    ├─ validateSubRequest(公共)/ validateFormalTaskRequest(受信)
                 │    ├─ 嵌套 permit/async/formalChangeId 校验
                 │    ├─ continuation: continuableAgent(taskId) → preflight → continueAndSchedule
                 │    └─ 新建: 全量 evaluateSpawn → 全量 resolveFormalProtection(Promise.all)
                 │            → 全量 options.preflight(模型/思考授权, Promise.all)   ← all-or-none 预检
                 │            → 逐项 createAndSchedule(agent/job/turn.created journal 事件)
                 │                 └─ attachHandle → scheduler.enqueue / runNested
                 ├─ emitLiveSnapshot / emitLiveBatch(非权威 UI 证据)
                 └─ 结果聚合: async → accepted;sync → await handle.result
  └─ scheduler.ts FifoTurnScheduler(32 permit, FIFO, nested 串行复用祖先 permit)
       └─ SubCoordinator.runLifecycle (sub-coordinator.ts:1093)
            ├─ begin(agent/job/turn → running)
            ├─ turn.audit(firstActivityAt)
            ├─ options.execute(TaskExecutorInput)          ← ★ 唯一执行注入缝
            │    (runtime.ts:146 当前包装:childManager 分配 → options.preflight(失败则向 child session 写
            │     非提供者 runtime 证据消息)→ options.execute(PersistentRuntimeExecutorInput{+sessionManager}))
            │         (production.ts:1201 execute: new ProductionAgentController → runInitial)
            │              └─ buildChildSession (production.ts:771)
            │                   ├─ 角色/正式保护/workspace/sandbox/权限/模型解析/turn.audit
            │                   ├─ computeEffectiveTools(工具交集)+ assembleChildPrompt
            │                   └─ createPersistentChildSession (session-factory.ts:152)  ← ★ 进程内 pi SDK AgentSession
            ├─ formal 结果解析(parseCanonicalFormalResult)
            ├─ onSettled(persistFullAgentOutput) / onFormalSettled(正式证据) / onAsyncSettled(投递)
            └─ finishCompleted/finishAborted/finishFailed(终态 journal 事件)
```

## 2. 文件职责映射(17 文件)

| 文件 | 行数 | 职责 | 后端改造相关点 |
|---|---|---|---|
| production.ts | 1511 | ParentState 持有、child 构建(buildChildSession)、ProductionAgentController(一轮执行)、模型目录/权限模式解析、命令注册入口 | buildChildSession 是 managed 专属(session-factory 直连);execute 闭包是注入缝 |
| sub-coordinator.ts | 1277 | 唯一协调边界:submit/submitTrusted、all-or-none 批量预检、runLifecycle、settlement、SubRequestError | 预检顺序/分配顺序不能变;TaskExecutorInput 是 backend 路由点 |
| model-selection.ts | 1038 | 模型/思考授权分层 + ModelConfigStore(全局/项目 JSON) | 设置文件模式可作 backend 设置参照 |
| storage.ts | 938 | 事件溯源 journal、状态机校验、sidecar 布局、重启 reconcile、IdleLifecycleRegistry | 新增 run.*/backend 字段需走 additive 事件 + snapshot `??=` 兼容 |
| output-delivery.ts | 691 | async 投递、agent:// 与 history:// 引用、正式结果证据 | 不动 |
| runtime.ts | 508 | PersistentAgentRuntime(per-parent 门面)+ registerPersistentAgentTools | execute 包装(childManager+preflight+证据写)整体搬入 managed backend;命令注册点 |
| workspace.ts | 486 | 租约、writeScope 校验、git 隔离、变更守卫 | 不动 |
| sub-schema.ts | 449 | SUB_TOOL_SCHEMA(additionalProperties:false)+ 正式批量 schema + 校验器 | `backend` 字段已被未知字段拒绝;补显式报错 |
| sub-renderer.ts | 335 | SUB_RENDERERS(TUI 渲染) | detail 行追加 backend/driver/run(additive) |
| policy.ts | 313 | 工具交集、spawn 策略、child prompt 组装;hard-denied 旧名(subagent/aili_task/task/hub) | 不动 |
| permission.ts | 223 | ChildPermissionResolver、ParentApprovalBroker、凭证扫描 | Phase 3 经 InteractionBroker |
| scheduler.ts | 200 | FifoTurnScheduler(32) | 不动;herdr surface permit 另立 |
| types.ts | 195 | Agent/Job/Turn 记录、CoordinatorState/Event | AgentRecord 增 backend?/driver?;State 增 runs;Event 增 runId |
| session-factory.ts | 186 | 进程内 AgentSession 创建 + 审批桥 + 资源加载器 | managed 专属,原样包装 |
| sub-registration.ts | 154 | sub 工具唯一身份预留 | 不动 |
| child-sandbox.ts | 120 | 进程内 sandbox provider 绑定 | Phase 3 herdr child 等价 |
| live-evidence-contract.ts | 34 | live 证据契约 | 不动 |

## 3. 进程内假设清单(herdr 需要替代/桥接的点)

1. **session-factory 直接创建 AgentSession**(noExtensions/noSkills…inline 隐藏 child 扩展;in-memory settings)。
2. **runtime.childManager 持有 SessionManager 映射**(create/open 均限 sidecar agentsDir 内,防路径逃逸)。
3. **preflight 失败时直接向 child SessionManager appendMessage** 写非提供者 runtime 证据(强制官方 Pi 落盘 JSONL)。
4. **审批桥在进程内闭包传递**(ParentApprovalBroker→context.ui.select)。
5. **ProductionAgentController.runInitial 直接 await session.prompt/sendUserMessage**,abort 经 session.abort()。
6. **schedulePark/idle TTL(420s)是进程内 controller 处置**,session 文件留续聊。
7. **重启语义**:running→interrupted、queued→unexecuted、正式 idle→parked(需 revive),无自动重放。

## 4. 与方案文档(redesign plan)的不一致点

| 方案假设 | 仓库现状 | 处置 |
|---|---|---|
| 存在 `hub`(list/send/wait/…) | hub 已移除(policy hard-denied;公共面仅 sub + /sub-cancel) | 管理动作走新用户级命令族;spec 已按此写 |
| ask-user-question.ts | 对应物是 `src/questionnaire/`(Picraft 吸收);child 无提问能力,仅工具审批回父级 | InteractionBroker 映射到 questionnaire 作 renderer |
| `aili.*` settings 键 | 不存在;仅有 model-overrides JSON(~/.pi/agent/aili/ + <project>/.pi/aili/) | backend 设置沿用同族路径模式:agent-backend.json |
| Herdr raw socket API | 本机 herdr 0.8.2;socket 协议待任务 1.2 实机验证 | 开放假设;Phase 2 门禁 |
| peer 0.84.1 | package.json peer 0.84.2;本机 0.84.3 | 以实机 0.84.3 验证启动配方(任务 1.4) |

## 5. 最小拆分结论(Phase 1)

- 新增 `backends/`(types/registry/managed/settings):ExecutionBackend 契约、registry、managed 包装(把 runtime.ts 的 execute 包装与 production 的 execute 闭包原样搬入)、backend 设置解析。
- `types.ts`/`storage.ts`:additive(backend?/driver?、runs、run.created/run.state、事件 runId 字段;旧 journal 读时默认 managed,snapshot `runs ??= {}`)。
- `sub-coordinator.ts`:resolveBackend 回调(新建用解析值,continuation 用冻结值)、记录/透传 backend、结算与快照加 backend/driver/runId。
- `runtime.ts`/`production.ts`:registry + managed 实例装配;/aili-agent-backend 命令(session 覆盖 + 提示语)。
- 风险与回滚:Phase 1 无用户可见行为变化(仅 additive 元数据);回滚 = revert 提交;全量既有测试是回归网。
