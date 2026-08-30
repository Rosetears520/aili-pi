# AILI-PI 双 Subagent 后端、Herdr 执行面与 Browser / Prompt / Memory 综合改造方案

> 用途：直接交给本地 Coding Agent 进行仓库审计、设计落地和分阶段实现。
> 基线目标：保留当前 Persistent Agents，不做退役；新增可切换的 Herdr 后端，并同步建设 Browser、Prompt Middleware、Observational Memory、InteractionBroker 和白盒观测能力。

---

## 0. 总任务

在 `aili-pi` 现有 Persistent Agents 基础上实施一次“控制平面与执行后端解耦”改造：

1. 当前实现保留，命名为 `managed` 后端，仍为默认值。
2. 新增 `herdr` 后端：
   - 吸收 `pi-interactive-subagents` 的核心抽象、独立进程、独立执行 Surface、独立 Session、Loadout Snapshot、Resume、人工进入和活动状态；
   - 不再使用 tmux，执行 Surface 全部通过 Herdr workspace/tab/pane/agent API 创建和控制；
   - Herdr 只负责持久 PTY、进程、终端可见性和人工接管，不取代 AILI 的调度、权限、工作区、模型授权、审计、结果交付和持久状态。
3. `sub`、`hub` 现有公共语义保持兼容；后端选择由用户设置控制，不允许模型自行改变。
4. 同步增加：
   - AILI Native Browser，并保留 Playwright MCP 作为可选后端；
   - Prompt Snippets 升级为 Prompt Middleware；
   - Observational Memory 与 MemPalace 的分层组合；
   - 统一 InteractionBroker；
   - Run/Activity/Prompt/Context/Memory 白盒 Inspector。
5. 分阶段实现，每个阶段必须可独立验收、可回滚，禁止一次性推倒现有 Persistent Agents。

---

# 1. 强制设计原则

## 1.1 当前后端不能退役

当前 `src/runtime/persistent-agents/` 继续作为正式后端运行。新增抽象后，它只是从“唯一实现”变成：

```text
ExecutionBackend: managed
Driver: pi-sdk
```

默认设置必须仍是：

```json
{
  "subagents": {
    "backend": "managed"
  }
}
```

没有 Herdr、Herdr 不可用、配置缺失时，不得静默改走另一后端。错误必须显式返回，避免任务在用户不知情的情况下改变执行、安全或会话语义。

## 1.2 Herdr 不是调度器

Herdr 负责：

- workspace / tab / pane；
- PTY 与前台进程；
- Agent CLI 启动和识别；
- 终端输出、生命周期辅助状态；
- 人工 focus、attach、输入和中断；
- AILI 进程退出后继续保存运行中的外部 Agent。

AILI 继续负责：

- Agent / Job / Turn / Run 的权威状态；
- 批量预检；
- FIFO 和并发限制；
- Agent 角色、工具、模型、thinking、speed tier；
- 权限、credential guard、sandbox；
- workspace / writeScope / worktree；
- Interaction；
- output/history/delivery；
- formal result/evidence；
- memory promotion；
- 审计与恢复。

禁止把 `herdr agent wait`、pane 是否 idle、终端文本等直接当作 AILI Job/Turn 的唯一完成证据。

## 1.3 执行后端与 Agent Driver 必须分开

不要把“用 Herdr”与“用哪个 Agent CLI”混成一个字段。

```text
ExecutionBackend
├─ managed
└─ herdr

AgentDriver
├─ pi-sdk       managed v1
├─ pi-cli       herdr v1
├─ claude-cli   future / experimental
├─ codex-cli    future / experimental
└─ ...
```

首版正式支持矩阵：

| Backend | Driver | 支持级别 |
|---|---|---|
| `managed` | `pi-sdk` | 完整、现有正式能力 |
| `herdr` | `pi-cli` | 完整适配目标 |
| `herdr` | 其他 CLI | 仅保留接口，不在首版宣称正式支持 |

Herdr 原生可以识别多种 Agent CLI，但 AILI 只有在 Driver Adapter 能提供所需安全和结构化协议后，才能将其标记为正式支持。

## 1.4 设置切换只影响新 Agent

后端解析规则：

```text
已有 Agent 冻结的 backend
    >
当前 session 的直接用户设置
    >
项目设置
    >
全局设置
    >
managed
```

要求：

- 已有 Agent 的 `hub send`、resume 必须继续使用创建时的 backend；
- 修改设置只影响之后创建的新 Agent；
- 不做自动 backend migration；
- 不允许 role profile 强制覆盖用户设置；
- profile 只能声明 `supportedBackends`；
- 不允许模型通过 `sub` 参数切换 backend；
- 首版不在 model-facing `sub` schema 中增加 `backend` 字段。

---

# 2. 最终架构

```text
                          AILI Control Plane
┌────────────────────────────────────────────────────────────────────┐
│ Agent / Job / Turn / Run                                           │
│ Scheduler / Batch / Policy / Model Selection                       │
│ Permission / Sandbox / Workspace / Delivery / Storage              │
│ InteractionBroker / ActivityBus / PromptMiddleware / Memory        │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                     ExecutionBackendRegistry
                  ┌────────────┴────────────┐
                  │                         │
        ManagedExecutionBackend     HerdrExecutionBackend
                  │                         │
          Pi SDK AgentSession        Herdr Socket Client
                  │                         │
                  │                 workspace / tab / pane
                  │                         │
                  │                 Herdr Agent: pi-cli
                  │                         │
                  │                AILI Child Bootstrap
                  │                         │
                  └────────────┬────────────┘
                               │
                   Canonical Activity / Result Events
                               │
                  ┌────────────┴────────────┐
                  │                         │
                 TUI                       Web
```

其中必须增加 `Run`，不要把 Herdr pane/process 塞进现有 Agent 状态。

---

# 3. 领域模型

## 3.1 身份层级

