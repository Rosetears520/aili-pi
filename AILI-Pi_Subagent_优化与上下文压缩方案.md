# AILI-Pi Subagent 优化与分层上下文压缩方案

> 状态：设计建议，可直接交给本地 Agent 拆分 OpenSpec Change 后实施
> 核验基线：`Rosetears520/aili-pi` `main`，commit `9d3052056700696793ed9399b56c5ca549be5f81`，2026-08-21
> 重点输入：`fix-persistent-agent-async-parent-signal-binding`、现有 Persistent Agent 源码、既有 Subagent 调查文档，以及 MiMo Code 的 checkpoint / rebuild 思路

---

## 一、结论先行

AILI-Pi 的 Persistent Agent 主体不需要重写。当前已经具备的 Agent / Job / Turn 身份、独立 Child Session、FIFO 调度、Workspace、writeScope、权限桥、Sandbox、Journal、history/output sidecar、异步结果去重投递等能力都应保留。

现在最需要处理的是四个彼此独立的问题：

1. **P0：修复顶层异步 Agent 被父 Main turn signal 误取消。** 现有 OpenSpec Change 的根因和修复方向正确，但当前仍停留在 DEFINE，代码尚未实施。
2. **P0/P1：简化 model / thinking 决策。** `task.thinking` 已存在，delegated-choice 也已存在；真正的问题是优先级不符合“本轮用户指令最高”、thinking 入口不完整、未授权/非法请求会被静默丢弃，以及 `hub` 能力不对称。
3. **P1：把 Formal Task Board 从普通 `task` 中拆出去。** 普通 Persistent Agent 不应暴露 `formalContext` / `continuationAudit`，Formal 应成为独立适配器；Formal pair 损坏只能阻塞 Formal 调度，不能影响普通 `task / hub`。
4. **P1：增加统一 Context Pressure Controller。** AILI 只决定 **WHEN：何时提醒、何时强制释放上下文**；Codex 继续由 `pi-codex-compact` 决定 **HOW**，非 Codex 继续由 ACP 决定 **HOW**。

建议不要把四项合并成一个大型 Change。正确拆分为：

```text
1. fix-persistent-agent-async-parent-signal-binding
2. make-persistent-agent-model-thinking-decisions-explicit
3. separate-formal-task-adapter-from-persistent-task
4. add-provider-routed-context-pressure-controller
5. improve-persistent-agent-observability-and-focus-ui（后续）
```

---

## 二、当前架构中应明确保留的部分

### 2.1 Persistent Agent Runtime

应继续保留：

```text
Agent / Job / Turn durable identity
独立 Pi Child Session JSONL
task 创建、hub 继续、park / revive
顶层 async、同步等待、嵌套调度
每个父会话的 FIFO scheduler
workspace:auto / shared / isolated
writeScope 与资源冲突检查
权限模式、Sandbox、Credential Guard
完整 output/history sidecar
异步结果 pending / delivered / dedup / recover
requested/effective model/thinking 审计字段
```

尤其不要把正式 AILI Agent 退化成 `acp_delegate`。ACP delegation 是另一套通用临时进程机制，不具有 AILI Persistent Agent 的身份、Workspace lease 和正式审计语义。

### 2.2 当前 Context Owner 路由

当前 `ContextTurnRouter` 的方向是正确的：

```text
openai-codex + openai-codex-responses
  → codex-remote-v2

其他 provider / API
  → billion-context / ACP
```

Owner 按当前 Agent turn 冻结，而不是整个 Session 永久冻结；`agent_end` 后可在下一 turn 按新模型重新路由。应保留这一点，不能改回 Session-static owner。

### 2.3 当前异步结果投递

`AsyncDeliveryService` 已有：

```text
pending / delivered 状态
按 deliveryId 去重
父 Transcript 扫描去重
父界面暂不可用时保留 pending
恢复时 recoverPending()
5,000 字符预览 + agent:// / history:// 完整引用
```

因此异步修复不需要重做投递系统，只需要修正生命周期绑定，并补充取消来源的可观测性。

---

## 三、P0：完成异步 Parent Signal 修复

### 3.1 当前真实问题

当前 `TaskCoordinator.submit()` 在完成整批任务分配后，只要收到 `parentSignal`，就给本批全部任务统一绑定：

```ts
parentSignal.abort
  → for every prepared task
  → cancel(task.jobId)
```

顶层 `async:true` 会先返回：

```json
{
  "status": "accepted",
  "effectiveMode": "async"
}
```

