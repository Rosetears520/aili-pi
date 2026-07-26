## Context

AILI 当前在 `extensions/index.ts` 中注册由 `src/runtime/subagents.ts` 包装的 `@agwab/pi-subagent@0.4.8`。该 runtime 以 run/attempt 为身份，普通 child 默认 `--no-session`，运行记录位于 `.pi/agent/runs/`，不能提供稳定 Agent identity、跨 turn 消息、park/revive 或 parent-scoped Pi Session JSONL。现有 19 个专用角色由 `manifests/roles.json`、`src/runtime/roles.ts` 与 `roles/*.md` 生成并验证；它们的职责、工具 ceiling、hash 与 provenance 是必须保留的现有资产。

本设计选择性参考 Oh My Pi `17.1.3`、固定 revision `59619623e1eeb7c290649eeaf3a269284ce8adef`（MIT）的 Agent registry、lifecycle、message、history/output 和 model-override 模式，但继续运行官方 Pi、保留 `pi` CLI 和单一 AILI Extension entry。官方 Pi SDK 已公开 `createAgentSession()`、持久 `SessionManager.create/open()`、`AgentSession.steer()/sendUserMessage()`、`DefaultResourceLoader`、`SettingsManager` 和 Extension session lifecycle；这些是新 runtime 的 host seam。OMP 的 Bun/runtime、CLI、daemon、unattended-yolo 和完整 `@oh-my-pi/*` graph 不进入本 change。

`interview.md` D-001–D-014 已关闭 requirements frontier。关键约束包括：20 个 bundled selectors（19 个 `aili.*` 专用角色加 `general`）、`task + hub` breaking surface、parent-scoped JSONL、async-by-default、32 active turns、无 Agent-turn 时间/request budget、process-bound background、durable result/mailbox、冲突感知隔离、每次永久配置写入的用户确认以及旧数据非破坏性保留。

## Goals / Non-Goals

**Goals:**

- 用 AILI-owned `task` 与 `hub` 替换旧 `subagent` tool/runtime，并以 Agent ID 而非 run ID 管理后续通信和恢复。
- 为每个 child 使用官方 Pi `AgentSession` 与独立持久 `SessionManager` JSONL；恢复 parent 后可重建 registry、revive parked Agent 和读取历史。
- 保留 19 个专用角色的完整 prompt/工具语义，新增 `general`，并在每个 turn 边界 hot reload 有效 profile。
- 支持 top-level async、batch、durable completion delivery、running aside、idle wake、parked revive、bounded mailbox 和明确取消语义。
- 保持 parent-active、role、capability 与 hard guard 的交集；后台 approval 必须回到 parent UI，不能改成 unattended-yolo。
- 支持 role/instance/one-shot 模型覆盖及固定优先级；one-shot 不污染持久配置。
- 在 shared workspace 可安全并行时避免无谓隔离，在声明或检测到资源冲突时使用隔离 workspace 并显式返回 patch/branch。
- 使 OMP-inspired 代码、行为和许可证来源可审计，且让 doctor/release evidence 能区分已验证、降级和未验证 seam。

**Non-Goals:**

- 不引入 `omp` CLI、Bun、完整 OMP runtime、Pi fork、替代 `pi` CLI 或 native Windows/macOS 支持。
- 不保留行为不等价的 `subagent` alias，也不迁移旧 `.pi/agent/runs/` 为可恢复 Agent。
- 不在退出 Pi 后运行 daemon/detached supervisor，不自动重放 interrupted/queued task，不提供 unlimited recursion。
- 不承诺 OS sandbox；隔离 workspace 与 permission/sandbox 是不同边界。
- 不允许单独删除 child transcript/artifacts；历史随 parent 保留并只在确认删除 parent 时级联删除。
- 不在本 DEFINE 中修改依赖、lockfile、用户 `~/.pi/agent`、`aili-workflows`、生产代码、发布状态或真实 provider 数据。

## Decisions

### 1. 一个 parent-scoped coordinator 管理官方 Pi child sessions

每个活动 parent Pi session 对应一个 `AgentCoordinator`。Extension 在 `session_start` 延迟创建 coordinator，在 `session_shutdown` 追加终止状态并释放 live resources；factory 阶段不启动 timer、watcher 或 child。

持久 parent 的 sidecar root 使用与 OMP 相同的 ownership 形状：`<parent-session-file-without-.jsonl>/aili-agents/`。建议布局为：