| 对象 | 生命周期 | 作用 |
|---|---|---|
| `AgentId` | 长期稳定 | 逻辑 Agent 身份，仍是内部权威引用 |
| `AgentAlias` | 长期、可读 | 用户显示名；可以自动后缀，但不能作为内部主键 |
| `JobId` | 一次请求 | 一次 `sub` 或 `hub send` 工作请求 |
| `TurnId` | 一次模型轮次 | 与 provider/tool/result 审计关联 |
| `RunId` | 一次进程实例 | 一个实际 Pi SDK Session attachment 或 Herdr 进程 incarnation |
| `DriverSessionId` | 可跨 Run | Pi conversation/session 文件的稳定引用 |
| `HerdrPaneId` | Surface 当前地址 | pane move 后可能变化，不可当长期身份 |
| `HerdrAgentName` | live alias | Herdr 要求 live Agent 唯一；进程退出后失效 |

禁止将用户的 `name` 直接作为 Herdr agent name。Herdr live name 使用机器生成值：

```text
ap-<run-id-short>
```

用户可读名称放入：

- AILI AgentAlias；
- Herdr tab/pane label；
- Herdr metadata；
- TUI/Web 展示。

## 3.2 新增 RunRecord

建议模型：

```ts
type ExecutionBackendKind = "managed" | "herdr";
type AgentDriverKind = "pi-sdk" | "pi-cli";

type RunLifecycle =
  | "allocated"
  | "starting"
  | "live"
  | "stopping"
  | "stopped"
  | "lost"
  | "failed";

interface RunRecord {
  schemaVersion: 1;
  runId: string;
  agentId: string;
  jobId?: string;
  turnId?: string;

  backend: ExecutionBackendKind;
  driver: AgentDriverKind;
  lifecycle: RunLifecycle;

  backendRef: ManagedRunRef | HerdrRunRef;
  driverSessionId?: string;

  loadoutHash: string;
  controlMode: "aili" | "human" | "mixed";

  createdAt: string;
  startedAt?: string;
  lastActivityAt?: string;
  stoppedAt?: string;

  exitCode?: number;
  stopReason?: string;
  failure?: BoundedFailure;
}
```

Backend ref：

```ts
interface ManagedRunRef {
  kind: "managed";
  sessionId: string;
}

interface HerdrRunRef {
  kind: "herdr";
  socketIdentity: string;
  workspaceId: string;
  tabId: string;
  paneId: string;
  herdrAgentName: string;
  lastHerdrEventSeq?: number;
  bridgePath: string;
  eventLogPath: string;
}
```

## 3.3 生命周期与活动状态分开

权威生命周期：

```text
Agent / Job / Turn：沿用现有状态机
Run：allocated → starting → live → stopping → stopped
                                  └────────→ lost / failed
```

活动状态只是 overlay：

```text
idle
working
provider
streaming
tool:<name>
waiting_question
waiting_permission
blocked
unknown
stalled
recovered
```

不能把 `stalled` 写成 Agent/Job 的终止状态；它只是“Run 仍 live，但长时间无有效活动”。

---

# 4. 设置与开关

字段名称需要适配仓库现有 settings loader；以下为目标语义，不要求机械照搬命名。

```jsonc
{
  "aili": {
    "subagents": {
      "backend": "managed",
      "sessionOverride": null,

      "managed": {
        "enabled": true
      },

      "herdr": {
        "enabled": false,
        "socketPath": "auto",
        "driver": "pi-cli",

        "workspaceMode": "per-parent-session",
        "surfaceLayout": "tab-per-agent",
        "focusOnSpawn": false,

        "startupTimeoutMs": 30000,
        "stalledAfterMs": 60000,

        "maxLiveSurfaces": 8,
        "retainSurface": "until-release",
        "retainFailedSurface": true,

        "resumePolicy": "strict",
        "allowManualControl": true
      }
    },

    "browser": {
      "enabled": false,
      "provider": "native"
    },

    "promptMiddleware": {
      "enabled": true
    },

    "memory": {
      "observational": {
        "enabled": false
      },
      "durableProvider": "mempalace"
    }
  }
}
```

增加直接用户命令：

```text
/aili-agent-backend status
/aili-agent-backend managed
/aili-agent-backend herdr
```

命令默认设置当前 session；如现有配置系统支持 scope，可扩展：

```text
/aili-agent-backend herdr --scope project
/aili-agent-backend managed --scope global
```

后端切换时 UI 必须明确提示：

```text
New Agents: herdr
Existing Agents: unchanged
```

---

# 5. ExecutionBackend 抽象

新建建议目录：

```text
src/runtime/persistent-agents/backends/
├── types.ts
├── registry.ts
├── managed.ts
└── herdr/
    ├── adapter.ts
    ├── client.ts
    ├── protocol.ts
    ├── driver-pi.ts
    ├── bridge-client.ts
    ├── reconcile.ts
    ├── naming.ts
    └── doctor.ts
```

接口建议：

```ts
interface ExecutionBackend {
  readonly kind: ExecutionBackendKind;
  readonly capabilities: BackendCapabilities;

  preflight(input: BackendPreflightInput): Promise<BackendPreflightResult>;

  createAgent(
    input: BackendCreateAgentInput,
    signal: AbortSignal,
  ): Promise<BackendAgentHandle>;

  restoreAgent(
    input: BackendRestoreAgentInput,
    signal: AbortSignal,
  ): Promise<BackendAgentHandle>;

  submitTurn(
    handle: BackendAgentHandle,
    input: BackendTurnInput,
    signal: AbortSignal,
  ): Promise<BackendTurnHandle>;

  steer(
    handle: BackendAgentHandle,
    input: BackendSteerInput,
  ): Promise<BackendMessageReceipt>;

  waitTurn(
    handle: BackendAgentHandle,
    turn: BackendTurnHandle,
    signal: AbortSignal,
  ): Promise<BackendTurnResult>;

  abortTurn(
    handle: BackendAgentHandle,
    turn: BackendTurnHandle,
    reason: string,
  ): Promise<void>;

  readTranscript(
    handle: BackendAgentHandle,
    request: TranscriptReadRequest,
  ): Promise<TranscriptChunk>;

  inspect(
    handle: BackendAgentHandle,
  ): Promise<BackendInspection>;

  release(
    handle: BackendAgentHandle,
    reason: string,
  ): Promise<void>;

  reconcile(
    records: readonly RunRecord[],
  ): Promise<BackendReconcileResult>;
}
```