但它仍然受发起该 `task` tool call 的 Main turn signal 控制。Main turn 一结束，signal 被终止，已经 accepted 的后台任务随即变成 aborted。多个并行 Agent 同属一批时会一起被取消。

这不是 Child Agent 启动后自身崩溃，而是生命周期所有权错误：

```text
顶层后台任务的 owner
不应是“创建它的那一次 Main turn”
而应是“父 Persistent Runtime / 显式 cancel / shutdown”
```

### 3.2 现有 Change 的正确修复

分配完成后立即分类：

```ts
const parentBoundTasks = prepared.created.filter(
  task => ancestry !== undefined || !task.effectiveAsync
);

const detachedTasks = prepared.created.filter(
  task => ancestry === undefined && task.effectiveAsync
);
```

生命周期规则：

| 任务类型 | 是否绑定父 turn signal | 仍可被什么取消 |
|---|---:|---|
| 顶层 `async:true` | 否 | `hub cancel`、Runtime shutdown、进程退出、显式 release |
| 顶层同步任务 | 是 | 父 signal、显式 cancel、shutdown |
| 所有 nested task | 是 | 祖先 permit/signal、显式 cancel、shutdown |

监听器只处理 `parentBoundTasks`：

```ts
if (parentSignal && parentBoundTasks.length > 0) {
  const abortListener = () => {
    for (const task of parentBoundTasks) void this.cancel(task.jobId);
  };

  parentSignal.addEventListener("abort", abortListener, { once: true });
  if (parentSignal.aborted) abortListener();

  void Promise.allSettled(parentBoundTasks.map(task => task.handle.result))
    .finally(() => parentSignal.removeEventListener("abort", abortListener));
}
```

### 3.3 建议顺手补上的生命周期审计

不要只记录 `status: aborted`，增加结构化取消来源：

```ts
type CancellationSource =
  | "parent-turn"
  | "hub-cancel"
  | "runtime-shutdown"
  | "process-loss"
  | "permission-bridge-loss"
  | "workspace-conflict"
  | "provider-abort";

interface CancellationAudit {
  source: CancellationSource;
  reason: string;
  requestedAt: string;
  beforeStart: boolean;
}
```

写入 Job / Turn metadata，并在 `hub jobs`、异步结果卡片和 expanded details 中展示。这样用户能区分：

```text
accepted 之后正常后台运行
accepted 之后被用户取消
父同步调用中断
Runtime shutdown
Provider 自身 abort
```

### 3.4 必须覆盖的测试

```text
A1  单个顶层 async：父 signal 在 accepted 后 abort，Child 继续完成
A2  三个顶层 async batch：父 signal abort，三者均继续
A3  顶层 sync：父 signal abort，任务终止
A4  mixed batch：async 继续，sync 终止
A5  nested task：父/祖先 signal abort，nested 终止
A6  pre-aborted signal：仅 parent-bound task 被取消
A7  hub cancel：detached async 仍能被显式取消
A8  runtime shutdown：detached async 被终止
A9  listener cleanup：无泄漏、无重复 cancel、无 unhandled rejection
A10 accepted 结果与最终 delivery 的 Job/Turn identity 一致
```

### 3.5 本 Change 暂不扩大到的范围

当前修复只解决同一 Pi 进程内的错误 signal 绑定，不要顺手承诺：

```text
进程退出后后台任务继续运行
机器重启后自动恢复正在执行的 provider request
跨进程 Durable Worker
```

这些属于后续 Durable Background Runner。当前仍可保持：运行中进程丢失记为 `interrupted`，排队任务记为 `unexecuted`，不自动重放。

---

## 四、P0/P1：简化 model / thinking 路由

### 4.1 当前已经具备的能力

当前并不是“没有 thinking 参数”：

```text
task.model
task.thinking = off|minimal|low|medium|high|xhigh|max
CurrentTurnModelAuthority:
  inherit-only
  explicit
  delegated-choice
Child Session thinkingLevel
requested/effective model/thinking Journal audit
```

因此不需要重新设计整套 Model Registry 或 Child Session 创建流程。

### 4.2 当前仍存在的确定性问题

#### 问题 A：请求异常被静默丢弃

`captureTaskModelRequest()` 当前捕获所有异常后直接返回 `undefined`：

```ts
catch {
  return undefined;
}
```

结果可能是：