```text
<parent-session>/aili-agents/
  coordinator.jsonl          # registry/job/message/delivery append-only events
  snapshot.json              # 可重建的原子 compacted snapshot
  agents/
    <agent-id>.jsonl         # official Pi child SessionManager file or registry-recorded exact file
    <agent-id>.md            # full raw final output
  patches/
  workspaces.jsonl
```

`SessionManager.create(cwd, agentsDir, { id, parentSession })` 创建 child JSONL，registry 记录 SDK 返回的 exact path，不从文件名猜测。每个 `AgentSession` 是其 JSONL 的唯一 writer；coordinator 的串行 append queue 是 `coordinator.jsonl` 的唯一 writer。同一 Agent 在任意时刻最多一个 active turn。

Coordinator journal event 至少包含 schema version、event ID、timestamp、parent ID、Agent/job/delivery/message ID 和 payload。`snapshot.json` 只是加速缓存；丢失时从 journal 与 child JSONL 重建。启动时只允许忽略并报告一个因进程崩溃造成的 final partial line；中间损坏、重复 ownership 或非法状态转移必须 fail closed，不能自动“修复”成成功。

**Alternatives rejected:** 将 child 消息嵌入 parent JSONL 会破坏独立 `AgentSession` writer；继续使用 `.pi/agent/runs/` 无法恢复 Pi conversation；process-global-only registry 在重启后丢失身份。

### 2. Registry、job 与 turn 是三个不同身份层

Bundled selector catalog 固定为 `general` 加现有 19 个 `aili.<manifest-name>`；`agent` 选择类型，`name` 只请求可读实例名。未给 `name` 时生成可读名称；重复名依次分配 `name-2`、`name-3`，nested ID 使用 `Parent.Child` 前缀并进行路径安全编码。每次 `task` 都创建新 Agent；继续已有 Agent 只能使用 `hub send` 和 stable Agent ID。

Agent registry 状态为 `queued | running | idle | parked | aborted`。`interrupted` 是 turn outcome，不是 terminal Agent 状态：crash/graceful exit 后未完成 turn 追加 `interrupted`，Agent 恢复为 `parked`。Job ID 只代表一次 async execution，状态为 `queued | running | completed | failed | aborted | unexecuted`；Agent ID 可跨多个 turn/job 存活。

状态转移为：

```text
queued -> running -> idle -> parked -> running
                 \-> aborted (hard cancel/terminal failure)
running --process loss--> interrupted turn + parked Agent
queued  --process loss--> unexecuted job + parked Agent
```

idle TTL 默认为 420000ms；`<=0` 只禁用 timer。park 会 dispose live `AgentSession` 并保留 registry/session path；revive 通过 `SessionManager.open()` 和最新有效 profile/model/tool policy 重建 session。hard-aborted Agent 不可 revive。

### 3. `task` 是创建入口，`hub` 是稳定身份入口

`task` 支持 flat 与 batch。Flat 最小输入为 `task`; batch 为 shared `context` 加 `tasks[]`。每项可带 `agent`、`name`、`model`、`async`、`tools`（只缩窄）、`workspace: auto|shared|isolated`、`writeScope`、`cwd` 和隔离选项。省略 `agent` 时为 `general`；省略 `async` 时为 true。role `blocking`、显式 `async:false` 或 host 没有 async delivery capability 时同步执行。

`hub` 至少提供：

- Agent：`list`、`send`、`wait`、`inbox`、`output`、`history`；
- job：`jobs`、`cancel`；
- model override 查询，以及需要用户确认的 role/instance override request/clear。

Hub target 必须属于当前 parent 或调用 child 的允许 descendants；不得跨 parent 控制 Agent。`hub cancel` 对 running job hard-abort并保留 transcript；对无 job 的 idle/parked identity 执行 release/unregister但不删除文件。

Top-level async job 在最多 32 个 active turn 的 parent semaphore 下运行，超出项 FIFO queue。Nested child 的 `task` 强制同步并共享同一个 ancestor semaphore、depth 与 spawn policy，避免每层创建独立 32-way fan-out。Q-022 的 unlimited runtime/request 只移除 Agent-turn budget，不移除 semaphore、provider watchdog、tool timeout、permission 或 manual cancel。

### 4. Durable delivery 使用 parent message ID 去重

Async completion 先写 full output/child JSONL，再向 coordinator journal 追加 `delivery_pending`。parent active 时通过 `pi.sendMessage()` 注入 `customType: "aili.agent-result"`，`details` 必须带 stable `deliveryId`、Agent ID 和 job ID。