`production.ts` 不得继续直接依赖某一种 Session 创建方式。它负责：

1. 公共预检；
2. Agent/Job/Turn/Run 分配；
3. scheduler；
4. workspace/permission/model/loadout；
5. 调用 backend；
6. 处理统一结果；
7. storage/delivery。

`managed.ts` 只是把当前 `session-factory.ts`、`runtime.ts` 等逻辑包进接口，第一阶段不得改变现有语义。

---

# 6. Driver 能力模型

新增能力声明，避免“Herdr 能启动某 CLI”被误判为“AILI 已完整支持该 CLI”。

```ts
interface DriverCapabilities {
  structuredEvents: boolean;
  exactTurnCompletion: boolean;
  exactSessionResume: boolean;
  safeBoundarySteer: boolean;
  toolPolicy: boolean;
  permissionBroker: boolean;
  sandbox: boolean;
  formalResult: boolean;
  contextFork: boolean;
  manualTakeover: boolean;
}
```

首版：

```ts
managed/pi-sdk = all true except manualTakeover
herdr/pi-cli   = all true after child bridge completed
```

未来其他 Herdr Agent kinds：

```text
可以启动 ≠ 可以正式用于 AILI Persistent Agents
```

若某任务需要 write/bash/formal result，而 Driver 不具备相应能力，必须在批量预检阶段失败，不得降级运行。

---

# 7. Herdr Adapter

## 7.1 使用 Raw Socket API

AILI 是长期运行的自定义控制平面，应使用 Herdr raw socket API，不要靠 shell 拼接和解析 CLI 输出作为主路径。

需要实现：

- protocol handshake；
- `session.snapshot`；
- `events.subscribe`；
- workspace/tab/pane create/list/get/focus/close；
- `agent.start`；
- `agent.prompt`；
- `agent.wait`；
- `agent.read`；
- `agent.focus`；
- `agent.send_keys`；
- `pane.report_metadata`；
- `pane.report_agent_session`；
- `pane.close`；
- server disconnect/reconnect。

重连必须按以下顺序避免 bootstrap gap：

1. 建立 event subscription；
2. 等订阅确认；
3. 暂存事件；
4. 调用 `session.snapshot`；
5. 安装 snapshot；
6. 顺序应用暂存事件；
7. 持续消费事件。

增加 Herdr protocol version guard。版本或 schema 不兼容时显式失败，不得退回终端文本猜测。

## 7.2 Surface 组织

默认：

```text
一个 AILI Parent Session
    → 一个 Herdr Workspace

一个逻辑 Agent
    → 一个 Tab
    → 一个 root Pane
```

理由：

- Agent 数量多时，tab 比不断切小 pane 更可用；
- 每个 Agent 获得完整终端；
- 仍可通过 Herdr Agent 列表整体观测；
- 以后可增加 `pane-grid` 布局，但不是首版阻塞项。

Metadata：

```json
{
  "aili.schema": 1,
  "aili.parentSessionId": "...",
  "aili.agentId": "...",
  "aili.runId": "...",
  "aili.driverSessionId": "...",
  "aili.backend": "herdr",
  "aili.loadoutHash": "..."
}
```

不要在 Herdr metadata 中放授权 token、credential 或完整 prompt。

## 7.3 启动流程

Herdr spawn 必须分两步：

```text
创建 workspace/tab/pane
        ↓
herdr agent.start(kind=pi)
```

不要预测 workspace/tab/pane ID，必须读取 Herdr 返回的权威 ID。

启动 Pi CLI 时：

- 禁用默认扩展发现；
- 只加载 AILI Child Bootstrap；
- 只加载 loadout 允许的工具/扩展/skills；
- 传入已解析 model/thinking/speed tier；
- 传入 cwd/workspace；
- 传入新建或恢复的 Pi session；
- 传入 bridge/event log/loadout 的路径与 run token；
- 等 Herdr 检测 Agent ready；
- 等 Child Bridge 完成 handshake；
- 两者都成功后 Run 才进入 `live`。

仅 Herdr 显示 idle 不足以证明 AILI bridge 已就绪。

---

# 8. AILI Child Bootstrap 与 Bridge

这是 Herdr 后端能否真正达到现有安全和控制能力的关键。不能只启动一个裸 Pi CLI。

建议新增：

```text
src/runtime/persistent-agents/herdr-child/
├── index.ts
├── bridge-server.ts
├── event-log.ts
├── security-bootstrap.ts
├── activity-recorder.ts
├── interaction-client.ts
└── auto-exit.ts
```

## 8.1 Bridge 形态

每个 Run 由 child 进程创建：

```text
<sidecar>/runs/<runId>/
├── loadout.json
├── events.jsonl
├── bridge.sock
├── result.json
└── cost.json
```

要求：

- `bridge.sock` 权限 0600；
- child 作为 socket server，AILI parent 作为 client；
- run token 只通过安全环境变量传入；
- handshake 校验 runId、agentId、loadoutHash、token；
- event 同时：
  - 实时通过 socket 发送；
  - 追加到 `events.jsonl`；
- AILI 重启后可从最后 seq 继续读取并重新连接；
- event log 有大小上限和轮转；
- 所有消息都有单调 seq、idempotency key、ack。

Child Bridge 命令：

```text
status
submit_turn
steer
answer_interaction
abort_turn
shutdown
```

Child Bridge 事件：

```text
bridge.ready
session.ready
turn.started
provider.started
provider.streaming
tool.started
tool.updated
tool.completed
interaction.requested
interaction.resolved
turn.completed
turn.failed
session.idle
session.exiting
session.exited
```

## 8.2 完成证据

权威完成证据来自：

```text
turn.completed
+ driverSessionId
+ assistant result
+ usage/cost
+ output hash
```

Herdr `idle/done` 只用于辅助状态。Herdr 本身不跟踪单独 Turn，因此不能单独用来 settle AILI Job。