```text
Main Agent 传入 Terra high
        ↓
请求未授权 / 歧义 / 不兼容
        ↓
运行时静默丢弃
        ↓
Child 继承 Luna medium 并正常启动
        ↓
Main Agent 误以为 Terra high 已生效
```

这是模型路由中最需要消除的行为。模型和 thinking 只能：

```text
明确应用
明确要求一次确认
明确拒绝
明确继承
```

不能静默回退。

#### 问题 B：本轮用户明确指定仍可能重复确认

当前即使 `CurrentTurnModelAuthority` 已经从用户本轮提示中解析出 explicit authority，只要 `item.model` 存在，preflight 仍调用 `confirmTaskModelRequest()`。

目标语义应为：

```text
用户本轮明确说“reviewer 用 Sol high”
→ 直接应用
→ 不再弹 Allow once
```

只有 Main Agent 自己提出、用户没有授权的 override，才弹一次确认。

#### 问题 C：一次性覆盖低于持久配置

当前模型层级是：

```text
instance
project-role
user-role
one-shot
parent
profile/runtime
```

这意味着用户本轮明确说“这次用 Sol”，仍可能被全局 `reviewer = Terra` 覆盖。

目标应改为按字段独立解析：

```text
1. direct-user-turn
2. instance override
3. trusted project role override
4. user-global role override
5. direct Parent
6. profile fallback（仅无 Parent 时）
7. runtime / model default
```

`model` 与 `thinking` 分别取第一个有效值。例如：

```text
全局 reviewer = Terra high
用户本轮：这次 reviewer 用 Sol

结果：
model = Sol                 source=direct-user-turn
thinking = high             source=user-role-override
```

若 Sol 不支持 high，必须明确失败并报告来源，不能偷偷降为 medium，也不能偷偷换回 Terra。

#### 问题 D：thinking-only 不完整

当前 `ModelOverride` 强制要求 `model`，使 thinking-only 持久配置不自然；而在 `inherit-only` 权限下，仅传 `thinking:"high"` 也没有与 model override 对等的一次确认路径。

改为：

```ts
interface SubagentRuntimePreference {
  model?: string;
  thinking?: ModelThinking;
}
```

要求二者至少一个存在。Delegated authority 也必须把“模型选择”和“思考等级选择”拆开：

```text
“模型你自己选”
  → model 可从 available catalog 选择
  → thinking 仍继承

“模型和思考等级都由你决定”
  → model 可选择
  → thinkingMode=available
```

不能因为用户只授权模型选择，就顺便开放 high/max。

#### 问题 E：`hub` 入口不对称

当前：

```text
hub model request
  有 model
  没有 thinking

hub send
  有 message
  没有下一 Turn 的 model / thinking one-shot
```

应支持：

```ts
hub({
  action: "model",
  operation: "request",
  agentId,
  model?,
  thinking?
});

hub({
  action: "send",
  agentId,
  message,
  model?,
  thinking?
});
```

这里只扩展普通 `OrdinaryHubSendSchema`。Formal continuation 仍由 `formal_task` adapter 控制；除非 Formal 规格明确允许，否则不要让普通 `hub send` 的 one-shot 绕开 Formal identity 校验。

`hub send` 的 model/thinking 只作用于这次 continuation Turn，完成后恢复 Agent 的持久配置。

### 4.3 建议的数据结构

不要把模型真源写进 Todo 或项目 Markdown。使用父 Session 内的结构化 Turn Preference：

```ts
interface TurnSubagentPreference {
  selector?: string;
  agentId?: string;
  model?: string;
  thinking?: ModelThinking;
  authority:
    | "direct-user-explicit"
    | "direct-user-delegated-choice"
    | "model-proposed";
  sourcePromptEntryId: string;
  expiresAfterParentTurn: true;
}
```

解析流程：

```text
before_agent_start
  → 解析用户本轮 model/thinking 指令
  → 写入 ParentState.turnSubagentPreferences

task preflight
  → 按 selector / agentId 取偏好
  → 再与 instance/project/global/parent 分字段合并
  → capability 校验
  → 产出结构化 decision
```

### 4.4 结构化决策结果

```ts
interface SubagentRuntimeDecision {
  requestedModel?: string;
  requestedThinking?: ModelThinking;
  effectiveModel: string;
  effectiveThinking: ModelThinking;

  modelSource: RuntimePreferenceSource;
  thinkingSource: RuntimePreferenceSource;

  overrideDecision:
    | "accepted-direct-user"
    | "accepted-delegated-choice"
    | "confirmation-required"
    | "confirmed-model-proposal"
    | "rejected-unauthorized"
    | "rejected-unsupported"
    | "inherited";

  reason?: string;
}
```