为了避免“消息已写 parent JSONL、ack 尚未写 journal”时重启重复注入，恢复时 coordinator 先扫描 parent session 中已有的 `deliveryId`：存在则补写 `delivery_delivered`；不存在才注入。该顺序提供 parent transcript 级 exactly-once，而不是仅依赖内存 promise。parent 不活动时 pending event 留在 sidecar，下一次相同 parent `session_start` 重放 delivery check。

Parent model 正在运行时，completion 使用 non-interrupting follow-up/next-turn delivery；不得抢占当前 tool step。同步结果直接作为 `task` result 返回，不重复注入。

### 5. Message bus 映射到官方 AgentSession queue

`hub send` 对状态的映射为：

- `running`：调用 `AgentSession.steer()`，在当前 assistant tool step 完成后的安全边界注入 aside；
- `idle`：`sendUserMessage()` 启动新 turn；
- `parked`：先 revive，再 `sendUserMessage()`；
- `aborted`/unknown：明确失败。

成功 live hand-off 不写 mailbox，避免重复投递。仅 `steer/sendUserMessage` 在 live transition race 中抛错时写 parent-scoped durable mailbox。每 Agent cap 100；满时保留旧消息、拒绝新消息并向 sender 返回 `failed/overflow` receipt。永久 revive failure 不伪装为 queued mail。`inbox` 可 peek/drain，`wait` 可同时等待 owned jobs 或 matching message。

### 6. Child context、profile 与 tool surface 每 turn 重算

新 child 不复制 parent conversation。`ChildSessionFactory` 只组装：shared runtime/permission/message envelope、selected full role prompt、explicit task/context、workspace、当前 trusted rules/skills/context files、共享资源引用和 approved-plan ref。

Profile schema 从 v1 升到 v2，新增 `spawns`、`blocking`、可选 frontmatter model、source/profile version 与 runtime adapter version。19 个专用角色保留 Role、Goal、Success criteria、Constraints、Tools、Output、Stop 和 machine-readable output contract；只移除旧 `OpenCode`、single-use/no-resume、`--no-session` 等 adapter 文案。`general` 使用 AILI-owned OMP-inspired full-worker prompt。

每个 turn 前重新验证 role manifest、source/profile hash 和 provenance。hash 有变化时，idle live session 先安全 dispose，再用同一 `SessionManager.open()` 和新 prompt 重建；in-flight turn 不变。实际 prompt/source hash、role version、effective tools 和 model 写入 turn metadata。无效 profile fail closed，不回退到未验证旧 prompt。

Bundled 20 个 selector 是本 change 的 catalog。trusted user/project profile 只能在配置中对具体 bundled selector显式 opt-in shadow；同名文件本身不自动生效，project 未 trust 时忽略并报告。新 selector 不在本 change 中动态加入 catalog。

有效 tool set：

```text
general = parent current active tools ∩ child currently loadable capabilities ∩ hard guards ∩ call narrowing
specialized = parent current active tools ∩ role tools ∩ child capabilities ∩ hard guards ∩ call narrowing
```

Spawn-enabled role按 `spawns` 与 depth 添加 `task`/`hub`; 其他 child 移除 `task`。Child resource loader必须从已 trust 的 parent resource snapshot或等价可验证 loader重建工具，过滤 top-level coordinator并加入 child bridge，不能重新发现未 trust资源。若官方 public SDK不能重建某个 parent active custom tool，runtime必须报告 unavailable 并从交集移除；不得声称继承成功。

### 7. PermissionBridge 在 parent UI 上逐次裁决

Child 不加载会在 headless 中自动 deny 或切换 unattended-yolo 的完整交互 wiring。AILI 复用当前 generated `pi-permission-modes` 的纯 resolver/config/credential guard，创建 child-only policy extension，并通过内存 `ApprovalBridge` 把 `ask` 请求挂起到 parent coordinator。

Approval packet 包含 Agent/job/tool ID、surface、sanitized target、cwd、permission mode 与 reason，不含 credential content。parent `ctx.hasUI` 时显示一次选择；allow/deny 结果回送对应 child promise。parent session 关闭、无 UI、桥接丢失或用户拒绝时 fail closed。Credential/auth/private-key path guard先于 ask，永不提供批准选项。

Sandbox-required child Bash只可通过同一process-owned、已经ready且profile exact-match的`pi-permission-modes` SandboxController执行。Child以same-name custom Bash definition替换official built-in execution backend，但不得扩展effective tool ceiling；child不得initialize、reconfigure、reset或在degraded/disabled/profile-mismatch时降级为unsandboxed。Plan使用read-only operations，Build使用writable operations；不兼容的Git worktree `.git` file继续fail closed。该共享生命周期避免多个child controller竞态修改process-global SandboxManager。