若 Bridge 失联但 Herdr 仍显示 Agent idle：

```text
Run = live
Activity = degraded / unknown
Job = 不得标记 completed
```

需要重连或明确人工处理。

## 8.3 安全 Bootstrap

Herdr 是外部进程，现有 child sandbox 不能被简单绕过。

必须实现以下二选一，推荐先采用 A：

### A. 每个执行进程拥有一个受控 SandboxController

- 从不可变 loadout 初始化一次；
- child 不暴露 reconfigure/reset/downgrade 命令；
- loadout 带 hash；
- profile mismatch、provider missing、degraded 时 fail closed；
- permission ask 通过 InteractionBroker 回 Parent；
- credential guard 与 output redaction 在 child 和 parent 双层执行。

### B. 全部工具 RPC 回 Parent

安全更强，但改动明显更大，可作为后续重构。

首版若 A 尚未达到安全等价，不得让 Herdr backend 执行 write/bash 角色。可以先只开放 read-only role，直到安全验收完成。

---

# 9. Spawn 语义

## 9.1 公共 `sub` 保持兼容

首版不改现有字段，不增加 model-facing `backend`。

```text
task
context
agent
name
model
async
tools
workspace
writeScope
cwd
```

后端选择在进入 `sub` 处理前由用户配置解析。

后续可增加：

```text
sessionMode
snippets
```

但需要单独 schema 版本与兼容测试。

## 9.2 新建 Agent 流程

```text
1. 解析 Agent selector
2. 解析用户 backend 设置
3. 校验 profile.supportedBackends
4. 模型/thinking 授权
5. tools intersection
6. credential / permission / sandbox preflight
7. workspace / writeScope / resource lease
8. 生成 immutable LoadoutSnapshot
9. 批量全部预检
10. 分配 Agent / Job / Turn / Run
11. scheduler 排队
12. backend.createAgent
13. backend.submitTurn
14. 统一 result / output / delivery
```

Herdr pane 不得在第 10 步前创建，避免预检失败后留下垃圾 Surface。

## 9.3 不做静默 fallback

以下情况全部显式失败：

- Herdr daemon 不可达；
- protocol 不支持；
- Driver 不支持任务能力；
- Child Bridge 未就绪；
- session/loadout 不完整；
- sandbox 不可用；
- Herdr agent start timeout。

不得自动改走 managed。

---

# 10. 批量任务

现有“所有 item 先验证，再创建 Agent”的语义必须保留。

新增 `BatchId` 和聚合状态，但不要在首版改变运行失败语义。

```ts
interface BatchRecord {
  batchId: string;
  parentSessionId: string;
  backend: ExecutionBackendKind;
  itemAgentIds: string[];
  state:
    | "validating"
    | "admitted"
    | "running"
    | "settled"
    | "failed-preflight";
}
```

首版规则：

1. 一个 batch 使用同一个已解析 backend；
2. 所有 item 必须支持该 backend；
3. 任一 item 预检失败：
   - 不分配任何 Agent；
   - 不创建任何 Herdr Surface；
4. 预检通过后的运行失败按 item 独立记录；
5. 其他 item 不因一个 Agent runtime failure 自动取消；
6. `async:false` 通过统一 wait 聚合，不使用 Herdr 特有阻塞路径；
7. 增加 batch-level activity 和结果摘要。

未来再考虑：

```text
startFailurePolicy: continue | cancel-new
```

不要在第一版引入会破坏现有 batch 行为的默认值。

---

# 11. 并发与背压

## 11.1 两类 permit

必须区分：

### Active Turn Permit

沿用当前 scheduler：

- per-parent 32 active turns；
- FIFO；
- 同一 Agent 不允许并发 Turn；
- waiting question/permission 按现有语义暂停；
- nested 行为首版不改变。

### Herdr Surface Permit

新增：

- 限制 live Herdr pane/process 数；
- idle Agent 可继续占 Surface；
- 与 active turn permit 分开；
- 默认例如 8，可配置；
- 超限时 Agent 已 admitted，但 Run 等待 surface；
- 不因 `stalled` 自动释放；
- 只有进程确认停止或明确 release 后释放。

## 11.2 首版禁止顺手重做嵌套并发

当前：

- `general` 才能 spawn 指定 specialized Agent；
- specialized Agent 不能继续 spawn；
- child-to-grandchild 同步；
- depth ceiling 保持。

不要在 Herdr 接入 PR 中同时改为 Amos 式任意递归异步 spawn。

第二阶段若要开放，必须引入：

```text
global turn budget
+ backend budget
+ root tree descendant budget
+ profile spawn allowlist
```

并解决 Parent 等 child 时释放 active execution permit 的问题，不能通过“继承 permit 后无限增殖”绕过全局上限。

---

# 12. Agent Session、Resume 与重启恢复

## 12.1 Context / Session Mode

保留当前默认的显式上下文语义，新增统一枚举：

```text
explicit      当前行为：task/context/trusted refs，不复制 Parent turns
lineage       explicit + Parent session lineage metadata
summary       explicit + 有界、确定性的 Parent summary
fork          复制 Parent conversation，直接用户显式开启
```

默认：

```text
explicit
```

`fork` 必须：

- Driver 支持；
- 用户明确开启；
- 展示 token/cache/privacy 成本；
- 不得成为默认值。

## 12.2 Loadout Snapshot

每个 Agent 创建时保存：

```ts
interface LoadoutSnapshot {
  schemaVersion: 1;

  agentSelector: string;
  agentProfileHash: string;
  rolePromptHash: string;

  backend: ExecutionBackendKind;
  driver: AgentDriverKind;

  effectiveModel: string;
  thinking: string;
  speedTier: string;

  tools: string[];
  toolProviderHashes: Record<string, string>;
  skills: string[];
  snippets: AppliedSnippetRef[];

  contextMode: string;
  cwd: string;
  projectRoot: string;
  workspaceMode: string;
  writeScope: WriteScope;

  permissionProfileHash: string;
  sandboxProfileHash: string;
  spawnAllowlist: string[];

  browserProvider?: string;
  memoryPolicyHash?: string;

  provenance: Record<string, unknown>;
  createdAt: string;
}
```