该结果进入：

```text
Task accepted result
Task final settlement
Turn audit
Async delivery details
hub list / jobs
TUI / Web compact row 与 expanded details
```

### 4.5 UI 最小显示

Compact row：

```text
Reviewer · aili.code-reviewer · Sol · high · running
```

Expanded details：

```text
requested model / thinking
effective model / thinking
model source / thinking source
override decision
parent model / thinking
Agent / Job / Turn ID
workspace / writeScope
```

---

## 五、P1：从普通 `task` 中拆出 Formal Adapter

### 5.1 当前问题不是“所有 Subagent 天生依赖两份文档”

普通 `task` 没有 `formalContext` 时，不会读取：

```text
formal-task-board.md
progress.txt
```

但当前普通 `TASK_TOOL_SCHEMA` 仍直接暴露：

```text
formalContext
continuationAudit
```

这带来两个问题：

1. Main Agent 看到 OpenSpec change 后容易自动附加 Formal 字段，把普通 review / implementation 误升级为 Formal package 执行。
2. Formal pair 任意历史记录无效时，整个 change 的调度会在 Agent allocation 前 fail-close，表现成“Subagent 启动失败”。

### 5.2 目标形态

```text
task
  → 只负责普通 Persistent Agent Runtime
  → 不认识 formalContext / continuationAudit

formal_task
  → 校验 formal-task-board.md + progress.txt
  → 解析 package / owner / scope / acceptance / evidence
  → 构造一个普通 task 请求
  → 调用同一 Persistent Agent Runtime
  → 结算后写回 Formal evidence / progress
```

结果：

```text
Formal pair invalid
  → 只阻止 formal_task

普通 task / hub
  → 始终可用
```

### 5.3 必须保持的严格边界

拆分不等于放松 Formal：

```text
Formal 仍然整对严格校验
Formal 仍然 fail-closed
formal_task 不自动回退到 ACP delegation
不把 fallback-subagent:* 加入正式 Owner 白名单
不自动改写旧 ACP provenance 为正式 Agent provenance
不为 imt-api 或任何 changeId 写特例
```

### 5.4 迁移兼容

第一版可保留内部兼容入口，但不再向模型公开：

```text
旧 task formal 字段
  → 仅可信内部 adapter 可调用
  → 给出 deprecation diagnostic

公开 task schema
  → 删除 formalContext / continuationAudit
```

等 `formal_task` 稳定后再删除内部兼容路径。

---

## 六、P1：Provider-routed Context Pressure Controller

### 6.1 借鉴 MiMo Code，但不照搬 checkpoint-writer

MiMo Code 实际上分开了两件事：

```text
checkpoint thresholds
  → 保持 checkpoint.md 新鲜
  → 不等于每次都压缩当前上下文

接近 usable context limit
  → rebuild
  → checkpoint + recent working set 重建上下文
```

AILI-Pi 第一版不应复制一套后台 checkpoint-writer。原因：

1. Codex Remote Compaction 已维护 opaque checkpoint / replacement history。
2. ACP 已维护 compression blocks、T1/T2/T3 和 ref-tag context。
3. 再增加第二套 `checkpoint.md` 会制造双真源。
4. 后台 writer 本身会引入工具权限、无限循环、阻塞主会话、过期任务复活和 Prompt Cache 破坏风险。

因此第一版只借鉴 MiMo 的“分阶段压力管理”，不复制它的文件型 checkpoint 系统。

### 6.2 统一职责

```text
AILI Context Pressure Controller
  = WHEN
  = 使用率测量、阶段跨越、提醒、强制触发、冷却、审计

pi-codex-compact
  = HOW for Codex
  = remote compaction、opaque checkpoint、replacement history、Pi fallback

ACP / billion-context
  = HOW for non-Codex
  = ref、prune、compression block、T1/T2/T3、expand/search
```

建议新增：

```text
src/runtime/context-pressure.ts
```

不要把 controller 塞进 `pi-codex-compact`，也不要把 provider 路由逻辑塞进 ACP fork。

### 6.3 默认阶段

```text
Normal     < 60%    不动作
Soft       60%      一次轻量提醒
Strong     75%      强提醒：整理当前阶段、减少无效探索、准备压缩
Force      85%      强制调用当前 Owner 的 relief actuator
Emergency  93%      Force 失败/仍在飞时的最后安全门
```

对 872K window：