“Allow forever”或 Agent 发起的永久 model/profile/config请求均是配置写入：每次必须有用户交互确认；拒绝、headless 或写锁错误时文件 bytes 不变。Top-level `task` approval不是 child 后续所有工具的 blanket authorization。

### 8. Model resolution 与配置 ownership 分离

每 turn 按以下顺序解析：

```text
one-shot task.model
> instance override in parent registry
> trusted project role override
> user-global role override
> role frontmatter model
> parent active/fallback model
```

One-shot值只进入本 turn metadata和 child model selection，不写 registry/profile/config。Instance override写入 coordinator journal；role overrides写入 AILI-owned、原子锁保护的 global/project config（具体路径由 implementation seam固定，不能把未知 keys写进 official `settings.json`）。Project config只在 `ctx.isProjectTrusted()` 为 true时读取或写入。

用户命令/TUI/manual config是直接用户操作；model-facing `hub` 只能 request并逐次确认。显式 override若 model/provider不存在、无认证或 thinking不兼容，当前 turn在启动前 fail closed并报告来源层级；不得静默落到较低优先级。没有任何 override时 parent fallback可按官方 Pi正常解析。

### 9. Conflict-aware workspace leases 与最小隔离

`workspace:auto` 默认 shared。调用可声明 `writeScope.paths[]` 和 `writeScope.resources[]`；paths规范化为 cwd-bound globs，resources用于 `git-index`、生成目录、端口、数据库等非文件冲突。Coordinator在 job开始前获得 lease：与 active scope不重叠则共享；重叠则创建 isolated workspace。`shared`显式接受共享风险，仍不能绕过检测到的同文件 hard conflict；`isolated`无条件隔离。

对于可观察的 `read/edit/write` 路径，child bridge在执行前检查 lease；第二个冲突 mutation被阻止并返回“以 isolated 重试”。任意 bash/外部进程副作用无法完整静态识别，因此未声明 scope默认 shared且结果明确为 best-effort，不宣传绝对冲突防护。

最小隔离 backend使用临时 Git worktree/branch或等价 OMP-derived audited adapter，包含 dirty baseline投影、patch捕获和确定性清理。结果以 patch/branch artifact返回；合并到 parent workspace继续服从现有用户确认。隔离不可用时失败，不降级为冲突 shared写入。隔离 workspace清理后 transcript可读，但 Agent不得在不存在的 workspace上执行后续 turn。

### 10. Parent ownership、fork 与大输出遵循明确边界

Child sidecar由 parent session拥有。单个 Agent没有 delete-history操作；cancel/release不删文件。经确认删除 parent时级联删除 sidecar。Fork/clone的新 parent从空 registry开始，不复制、共享或控制旧 child；旧 ref出现在复制的父消息中不产生新 ownership。

大输出参考 pinned OMP：full raw final output写 `<agent-id>.md`；returned `SingleResult`仅保留 tail 500000 bytes/5000 lines；parent completion preview默认5000 chars并带 truncation metadata。`agent://`是稳定 latest-output ref，`history://`是由 live/on-disk child JSONL生成的 concise transcript ref；官方 Pi无 custom URI protocol时，`hub output/history`负责解析并可提供offset/limit。Preview cap不删除raw source。

Official Pi 0.81.1的built-in session selector目前只删除单个 `.jsonl`，没有已文档化的 sidecar delete/archive hook。BUILD必须先验证目标host是否提供可用seam；若没有，AILI只能通过自有确认删除命令和可审计orphan reconciliation实现延迟级联，不能声称built-in Ctrl+D即时级联。该差异属于fail-closed compatibility gate，不得靠未记录monkey patch绕过。

### 11. OMP adaptation受最小复制与provenance gate约束

优先重写行为而不是复制源码。若直接adapt OMP symbol，`manifests/subagent-provenance.json`、THIRD_PARTY_NOTICES、SBOM和adapter evidence记录固定revision、license、source path/symbol、local destination、hash与behavior tests。不得导入OMP package graph或未使用模块。

`@agwab/pi-subagent` removal和lockfile变化是单独精确批准。旧 `.pi/agent/runs/`、user sessions和配置永不由迁移脚本删除或改写。

## Risks / Trade-offs