Resume 有效能力：

```text
frozen loadout ceiling
∩ current hard guards
∩ current sandbox availability
∩ current project trust
```

规则：

- 权限扩大永不自动发生；
- 当前安全规则可以收紧旧 Agent；
- 发生收紧时 UI 显示 diff；
- 缺失必需工具/model/profile 时拒绝恢复；
- 不得用“找不到 loadout”作为 unrestricted resume 的理由。

## 12.3 AILI 重启后 Reconcile

Herdr backend 的优势之一是外部进程可继续存活。

启动时：

1. 读取 AILI Run sidecar；
2. 建立 Herdr subscription + snapshot；
3. 通过 pane metadata、runId、driverSessionId 找到 Surface；
4. 检查 child bridge socket；
5. 从 `events.jsonl` 补齐 last seq 之后的事件；
6. 若进程和 bridge 都正常：
   - Run 重新 attach；
   - Job/Turn 继续；
7. 若 pane 存在、bridge 丢失：
   - 标记 degraded；
   - 不自动判 completed；
8. 若 pane/process 不存在：
   - Run `lost`；
   - running Turn `interrupted`；
   - queued Job 沿用现有 `unexecuted` 语义；
   - 不自动 replay。

Managed backend 继续维持当前重启行为，不因 Herdr 接入而改变。

## 12.4 完成后继续

`hub send` 对 Herdr Agent：

- Run 仍 live、Agent idle：复用当前 Pi CLI process/session；
- Run 已停止、session 可恢复：创建新 Run，可复用空闲 pane或创建新 tab，按严格 loadout 恢复；
- session 文件缺失：明确失败；
- backend 设置已改变：仍使用 Agent 原 backend。

---

# 13. `hub` 扩展

现有动作保留：

```text
list
send
wait
inbox
output
history
jobs
cancel
model
```

建议增加：

```text
focus
activity
interactions
answer
```

语义：

- `focus`：Herdr backend 聚焦对应 pane；managed 返回“不支持执行 Surface”；
- `activity`：读取统一 ActivityBus，不直接返回无限终端文本；
- `interactions`：列出 owned pending/resolved Interaction；
- `answer`：按 interactionId 回答问题或授权。

`hub list` 与 renderer 增加：

```text
backend
driver
runId
surface
activity
lastActivityAt
interactionCount
controlMode
```

---

# 14. InteractionBroker

不要让 `ask-user-question.ts`、permission bridge、Herdr blocked UI、模型 override、workspace conflict 各自维护一套交互状态。

新增：

```text
src/runtime/interactions/
├── types.ts
├── broker.ts
├── storage.ts
├── policy.ts
├── tui.ts
└── web.ts
```

数据模型：

```ts
type InteractionType =
  | "question"
  | "permission"
  | "model-override"
  | "workspace-conflict"
  | "confirmation";

type InteractionStatus =
  | "pending"
  | "answered"
  | "approved"
  | "denied"
  | "cancelled"
  | "expired";

interface InteractionRecord {
  interactionId: string;
  type: InteractionType;
  status: InteractionStatus;

  parentSessionId: string;
  agentId?: string;
  jobId?: string;
  turnId?: string;
  runId?: string;

  prompt: string;
  options?: InteractionOption[];

  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: "parent-agent" | "user-tui" | "user-web" | "policy";
  answer?: string;
}
```

流程：

```text
Child asks / requests permission
        ↓
InteractionBroker
        ↓
Parent Agent 可直接回答？
        ├─ 是 → answer
        └─ 否 → ask-user-question TUI/Web
        ↓
Child Bridge resume
```

要求：

- pending Interaction 阻止 auto-exit；
- 只暂停对应 Job；
- Parent/UI 丢失时 fail closed；
- Herdr `blocked` 只是辅助探测；
- 若出现未被 Broker 解释的 blocked UI，标记 `unexpected-blocked` 并提供 focus；
- `ask-user-question.ts` 变成 InteractionBroker 的一个 UI renderer，而不是独立权威逻辑。

---

# 15. ActivityBus 与白盒观测

新增统一事件：

```ts
type ActivityEventType =
  | "run.started"
  | "run.ready"
  | "turn.started"
  | "provider.started"
  | "provider.streaming"
  | "tool.started"
  | "tool.updated"
  | "tool.completed"
  | "interaction.requested"
  | "interaction.resolved"
  | "turn.completed"
  | "turn.failed"
  | "run.stalled"
  | "run.recovered"
  | "run.stopped"
  | "run.lost";
```

每个事件包含：

```text
seq
timestamp
parentSessionId
agentId
jobId
turnId
runId
backend
driver
payload
```

来源：

- managed：从现有 AgentSession/tool/provider hooks 适配；
- herdr：
  - Child Bridge 是精确事件；
  - Herdr lifecycle、pane output、focus 是辅助事件。

TUI/Web 每个 Agent 至少显示：

```text
Alias / Agent selector
Backend / Driver
Model / Thinking / Speed
Agent / Job / Turn / Run IDs
cwd / workspace / writeScope
current activity / tool / elapsed
last activity time
children
pending question/permission
files touched
tokens / cost
loadout hash
session/context mode
applied snippets
memory injected
control mode
Focus in Herdr
```

Stall：

```text
last valid structured event > stalledAfterMs
AND Run 仍 live
→ activity = stalled
```

恢复收到事件后：

```text
stalled → recovered → current activity
```

不得因 stalled 自动杀进程或 settle Job。

---

# 16. AILI Native Browser

## 16.1 Provider 模型

保留 Playwright MCP，不退役：

```text
browser.provider
├─ native
└─ playwright-mcp
```

新增命令：

```text
/browser status
/browser on
/browser on native
/browser on playwright-mcp
/browser off
```

目标工具：

```text
browser_goto
browser_snapshot
browser_eval
browser_console
browser_network
browser_click
browser_fill
browser_screenshot
browser_tabs
browser_upload
browser_close
```