| 阶段 | 比例 | Token |
|---|---:|---:|
| Soft | 60% | 523,200 |
| Strong | 75% | 654,000 |
| Force | 85% | 741,200 |
| 预留 | 15% | 130,800 |

不要只使用固定百分比。最终 Force 边界应同时考虑下一次大输出：

```ts
const proportionalReserve = clamp(
  contextWindow * 0.15,
  32_768,
  131_072,
);

const reserveTokens = Math.max(
  proportionalReserve,
  modelMaxOutputTokens ?? 0,
  observedLargeToolBurstP95 ?? 0,
);

const forceAtTokens = Math.min(
  Math.floor(contextWindow * 0.85),
  contextWindow - reserveTokens,
);
```

这样大窗口保留约 128K，大约 272K 的窗口保留约 41K，128K 窗口至少保留 32K。

### 6.4 监听位置

使用 Pi 官方支持的：

```ts
pi.on("turn_end", (_event, ctx) => {
  const usage = ctx.getContextUsage();
  // detect crossing and trigger
});
```

原因：一个 Agent 回合可能是：

```text
LLM → tool → LLM → tool → LLM
```

每个内部 turn 都能检查压力，不能等整个 `agent_end` 才发现已从 70% 冲到 90%。

注意：

```text
turn_end
  → 压力决策

agent_end
  → 当前 ContextTurnRouter owner 解冻
```

当前 owner 在 `turn_end` 时仍是确定的，可安全路由到 Codex 或 ACP actuator。

### 6.5 Controller 状态机

每个 Pi Session / Child Session 独立维护：

```ts
interface ContextPressureState {
  sessionId: string;
  epoch: number;
  lastTokens: number;
  lastRatio: number;
  highestNotifiedStage: "normal" | "soft" | "strong" | "force" | "emergency";
  compactionInFlight: boolean;
  lastCompactionTurn?: number;
  cooldownRemaining: number;
  lastOwner?: ContextOwner;
}
```

关键规则：

```text
只在 threshold crossing 时触发一次
同一 epoch 不能重复 Force
compactionInFlight 时不得重入
成功压缩后 epoch + 1，stage 重置
模型切换只在下一 turn 重新计算 owner/window
usage 不可用时不猜测、不强制压缩，只记录 diagnostic
Force 后未下降到 Strong 以下，才允许 Emergency
```

### 6.6 Codex actuator

当 owner 为 `codex-remote-v2`：

```text
Soft / Strong
  → 下一次 context 里注入一次非持久化 pressure notice

Force
  → ctx.compact()
  → Pi 触发 session_before_compact
  → pi-codex-compact 接管
  → OpenAI remote compaction
  → 失败时保留插件自身 Pi-native fallback
```

`pi-codex-compact` 当前已经监听 `session_before_compact`，因此 controller 只调用 Pi 的公开 `ctx.compact()`，不需要调用插件内部函数，也不应 fork/修改插件。

Pressure notice 应是临时 context injection，不写入长期 Transcript，避免每次提醒永久污染上下文和 Prompt Cache。

### 6.7 ACP actuator：当前缺口与目标接口

当前 ACP 已经做：

```text
context event
  → ref-tag
  → prune / filter
  → processTurn
  → nudge decision
  → emergency nudge

compress tool
  → 需要明确 startId / endId / summary
  → applyCompression
```

但它目前没有一个可由 AILI 调用的确定性：

```ts
forceRelief(targetTokens)
```

因此不能把“85% 时给模型一个更强的文字提醒”冒充成“强制压缩”。要满足需求，应给 ACP 增加一个窄接口：

```ts
interface AcpPressureActuator {
  notify(
    stage: "soft" | "strong",
    usage: ContextPressureSnapshot,
  ): void;

  forceRelief(
    ctx: ExtensionContext,
    request: {
      targetTokens: number;
      reason: "pressure-force" | "pressure-emergency";
      signal: AbortSignal;
    },
  ): Promise<{
    status: "compacted" | "nothing-compressible" | "failed";
    beforeTokens: number;
    afterTokens: number;
    reclaimedTokens: number;
    blocksCreated: number;
    diagnostic?: string;
  }>;
}
```

同时为 ACP 增加：

```ts
pressureControl: "internal" | "external"
```

AILI 集成使用 `external`：

```text
普通 tier/growth nudge 的 WHEN 由 AILI 决定
ACP 保留 ref/prune/filter/compression HOW
ACP 保留极端 overflow 安全兜底
避免 AILI 和 ACP 同时重复提醒
```