- **[Risk] Official Pi Extension API不暴露parent loaded tool definitions/resource paths。** → BUILD先做resource-cloning seam probe；只使用public SDK与trusted loader snapshot。无法满足active-tool交集时fail closed并返回DEFINE，不用不完整继承冒充成功。
- **[Risk] Official Pi built-in session deletion不处理sidecar。** → 使用parent-owned sibling目录、自有确认删除与orphan reconciliation；目标host若无可靠hook，doctor必须报告built-in deletion gap，release不能宣称即时cascade parity。
- **[Risk] 32个无turn budget的Agent可长期占用provider、本机和费用。** → semaphore固定32、FIFO queue、可见jobs/progress、manual cancel、provider/tool watchdog与退出中断；文档明确不限时不等于daemon。
- **[Risk] ApprovalBridge可能与parent shutdown形成悬挂promise。** → 每个approval绑定job AbortSignal与parent lifecycle；shutdown统一deny并记录原因。
- **[Risk] Crash发生在parent message append与delivery ack之间。** → deliveryId写入parent custom message，恢复扫描去重，而非只看journal ack。
- **[Risk] JSONL final write被截断或中间损坏。** → 单writer、append queue、event ID、snapshot replay；只容忍并报告final partial line，中间corruption fail closed。
- **[Risk] Shared workspace存在未声明bash副作用。** → `writeScope`/resource lease、已知file-tool runtime check、conflict-visible结果；文档明确best-effort，关键任务可显式isolated。
- **[Risk] Isolated dirty-baseline与merge产生冲突。** → capture baseline、返回patch/branch、不自动merge、清理失败留可诊断artifact。
- **[Risk] Persistentrawhistory占用磁盘。** → bounded inline preview、parent级显式删除、doctor统计；不通过静默TTL牺牲审计。
- **[Risk] Profile hot reload改变旧Agent行为。** → turn boundary重建、每turn记录hash、invalidprofile failclosed，不修改in-flightturn。
- **[Risk] OMP-derived code产生许可证或供应链遗漏。** → pinnedrevision、symbol-levelprovenance、NOTICE/SBOM和focusedtests是采用前置条件。

## Migration Plan

1. 在不改依赖的prototype lane验证四个host seam：persistent child `SessionManager.open()`、trusted resource/tool cloning、parent UI approval bridge、parent sidecar delete/fork lifecycle。任一关键seam失败都回到DEFINE。
2. 新增v2 role/profile schema、`general` profile、prompt adapter与hash/provenance生成；保留v1 runtime直到v2 validation通过。
3. 实现coordinator journal、registry/lifecycle、child session factory和fake-model/disposable-session fixtures；先证明single-writer、rehydration、interrupted/non-replay。
4. 实现`task`/`hub`、message/mailbox、asyncledger、32-way semaphore、nested sync和output/history resolver。
5. 实现PermissionBridge、modelconfig、writeScope/lease与isolatedworkspace；完成负向权限、冲突和crash tests。
6. 在获得独立dependency/lockfile批准后移除`@agwab/pi-subagent`和旧wrapper，更新doctor/capabilities/docs/provenance/SBOM与受影响OpenSpecchanges。
7. 完成focused/full/package/strictOpenSpec验证；真实provider、sandbox、globalHOME或外部workspaceprobe分别取得精确批准。

Rollback以恢复上一已发布AILIPackage版本为主；旧run数据保持可读。若新runtime已创建sidecar，rollback不得删除它们；旧版本忽略未知sidecar。因为publictool是breakingreplacement，不在同一版本内双注册`subagent`alias作为fallback。

## Open Questions

- **Host seam gate:** 目标officialPi版本能否用public`DefaultResourceLoader`/SDK完整重建parentactivecustomtools而不重复加载top-levelcoordinator？BUILDprototype必须回答。
- **Deletion/archive gate:** officialPi目标版本是否新增sidecar-awaredelete/archivehook？若没有，finalcontract必须把built-inCtrl+D即时cascade标记为hostgap，并只验收AILI-owneddelete/reconciliation路径。
- **Permission seam gate:** child-onlypolicyextension与parentUIproxy能否覆盖file/bash/network/customtoolask且不与ambientpermissionextension双重裁决？
- **Isolation seam gate:** 最小Gitworktreeadapter对dirtybaseline、nestedworktree和非Gitcwd的明确失败语义需要prototypeevidence。
- **Version alignment:** `support-pi-0-82-0`仍是未完成change；implementation必须选一个精确officialPihostbaseline并同步revision-boundtests，不能混用0.81.1与OMPforkAPI事实。