`browser_snapshot`、tabs、upload 应补齐，不要只复制最小工具集。

## 16.2 Lazy Capability

Browser 默认关闭。关闭时：

- 不注册工具 schema；
- 不启动 Chromium；
- 不加载 Playwright；
- 不污染系统 Prompt。

开启时通过现有 capability/provider 体系激活。

更新 `manifests/capabilities.json`：

```text
browser.qa
provider:
  aili-native-browser
  optional fallback playwright-mcp
```

## 16.3 隔离与安全

不要使用跨所有项目的无边界 singleton profile。

建议：

```text
browser profile scope = trusted project + Agent
```

默认一个 Agent 一个 context，避免多个 Agent 同时操作同一 page。

安全要求：

- console/network/header 默认脱敏；
- Authorization、Cookie、API key 不直接回模型；
- 读取敏感 header 需要 InteractionBroker 直接用户授权；
- browser output 不自动进入 durable memory；
- `browser_eval` 属于高风险能力，应受 role/tool/policy 限制；
- profile path 必须经过 trusted project/path boundary 校验。

Herdr child 若拥有 browser tools，必须把 browser provider 和 profile scope 写入 loadout。

## 16.4 代码来源

`pi-config` 的 Browser 与 Prompt Snippets 可作为行为参考，但不要直接大段复制到可分发包中。采用 clean-room 重写，保留设计来源说明；若决定复制源代码，先确认明确授权并更新第三方声明。

---

# 17. Prompt Snippets → Prompt Middleware

建议目录：

```text
src/runtime/prompt-middleware/
├── types.ts
├── loader.ts
├── resolver.ts
├── assembler.ts
├── policy-patch.ts
├── provenance.ts
└── ui.ts
```

定义：

```ts
interface PromptModifierDefinition {
  id: string;
  name: string;
  description?: string;

  placement: "prepend" | "append";
  order: number;

  scopes: Array<"main" | "subagent" | `role:${string}`>;
  oneShot: boolean;

  requires?: string[];
  conflicts?: string[];

  runtimePolicyPatch?: {
    denyTools?: string[];
    requireCapabilities?: string[];
    forceReadOnly?: boolean;
  };

  body: string;
  sourcePath: string;
  hash: string;
}
```

应用顺序：

```text
Stable prefix
  System
  hard runtime policy
  role definition
  static skills/project context

Dynamic turn block
  bounded memory recall
  turn context delta
  prepend snippets
  user task/message
  append snippets
  runtime delta
```

一轮 snippet 不要改写稳定 System Prefix，避免破坏缓存。

必须实现：

- Alt+S；
- `/snippets`；
- preview；
- one-shot send 后清空；
- project/user discovery；
- requires/conflicts；
- applied snippet provenance；
- main/subagent scope；
- role allowlist；
- deterministic order。

最关键的是语义指令与运行时约束联动：

```text
diagnose-report snippet
    +
forceReadOnly
    +
deny write/edit/mutating bash
```

不能只在 Prompt 写“不要改代码”。

`sub` 后续可以增加：

```json
{
  "snippets": ["verify-not-assume", "diagnose-report"]
}
```

但只能选择 role 允许的 snippet，且 runtime patch 只能收紧权限，不能扩权。

---

# 18. Observational Memory + MemPalace

## 18.1 分层架构

```text
Conversation / Tool events
          ↓
Observational Memory Controller
          ↓
Atomic Observation Ledger
          ↓
Session Consolidation
          ↓
Memory Promotion Policy
     ┌────┴─────┐
     │          │
 discard     MemPalace
 ephemeral    durable
```

职责：

- Observational Memory：什么时候观察、怎么提炼、怎么压缩、当前 Session 记什么；
- MemPalace：跨 Session、跨 Run 的 durable storage 与 retrieval。

不要二选一，也不要把全部 observation 直接塞进 MemPalace。

## 18.2 三层 Memory

| 层 | 生命周期 | 内容 |
|---|---|---|
| Tail | 当前上下文 | 最近原始消息和工具输出 |
| Observation | 当前 Session/Agent | 发现、尝试、失败、决策过程 |
| Durable | Project/Long-term | 稳定事实、架构决定、惯例、重要修复 |

只有 Durable 才进入 MemPalace。

## 18.3 Observer Worker

Observer/consolidator 是系统内部 worker，不应因为用户把 public subagent backend 切到 Herdr，就在 Herdr 中创建大量可见 pane。

要求：

```text
public Persistent Agent backend = managed/herdr 用户设置
internal memory worker backend = managed-internal 固定
```

内部 worker：

- 不出现在普通 `hub list`；
- 不允许 spawn；
- 不加载 observational memory 本身；
- 严格工具 allowlist；
- 有独立 cost/activity 统计；
- 不阻塞前台 Turn；
- observer 并发有上限。

## 18.4 Durable Promotion

Child 不直接写 shared MemPalace。

```text
Child
  → memory_candidate
  → Parent Memory Controller
  → redact / dedupe / conflict / confidence
  → diary 或 shared
```

建议结构：

```ts
interface MemoryCandidate {
  id: string;
  kind:
    | "fact"
    | "decision"
    | "invariant"
    | "procedure"
    | "failure-pattern"
    | "preference";

  scope: "agent" | "project";
  content: string;

  sourceSessionId: string;
  sourceAgentId: string;
  sourceJobId?: string;
  sourceRunId?: string;

  confidence: number;
  createdAt: string;

  supersedes?: string[];
  expiresAt?: string;
}
```

规则：

- `agent` diary 可以自动写入严格过滤后的候选；
- `shared` promotion 必须沿用现有显式 authority；
- credential/private material 永不 promotion；
- 有冲突时写 `supersedes`，避免新旧记忆同时作为真相；
- durable recall 按 task 查询并有 token budget；
- Prompt provenance 记录注入的 memory IDs/hash。

## 18.5 与现有 Compaction 的关系

不要替换 `context-runtime.ts`。

Observational Memory 提供一个 `MemoryContextProvider`：