### 6.8 ACP `forceRelief()` 的实现边界

AILI 不应理解 ACP 的 ref、block、T1/T2/T3。候选选择和摘要生成全部留在 ACP 内部：

```text
1. 获取 session lock
2. 读取 state/coreMessages/config
3. 由 kernel 找出 compressibleRanges
4. 排除 protected / recent / 当前活跃范围
5. 从最旧范围开始选择，直到预计回收量达到 target
6. 已有 block 优先做 T2/T3 再压缩
7. 原始消息需要摘要时，使用一次有界 summarization call
8. validate summary / refs
9. applyCompression
10. 保存 state 并重新测量 usage
```

隐藏 summarization call 必须有：

```text
单次 in-flight
超时
最多一次重试或零重试
AbortSignal
固定最大输出
无工具循环
结构化结果校验
失败后明确回退到 emergency prune / diagnostic
```

不要为此启动一个可无限循环、需要 read/write 工具的 checkpoint-writer Subagent。

### 6.9 建议配置

```json
{
  "contextPressure": {
    "enabled": true,
    "softRatio": 0.60,
    "strongRatio": 0.75,
    "forceRatio": 0.85,
    "emergencyRatio": 0.93,
    "reserveRatio": 0.15,
    "reserveMinTokens": 32768,
    "reserveMaxTokens": 131072,
    "cooldownTurns": 3,
    "routes": {
      "codex-remote-v2": "pi-codex-compact",
      "billion-context": "acp"
    }
  }
}
```

配置加载规则：

```text
无文件 → 内置默认，不自动创建文件
格式错误 → 明确 warning，使用默认但不覆盖原文件
修改 → 原子写入
Session 可临时 override，但不自动写回 global
```

### 6.10 Context UI

Footer / Web 状态至少显示：

```text
Context 654K / 872K · 75% · Strong
Owner: Codex Remote V2
Next: force at 741K · reserve 131K
```

压缩中显示：

```text
Context relief · Codex remote compaction…
```

或：

```text
Context relief · ACP selecting 3 ranges…
```

`/context-pressure` 可展示状态和当前 Session 临时阈值，但不要让 Main Agent 自行修改阈值；修改属于用户操作。

---

## 七、其他值得优化但不应阻塞 P0 的项目

### 7.1 取消与执行状态分层

不要让外层 tool call 成功等同于 Child 执行成功。统一区分：

```text
dispatchStatus: accepted | rejected
executionStatus: queued | running | completed | failed | aborted | interrupted | unexecuted
deliveryStatus: not-required | pending | delivered
```

异步 `task` 首次返回只能证明 `accepted`，最终结果以 Job/Turn settlement 和 delivery 为准。

### 7.2 History Credential Guard 的精度

当前 `hub history` 会把完整 rendered history 交给 credential scanner；任一 credential-like assignment 都可能导致整段历史不可读。

建议：

```text
写入/工具调用入口：继续 hard deny
output artifact：继续 hard deny
history 读取展示：逐行 redact，而不是整份 fail
返回 redactedCount / affectedLines diagnostic
PRIVATE KEY block 整块替换为占位符
```

这样仍不把秘密重新暴露给 Parent Agent，但不会因为一行示例配置或安全讨论让整个 history 失效。

### 7.3 大结果不要回灌父上下文

当前 5,000 字符 preview + `agent://` / `history://` 的方向正确。继续要求：

```text
Parent 默认只收到短 preview、结论、证据引用
完整 500KB 输出保持 sidecar 引用
需要时由 hub output 分页读取
不得将多个并行 Child 的完整输出全部自动注入 Main context
```

这同时是 Subagent 稳定性和 Prompt Cache 优化。

### 7.4 Agent Focus / FleetView

底层已经有 `hub send/output/history/jobs/model`，后续 UI 可增加：

```text
main / Agent 会话焦点切换
@agent 直接发消息
Agent 列表：state / model / thinking / token / workspace
完成后 resume
单 Agent Transcript 视图
取消与模型切换操作
```

这一项属于交互优化，不应和 async 生命周期修复混在一起。

### 7.5 Child Resource Profile

当前 Child 默认严格隔离是安全的。后续如需让特定 Agent 使用更多 Skill/Extension，不要直接“全部继承”，而应增加显式 profile：

```text
isolated
trusted-minimal
inherit-safe
```

每个 profile 仍要经过：