```text
active observations
+ memory map
+ journey/orientation
```

由现有 compaction runtime 按确定顺序注入。

需要防止：

- observation 与 verbatim tail 双重表示；
- branch/tree 回退后 ledger 错位；
- durable memory 被 tree rollback；
- memory worker 触发 memory worker 递归。

首版默认 opt-in，提供：

```text
/memory-auto status
/memory-auto on
/memory-auto off
/memory-auto compact
/memory-auto consolidate
```

---

# 19. Prompt / Context / Run Inspector

新增统一 Inspector，而不是分散命令。

建议：

```text
/agent-inspect <agentId>
/run-inspect <runId>
/context-inspect
```

Web 页面增加对应详情。

展示：

```text
Effective Prompt
├─ System
├─ runtime policy
├─ role
├─ skills
├─ memory recall
├─ snippets
├─ user task
└─ runtime delta

Capability
├─ requested tools
├─ effective tools
├─ denied tools and reason
├─ browser provider
└─ backend/driver capabilities

Context
├─ token estimate by section
├─ stable prefix
├─ dynamic block
├─ tool schemas
├─ memory
├─ tool outputs
└─ compaction tail

Run
├─ backend / driver
├─ session / pane / process
├─ activity timeline
├─ interactions
├─ model/thinking provenance
├─ workspace/writeScope
└─ output/result hashes
```

特别记录：

- requested/effective model；
- thinking source；
- backend source；
- loadout diff on resume；
- active snippets；
- memory injection；
- manual/external input；
- cache-stable prefix 与本轮 dynamic 内容。

---

# 20. 建议代码落点

现有重点文件：

```text
src/runtime/persistent-agents/production.ts
src/runtime/persistent-agents/runtime.ts
src/runtime/persistent-agents/session-factory.ts
src/runtime/persistent-agents/scheduler.ts
src/runtime/persistent-agents/storage.ts
src/runtime/persistent-agents/hub.ts
src/runtime/persistent-agents/permission.ts
src/runtime/persistent-agents/policy.ts
src/runtime/persistent-agents/model-selection.ts
src/runtime/persistent-agents/output-delivery.ts
src/runtime/persistent-agents/live-evidence-contract.ts

src/runtime/native-integrations.ts
src/runtime/mempalace.ts
src/runtime/context-runtime.ts
src/runtime/context-pressure.ts
src/runtime/web/
src/web/

extensions/index.ts
manifests/capabilities.json
package.json
THIRD_PARTY_NOTICES.md
```

建议新增：

```text
src/runtime/persistent-agents/backends/
src/runtime/persistent-agents/herdr-child/
src/runtime/persistent-agents/activity/
src/runtime/interactions/
src/runtime/browser/
src/runtime/prompt-middleware/
src/runtime/memory/observational/
src/runtime/inspect/
```

实施前必须先根据当前代码输出一份实际映射，确认：

- 哪些职责目前在 `production.ts`；
- 哪些职责在 `runtime.ts`；
- session factory 是否可直接抽接口；
- scheduler permit 如何释放；
- permission/sandbox 是否绑定当前进程；
- storage schema 的迁移入口；
- Web/TUI 共享事件路径；
- settings loader 和 command 注册位置。

禁止先凭本方案猜路径大规模移动代码。

---

# 21. 分阶段实施

## Phase 0：审计、ADR、许可证和测试基线

只调查，不改行为：

1. 画出当前 `sub → scheduler → runtime → session → delivery` 调用图；
2. 列出所有 Agent/Job/Turn storage schema；
3. 列出 permission/sandbox 进程假设；
4. 记录当前完整测试基线；
5. 写 ADR：
   - 双后端；
   - Run entity；
   - Herdr 是 Surface；
   - Driver capability；
   - backend 不允许模型选择；
6. 确认第三方许可证和 attribution。

验收：无行为变化。

## Phase 1：抽象 Managed Backend

1. 新增 `ExecutionBackend`、registry、RunRecord；
2. 当前代码包成 `ManagedExecutionBackend`；
3. storage 缺失 backend 时默认解释为 managed；
4. `sub`/`hub` 输出增加 backend/runId；
5. 默认设置 managed；
6. 所有现有测试通过。

验收：用户看不到功能变化，除新增元数据。

## Phase 2：Herdr Read-only Vertical Slice

1. Herdr client + doctor；
2. snapshot/subscription/reconcile；
3. workspace/tab/pane；
4. `agent.start kind=pi`；
5. child bridge handshake/events；
6. read-only roles；
7. `sub async`、`hub wait/send/output/history/cancel/focus`；
8. AILI 重启 reattach；
9. 无静默 fallback。

验收：read-only Agent 可完整运行、可见、可接管、可恢复。

## Phase 3：Herdr 完整安全与调度等价

1. Child security bootstrap；
2. write/bash/sandbox/permission；
3. InteractionBroker；
4. batch；
5. surface permit；
6. model/thinking/speed；
7. formal result/evidence；
8. loadout strict resume；
9. stalled/recovered；
10. failed startup cleanup。

验收：正式角色可在 managed/herdr 下通过同一套权限和结果契约。

## Phase 4：ActivityBus 与白盒 UI

1. managed/herdr 统一活动事件；
2. TUI renderer；
3. Web Agent tree/timeline/detail；
4. Herdr focus；
5. prompt/context/loadout inspector；
6. manual input 标记。

验收：两后端观测字段一致，Herdr 多出 Surface 操作。

## Phase 5：Native Browser 与 Prompt Middleware

两个独立 workstream，可并行：

- Native Browser + provider switch + snapshot/tabs/upload；
- Prompt Middleware + snippets + runtime policy patch + provenance。

验收：Playwright MCP 仍可选；诊断 snippet 硬限制写工具。

## Phase 6：Observational Memory + MemPalace

1. branch/session ledger；
2. observer/consolidator internal workers；
3. deterministic memory context；
4. promotion candidate；
5. MemPalace diary/shared；
6. dedupe/supersedes；
7. recall budget；
8. cost/status；
9. credential redaction。

验收：即使 Agent 没主动调用 memory，稳定信息也能按策略形成候选；不是所有过程都进入 durable store。

---

# 22. 测试矩阵

## 22.1 必须保持的现有测试

至少执行：

```text
npm run typecheck
npm test
npm run test:integration
npm run validate:capabilities
npm run validate:generated
npm run validate:package
npm run test:audit-redaction
npm run test:doctor
```

## 22.2 Backend 单元测试

- backend 设置解析与优先级；
- existing Agent backend 冻结；
- managed adapter 行为等价；
- backend unsupported capability；
- no fallback；
- loadout intersection；
- old storage migration；
- Herdr name normalization；
- pane ID move 更新；
- duplicate/ambiguous identity。

## 22.3 Herdr Fake Server 测试

实现 fake socket server：

- handshake；
- snapshot + buffered events；
- start/prompt/wait/read/focus/close；
- reconnect；
- version mismatch；
- stale generation；
- pane moved；
- Agent disappeared；
- blocked/idle/done/unknown；
- server disconnect。

## 22.4 Child Bridge 测试

- handshake token；
- event seq；
- replay from event log；
- duplicate ack；
- parent restart reconnect；
- turn result；
- steer；
- interaction；
- abort；
- auto-exit barrier；
- corrupted loadout；
- sandbox mismatch；
- credential redaction。

## 22.5 并发与批量

- 全 batch 预检失败时零 Agent、零 pane；
- 32 turn limit 保持；
- Herdr surface limit；
- same Agent serial turns；
- queued cancel；
- waiting interaction 不死锁；
- Agent release 释放 surface；
- 一个 item runtime failure 不错误取消其他 item；
- restart 后 permit reconciliation。

## 22.6 Live Operation-gated 验收

在真实 Herdr + Pi 环境中：

1. managed 默认仍正常；
2. 切换 herdr；
3. spawn read-only Agent；
4. 可在 Herdr 看到独立 tab/pane；
5. `hub send`；
6. 人工 focus；
7. `hub cancel`；
8. 完成后 resume；
9. 关闭并重启主 Pi，外部 Agent 继续并重新 attach；
10. ask/permission；
11. write/bash sandbox；
12. batch；
13. 并发；
14. output/history；
15. 切回 managed，新 Agent 走 managed，旧 Herdr Agent 仍走 Herdr。

---

# 23. 验收标准

全部满足才可以把 Herdr 标记为正式 backend：

- 当前 managed backend 零语义回归；
- backend 切换只影响新 Agent；
- 模型不能自行切换 backend；
- `sub`/`hub` 原有动作都能跨 backend 工作；
- AgentId 仍是权威身份；
- 同一 Agent 不并发 Turn；
- 批量预检保持 all-or-none；
- AILI scheduler 仍是并发权威；
- Herdr process 不绕过 model/tool/permission/sandbox/workspace policy；
- 完成不靠终端文本或 Herdr idle 猜测；
- Parent 重启可 reattach Herdr Run；
- 失联时不自动 replay；
- loadout resume 不扩权；
- pending interaction 阻止 auto-exit；
- Web/TUI 能看到 backend/driver/run/activity/prompt/memory；
- Playwright MCP 未被删除；
- MemPalace 未被 observations 污染；
- 第三方许可证与 NOTICE 完整。

---

# 24. 明确禁止事项

- 禁止删除或废弃当前 Persistent Agents；
- 禁止把 Herdr 当作 scheduler；
- 禁止让 model-facing `sub` 自由选择 backend；
- 禁止按用户 alias 作为内部主键；
- 禁止从终端 ANSI 文本推断权威完成；
- 禁止 Herdr backend 静默 fallback managed；
- 禁止恢复旧 Agent 时扩大权限；
- 禁止在 Herdr 接入 PR 同时开放无限递归 spawn；
- 禁止所有 observation 自动写 MemPalace；
- 禁止删除 Playwright MCP；
- 禁止大段复制没有明确分发许可证的 `pi-config` 源码；
- 禁止在没有测试和 storage migration 的情况下重排 `production.ts` 大量职责；
- 禁止自动提交或推送与任务无关的改动。

---

# 25. 给本地 Agent 的执行要求

开始时先输出：

1. 当前实现调用图；
2. 实际文件职责映射；
3. 与本方案不一致的现状；
4. 最小可行拆分；
5. 第一阶段将修改的文件；
6. 风险和回滚点；
7. 测试计划。

然后按 Phase 0 → Phase 1 实施。不要一上来同时实现 Herdr、Browser、Memory 和 Web UI。

每个阶段结束必须报告：

```text
Changed
Tests
Evidence
Known gaps
No-regression statement
Next phase
```

对无法确认的 Pi 内部 API、Herdr protocol、sandbox 进程语义，先读当前源码和官方 schema，不得猜测。

---

# 26. 第三方来源与许可证处理

- `herdrdev/herdr`：Apache-2.0。优先作为外部运行时通过 socket API 集成，不 vendoring Rust 源码。
- `amosblomqvist/pi-interactive-subagents`：MIT。若吸收实现，保留版权与许可声明，更新 `THIRD_PARTY_NOTICES.md`。
- `amosblomqvist/pi-observational-memory`：MIT。同上。
- `amosblomqvist/pi-config`：README 明确鼓励复制个人配置片段，但仓库根目录未发现正式 LICENSE。Browser、Prompt Snippets、ask UI 应优先按公开行为 clean-room 重写；若直接复制，先取得明确许可并记录来源。

---

## 最终目标

完成后，AILI-PI 的定位应是：

```text
AILI 控制平面
+ Managed / Herdr 双执行后端
+ 可持久、可进入、可恢复的外部 Agent Surface
+ 统一安全、调度、交互、结果和记忆
+ TUI/Web 白盒观测
```

而不是：

```text
把当前 subagent 替换成 Amos 版本
```

真正的融合关系是：

```text
AILI Agent/Job/Turn/Policy/Scheduler
        +
Amos 的 Process/Session/Loadout/Interactive UX
        +
Herdr 的 Persistent Terminal Surface
```