```text
Parent active tools
∩ Child loadable definitions
∩ permission mode
∩ task narrowing
− hard denied / credential / top-level-only
```

---

## 八、建议的 OpenSpec 拆分

### Change 1：完成当前异步修复

```text
fix-persistent-agent-async-parent-signal-binding
```

范围：

```text
TaskCoordinator parent-bound / detached 分类
listener 绑定与 cleanup
mixed batch / pre-aborted / nested tests
可选：CancellationAudit
```

不包含 model、Formal、Context Pressure。

### Change 2：模型与 thinking 显式决策

```text
make-persistent-agent-model-thinking-decisions-explicit
```

核心文件：

```text
src/runtime/persistent-agents/model-selection.ts
src/runtime/persistent-agents/production.ts
src/runtime/persistent-agents/task-schema.ts
src/runtime/persistent-agents/hub.ts
src/runtime/persistent-agents/task-coordinator.ts
src/runtime/persistent-agents/task-hub-renderer.ts
src/runtime/persistent-agents/types.ts
```

完成标准：

```text
本轮用户指令最高优先
model/thinking 分字段解析
thinking-only 全入口支持
用户明确指令不重复确认
Main Agent 自行提议只确认一次
无 UI 时明确拒绝并返回 decision
无静默 catch / silent downgrade
hub model 与 hub send 支持 thinking
```

### Change 3：Formal Adapter 解耦

```text
separate-formal-task-adapter-from-persistent-task
```

完成标准：

```text
普通 task schema 无 Formal 字段
formal_task 负责校验、转换、结算
invalid pair 只阻塞 formal_task
不写仓库特例
不放松 Formal fail-closed
```

### Change 4：Context Pressure Controller

```text
add-provider-routed-context-pressure-controller
```

核心文件：

```text
src/runtime/context-pressure.ts                # 新增
src/runtime/context-runtime.ts                 # Owner → actuator 路由
src/runtime/context-pressure-settings.ts       # 新增，可与 runtime 合并
upstream/billion-context-pi/src/index.ts        # external pressure mode
upstream/billion-context-pi/src/runtime.ts      # actuator API
upstream/billion-context-pi/src/config.ts       # pressureControl
upstream/billion-context-pi/src/force-relief.ts # 新增
```

Codex 插件本身不修改。

### Change 5：观测与 UI

```text
improve-persistent-agent-observability-and-focus-ui
```

包含：

```text
CancellationSource
三层状态：dispatch / execution / delivery
FleetView / @agent / focus switch
Context pressure meter
History redaction diagnostic
```

---

## 九、总体验收矩阵

### 9.1 Async 生命周期

```text
顶层 async 在父 turn 结束后继续
nested 仍随祖先取消
hub cancel / shutdown 仍有效
mixed batch 无交叉取消
最终结果 exactly-once delivery
```

### 9.2 Model / Thinking

```text
用户本轮 model 覆盖持久配置
用户本轮 thinking 覆盖持久配置
model-only 与 thinking-only 独立工作
持久配置在用户未指定时生效
嵌套 Agent 继承直接 Parent，不跳回 Main
不兼容 thinking 明确失败
Main Agent 自选需确认；用户授权 delegated-choice 时不确认
只授权模型选择时 thinking 仍继承；明确授权 thinking choice 时才可选择
requested/effective/source/decision 全链路可见
```

### 9.3 Formal 解耦

```text
普通 task 在 Formal pair invalid 时仍可启动
formal_task 对 invalid pair 继续 fail-closed
Formal 结果仍有 exact package / role / evidence identity
无 ACP fallback 冒充正式 Agent
```

### 9.4 Context Pressure

```text
60/75/85 只在 crossing 时触发一次
同一 epoch 无重复 force
Codex force 进入 pi-codex-compact
非 Codex force 进入 ACP actuator
provider/model 在 active turn 内漂移时仍 fail-close
下一 turn 切模型后使用新 owner / window
每个 Child Session 独立计算压力
压缩失败有明确状态，不能无限循环
Force 后保留足够下一轮输出空间
```

### 9.5 回归验证命令

至少执行：

```bash
npm run typecheck

npx vitest run \
  tests/unit/persistent-agent-task.test.ts \
  tests/unit/persistent-agent-hub.test.ts \
  tests/unit/persistent-agent-model-selection.test.ts \
  tests/unit/persistent-agent-model-authority.test.ts \
  tests/unit/persistent-agent-output-delivery.test.ts \
  tests/unit/context-runtime.test.ts \
  tests/unit/context-pressure.test.ts

npm test
git diff --check
```

真实会话验收：

```text
1. Main 使用 Luna medium
2. 同时启动 3 个 async Agent
3. task 返回 accepted 后让 Main turn 正常结束
4. 三个 Agent 必须继续运行并各自完成投递
5. 其中一个使用 hub cancel，另外两个不受影响
6. 指定 reviewer = Sol high，核对 Child Session 的实际 provider/model/thinking
7. 切到非 Codex 模型，核对 owner 变为 ACP
8. 人工降低阈值触发 Soft / Strong / Force，核对每阶段仅一次
```

---

## 十、明确不做

```text
不为某个业务仓库、changeId、packageId 写特例
不把普通 Persistent Agent 重新绑定到项目 Todo/Markdown
不把 ACP delegation 当成 AILI task/hub fallback
不在 Formal 失败后静默降级
不静默更换 model 或降低 thinking
不在 AILI Controller 中实现 Codex/ACP 的压缩算法
不复制 MiMo 的后台 checkpoint-writer 作为 V1
不把完整 Child 输出自动灌回 Main context
不承诺 Pi 进程退出后后台任务继续
```

---

## 十一、推荐实施顺序

```text
第一步：只完成 async parent-signal Change，恢复后台 Agent 的基本正确性
第二步：完成 model/thinking 显式决策，消除 silent fallback
第三步：拆出 formal_task，降低普通 task 的复杂度和误用概率
第四步：增加 Context Pressure Controller 与 ACP force actuator
第五步：补 FleetView、Context meter、取消原因和 history redaction UI
```

最核心的最终架构是：

```text
Persistent Agent Runtime
  = identity / lifecycle / scheduling / permission / delivery

Formal Adapter
  = optional workflow governance

Context Pressure Controller
  = WHEN

pi-codex-compact / ACP
  = HOW
```

---

## 十二、核验来源

AILI-Pi：

- https://github.com/Rosetears520/aili-pi/tree/main/openspec/changes/fix-persistent-agent-async-parent-signal-binding
- https://github.com/Rosetears520/aili-pi/blob/9d3052056700696793ed9399b56c5ca549be5f81/src/runtime/persistent-agents/task-coordinator.ts
- https://github.com/Rosetears520/aili-pi/blob/9d3052056700696793ed9399b56c5ca549be5f81/src/runtime/persistent-agents/model-selection.ts
- https://github.com/Rosetears520/aili-pi/blob/9d3052056700696793ed9399b56c5ca549be5f81/src/runtime/persistent-agents/production.ts
- https://github.com/Rosetears520/aili-pi/blob/9d3052056700696793ed9399b56c5ca549be5f81/src/runtime/persistent-agents/hub.ts
- https://github.com/Rosetears520/aili-pi/blob/9d3052056700696793ed9399b56c5ca549be5f81/src/runtime/persistent-agents/output-delivery.ts
- https://github.com/Rosetears520/aili-pi/blob/9d3052056700696793ed9399b56c5ca549be5f81/src/runtime/context-runtime.ts
- https://github.com/Rosetears520/aili-pi/blob/9d3052056700696793ed9399b56c5ca549be5f81/upstream/billion-context-pi/src/index.ts
- https://github.com/Rosetears520/aili-pi/blob/9d3052056700696793ed9399b56c5ca549be5f81/upstream/billion-context-pi/src/runtime.ts
- https://github.com/Rosetears520/aili-pi/blob/9d3052056700696793ed9399b56c5ca549be5f81/upstream/billion-context-pi/src/compress-tool.ts

Pi / Codex Compact：

- https://github.com/earendil-works/pi/blob/5cd93f688aaab89dbb6dfa4aca535f21796ae185/packages/coding-agent/examples/extensions/trigger-compact.ts
- https://github.com/earendil-works/pi/blob/5cd93f688aaab89dbb6dfa4aca535f21796ae185/packages/coding-agent/examples/extensions/custom-compaction.ts
- https://github.com/narumiruna/pi-extensions/blob/760a67c19e8792f4b51a4b50fd297170b4c81d06/packages/pi-codex-compact/src/codex-compact.ts

MiMo Code：

- https://github.com/XiaomiMiMo/MiMo-Code/blob/main/packages/opencode/src/skill/builtin/.bundle/mimocode-docs/reference/config.md
- https://github.com/XiaomiMiMo/MiMo-Code/issues/1867
- https://github.com/XiaomiMiMo/MiMo-Code/issues/1915
