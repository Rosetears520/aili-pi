# Requirements Interview

## Metadata

- Change: `replace-subagent-runtime-with-persistent-agent-framework`
- Mode: Frontier Mode（用户要求从 Q-005 起批量提问）
- State: `BLOCKED_FOR_CLARIFICATION`
- Updated: 2026-07-25

## Sources Reviewed

| Source | Evidence used |
|---|---|
| `proposal.md` | 新 runtime 使用 OMP-style Agent type / stable instance、持久会话、`task`/`hub` 和不扩大权限的方向。 |
| `manifests/roles.json` | 当前 source-of-truth 恰有 19 个角色；每个角色已有 tools/capabilities/status/provenance。 |
| `src/runtime/roles.ts` | loader 从每个 profile 单独提取 prompt body，并校验 exactly 19 profiles；当前还检查 single-use/no-recursion adapter guard。 |
| `roles/code-scout.md`, `roles/implementer.md`, `manifests/roles.json` | 角色具有不同 prompt、tools 和职责；现有 prompt 尾部仍包含 `--no-session`、single-use、no-resume/no-recursion 旧 runtime adapter 条款。 |
| OMP pinned source: `src/task/agents.ts`, `src/prompts/agents/task.md`, `src/task/executor.ts`, `src/tools/index.ts`, `src/sdk.ts`, `docs/tools/task.md` | generic `task` 不声明 tools；child 从 settings/forwarded capability sources 建立完整工具面，专用角色才使用显式 tools ceiling。 |
| 用户当前决定 | 保留 19 个已设置角色并增加 `general`；Q-001=A、Q-003=A、Q-004=B、Q-005=C、Q-006=A、Q-007=C、Q-008=C；永久配置可由用户直接改，Agent 发起时逐次确认；Q-010–Q-016 要求直接参考 pinned OMP；后续使用批量提问。 |

## Confirmed Decisions

### D-001 — Agent 类型集合

- **Decision:** 新 runtime SHALL 保留 `manifests/roles.json` 当前 19 个 AILI role profiles，并新增 1 个通用 Agent 类型，总计 20 个 Agent 类型。
- **Domain distinction:** `agent` 是角色/类型；`name` 是该类型创建的稳定、可持久化 Agent 实例 ID。同一类型可以产生多个不同 `name` 的实例。
- **Preserved owner:** 19 个既有角色的 prompt、tools、capabilities、optional/adapted status、hash 和 provenance 继续由当前 manifest/generator 链拥有，不因 runtime replacement 被合并成一个 generic prompt。
- **Delta classification:** `material-delta`；已写回 `proposal.md` 的角色集合与 impact。
- **Still unresolved:** none at requirements frontier；design/spec 可继续细化不改变用户可见契约的实现细节。

### D-002 — 通用 Agent 继承父级工具面

- **Decision:** 采用 Q-001 的 **A — Parent inheritance**。通用 Agent 不设置独立静态 role allowlist；有效工具集合为 `parent current active tool ceiling ∩ currently available capabilities ∩ hard guards`，调用方只能继续缩窄。父级以后新增并启用的工具自动对通用 Agent 可用。
- **Specialist contrast:** 19 个既有角色仍额外执行各自 manifest role ceiling；本决定只适用于新增的通用 Agent。
- **Non-bypass:** `pi-permission-modes`、credential/auth/private-key hard denial、project trust、外部写入确认、隔离和递归深度限制仍独立生效；A 不等于 unattended YOLO，也不允许超过父级 authority。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-003 — 通用 Agent selector 为 `general`

- **Decision:** 新通用 Agent 的唯一 canonical selector 为 `general`；省略 `agent` 时默认选择 `general`。
- **No alias:** 不注册 `aili.general` 或 OMP-style `task` role alias；`task` 仅保留为 orchestration tool 名。
- **Scope clarification:** 本决定只命名新增通用 Agent，不重命名现有 19 个角色。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-004 — 保留专用角色语义，仅迁移 runtime adapter

- **Decision:** 采用 Q-003 的 **A — Preserve role semantics, migrate adapter**。每个专用角色继续使用自己的完整 role prompt；应保留 Role、Goal、Success criteria、Constraints、Tools、Output 和 Stop 语义。
- **Adapter-only migration:** 只迁移 `OpenCode`/旧 Pi child identity、single-use/no-resume/`--no-session` 等与新 persistent lifecycle 直接冲突的 adapter 文案。no-recursion 条款是否保留或收窄，跟随后续 role `spawns` allowlist 决定；未获 spawn 权限的角色继续禁止派生 child。
- **Prompt composition:** 最终 child system context 为共享 runtime/permission/message envelope + selected role prompt + task/context；`general` prompt 只用于 `general`。
- **Output/provenance:** 当前 Pi adapter 的 machine-readable output contract 继续由 manifest/generator 拥有；迁移后的 source/profile hash 必须显式更新和验证，不把用户示例误当作未审计的 byte-for-byte replacement。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-005 — profile 更新后自动 hot reload

- **Decision:** 采用 Q-004 的 **B — Hot reload**。持久 Agent 在 role profile 从 v1 更新到 v2 后，其下一个 turn 或 revive 自动采用最新有效 prompt/hash；新旧实例统一使用当前版本。
- **Turn boundary:** 不修改已经在执行中的 turn；每个 turn 开始前解析最新 profile，并把实际使用的 source/profile hash 写入 durable metadata，避免历史不可审计。
- **Non-bypass:** hot reload 失败、profile 无效或 hash/provenance 校验失败时 fail closed，不静默回退到未验证旧 prompt；permission、credential 和 tool guards 仍按当前 runtime 计算。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-006 — profile shadow 必须显式 opt-in；`general` 使用 AILI-owned OMP-inspired prompt

- **Decision:** Q-005 选择 C；内置 20 个名称默认保留，trusted project/user 只有在按具体名称显式 opt-in 后才能 shadow，并记录 provenance。Q-006 选择 A；`general` 使用 AILI-owned、OMP-inspired full-worker prompt，不复制上游原文。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-007 — role + instance 模型覆盖与受确认的永久写入

- **Decision:** Q-007/Q-008 选择 C/C。优先级为 `单次 model > instance override > trusted project role override > user-global role override > frontmatter > parent`；instance override 随 child registry/session，role override 同时支持 project/user scope。
- **Write authority:** Q-009 采用用户自定义答案：用户显式 command/TUI/manual config 可直接修改；Agent/model 发起的永久修改必须逐次获得用户交互确认。无 UI、拒绝或确认失败时配置 bytes 不变。单次 `task.model` 永不落盘。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-008 — OMP-style spawn、depth、message 与 idle lifecycle

- **Decision:** 按用户要求直接参考 pinned OMP：Q-010=C（每个 role 显式 `spawns`，`general` 可派生任意非自身角色）；Q-011=B（默认 depth 2）。AILI 保留 proposal 的 no-unlimited 边界并设 hard cap 4。
- **Message semantics:** Q-012 采用 OMP exact behavior 而非原 A/B/C：running recipient 在下一个安全 step boundary 收到 non-interrupting aside；idle 被 wake；parked 先 revive；失败 live hand-off 才进入有界 mailbox；不创建并发 turn。
- **Idle TTL:** Q-013=A，默认 420000ms，可配置，`<=0` 禁用 timer。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-009 — OMP-style refs、parent artifact ownership 与 fork isolation

- **Addressing:** Q-014 采用 C：公开 `agent://<id>` / `history://<id>` URI-like refs，同时提供 `hub output/history` 读取。因官方 Pi Extension 无 documented custom URI protocol API，只移植用户可见语义，不宣称 native protocol。
- **Retention:** Q-015=A：archive 连同 child artifacts 保留/移动并跳过 active nested sessions；经确认的 parent delete 级联删除 child data。
- **Fork:** Q-016 采用 OMP exact boundary：fork 不共享、复制或迁移 child artifacts/live registry；新 fork registry 为空，旧 child 继续归原 parent；父 entry 中的旧 ref 不授予新 fork 控制权或副本。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-010 — OMP-style child context、name allocation 与 hard cancel

- **Context:** Q-017=A。新 child 不复制 parent conversation；只接收显式 task/context、workspace、当前 rules/skills/context files、共享资源和 approved-plan ref。
- **Identity:** Q-018=A。每次 `task` 都创建新 Agent；重复请求名自动分配去重 ID（如 `name-2`）。继续已有 Agent 只能按稳定 ID 使用 `hub send`，不得因同名静默恢复。
- **Cancellation:** Q-020=A。running job cancel 后 Agent hard-abort 并不可 revive；idle/parked 且无 job 的显式 cancel 执行 release/unregister。Transcript 保留/删除仍服从 parent artifact ownership。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-011 — async-by-default、显式 mailbox overflow 与无 Agent-turn 上限

- **Async:** Q-019=A，并由用户补充 model-facing caller 可选择 background/sync。默认 async；非 blocking task 立即返回 Agent/job ID，parent 与一个或多个 child 并行工作，结果完成后自动回送。role `blocking`、显式 sync 或 async capability 不可用时改为同步；选择后台不扩权。
- **Mailbox overflow:** Q-021=B。每 Agent mailbox 上限 100；满时保留已有消息、拒绝最新消息，并向 sender 返回显式 failed/overflow receipt，不采用 OMP 静默丢最旧消息。
- **Runtime/budget:** Q-022=Custom unlimited。`maxRuntimeMs=0` 且 `softRequestBudget=0`，不设置 Agent-turn wall-clock 或 assistant-request 上限，以支持长时间任务；manual `hub cancel`、provider/inference watchdog、tool-specific timeout、permission guard 和 bounded concurrency 仍生效。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-012 — 32-way bounded queue 与 durable crash/message/result recovery

- **Concurrency:** Q-023=A。每个 parent session 默认最多同时运行 32 个 Agent turn；超出部分进入 FIFO queue。长任务仍不受 Q-022 的时间/request 上限，但 active turns 始终受 semaphore 约束。
- **Crash recovery:** Q-024=B。进程异常结束时未完成 turn 记录为 `interrupted`；Agent registry 恢复为 parked/revivable，不自动重放可能已有副作用的原 task。下一次 `hub send` 在同一 transcript 上启动新 turn并显式提供中断上下文。
- **Async delivery:** Q-025=A。完成结果写入 parent-scoped durable pending-delivery ledger；parent 恢复后按 delivery ID exactly-once 注入，同时始终可由 `hub jobs/output` 查询。
- **Mailbox:** Q-026=A。failed live hand-off 使用 parent-scoped durable mailbox，跨进程恢复，并继续执行 cap 100 与显式 overflow receipt。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-013 — process-bound background、interactive approval、conflict-aware isolation 与 nested sync

- **Process lifetime:** Q-027=A。不引入 daemon/detached supervisor。graceful exit 对 running turn 使用与 Q-024 相同的 durable `interrupted` outcome；queued job 标记未执行，二者均不自动重放。
- **Async approval:** Q-028=A。需要用户批准的 background tool call 只暂停对应 job并路由请求到 parent UI；批准后恢复，拒绝后该工具调用失败；headless、无 UI 或 approval bridge 恢复失败时 fail closed。
- **Workspace:** Q-029=Custom conflict-aware B。并行写不同且互不影响的文件时默认共享 workspace；只有已知/声明的 write scopes 重叠，或 git index、生成目录、服务端口、数据库等共享资源可能相互影响时才 auto-isolate。不得仅因“两个 Agent 都可写”就强制隔离；冲突检测机制仍需 Q-031 固定。
- **Nested execution:** Q-030=A。top-level parent 可 async；child 派生 grandchild 时强制 sync，且所有层级仍共享 depth、spawn allowlist 与 parent concurrency ceiling，防止递归后台爆炸。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

### D-014 — explicit conflict scopes、parent-owned retention 与 OMP-style large output split

- **Conflict declaration:** Q-031=A。`task` 支持可选 `writeScope`（paths + shared resources）及 `workspace: auto|shared|isolated`。`auto` 只在已声明/可确定 scope 重叠时隔离；未声明默认 shared。若 runtime 在执行中检测到第二个冲突写，阻止该操作并返回 isolated retry，不迁移已部分执行的 Agent；不宣称可完整静态识别任意 bash/外部副作用。
- **Retention:** Q-032=B。单个 Agent 不提供删除 transcript/artifacts 的公共操作；`hub cancel/release` 只终止或注销 live identity，不删除历史。所有 child data 随 parent 保留，只有经确认删除 parent 时级联删除。
- **Large output/history:** Q-033 按用户要求参考 pinned OMP：完整 raw final output 写入 durable `<agent-id>.md`，完整 child Session JSONL 持久化；返回给 parent 的 `SingleResult` tail 默认最多 500000 bytes/5000 lines，普通完成摘要 preview 默认 5000 chars，并明确标记 truncation；`agent://`/`hub output` 读取完整 raw artifact，`history://`/`hub history` 从 live/on-disk JSONL 生成 concise transcript。Pi-compatible hub reader 可提供 offset/limit，storage 不因 preview cap 自动删除。
- **Delta classification:** `material-delta`；已写回 `proposal.md`。

## Resolved Questions

### Q-001 — 通用 Agent 的权限/工具上限

- **Decision target:** `design.md`、`persistent-agent-orchestration` spec、通用 profile、权限与负向测试。
- **Why material:** 19 个既有角色都有显式 role ceiling；通用 Agent 没有既有 owner。只写“通用”会产生只读、动态继承或固定广权限三种不兼容实现。
- **Answer:** **A — Parent inheritance**。
- **Status:** Resolved as D-002.

## OMP Prior-Art Note

- **Reference:** Oh My Pi `17.1.3`, fixed local revision `59619623e1eeb7c290649eeaf3a269284ce8adef` (MIT).
- OMP 的 bundled generic Agent 名为 `task`，声明 `spawns: "*"`、`model: "@task"`，但不声明 `tools`；其 prompt 明确称为 full-capability worker。
- `runSubprocess` 只在 profile 显式声明 `agent.tools` 时设置 `toolNames`。generic `task` 因此让 `toolNames` 保持 `undefined`。
- `createAgentSession` 在 `toolNames === undefined` 时从 child settings 构建所有当前允许的 built-ins，并重新绑定父级传入的 extension/custom-tool paths 与 MCP proxy；这不是固定白名单。
- 专用 Agent 若声明 `tools`，OMP 使用该显式列表，并按 spawn/depth/lifecycle 规则补充或移除 `task`、`hub`、`yield` 等框架工具；Plan Mode 另行强制只读 restricted list。
- **Important difference:** OMP generic 更接近 A，但并非严格的 `parent active tools` 交集；它根据继承 settings 和转发的 capability sources 重建 child 的完整工具面。OMP 还把 parent `task` approval 作为 headless child 的授权边界并把 child approval mode 设为 `yolo`。AILI 的 D-002 更严格：保留父级 active ceiling 和 `pi-permission-modes`，不移植 OMP 的 unattended-yolo 授权语义。
- **Evidence anchors:** `.worktrees/oh-my-pi-reference/packages/coding-agent/src/task/agents.ts`, `src/prompts/agents/task.md`, `src/task/executor.ts`, `src/tools/index.ts`, `src/sdk.ts`, `docs/tools/task.md`.

### Q-002 — 通用 Agent 的 public selector 与默认值

- **Decision target:** `task` schema、profile discovery、文档、兼容与 contract tests。
- **Why material:** tool 本身已经名为 `task`，canonical selector 决定模型调用格式并影响跨-package profile collision。
- **Answer:** canonical selector 为 `general`；省略 `agent` 时默认 `general`；不增加 `aili.general`/`task` alias。
- **Status:** Resolved as D-003.

### Q-003 — 既有角色 prompt 的迁移边界

- **Decision target:** role generator/adapter、19 个 profile、persistent resume contract、provenance 和 regression tests。
- **Why material:** 当前 19 个 prompt 的角色职责各不相同，但都含有与 persistent/park/revive contract 冲突的旧 adapter 文案。
- **Answer:** **A — Preserve role semantics, migrate adapter**。保留 Role、Goal、Success criteria、Constraints、Tools、Output 和 Stop 语义；仅迁移 runtime-specific identity/lifecycle 条款。
- **Status:** Resolved as D-004.

### Q-004 — 持久 Agent 遇到角色 prompt 更新时使用哪个版本

- **Decision target:** child turn initialization、registry metadata、park/revive rehydration、profile hash drift 和 migration tests。
- **Why material:** Agent 可以跨进程 park/revive；profile 在 parked 期间升级时必须确定恢复版本。
- **Answer:** **B — Hot reload**。下一个 turn/revive 自动使用最新有效 prompt；不修改 in-flight turn；记录每个 turn 实际使用的 hash。
- **Status:** Resolved as D-005.

## Resolved Frontier Batch — Q-005–Q-016

用户已要求从本轮起批量提问。以下只包含当前 design/spec frontier 上会改变公共契约、安全边界、持久状态或验收测试的 material decisions。

| ID | 决策 | 推荐默认 | 选项与后果 | 写回目标 | 你的答案 |
|---|---|---|---|---|---|
| Q-005 | project/user 自定义 profile 与内置 20 个类型同名时，谁覆盖谁？ | **C** | **A** OMP exact：project > user > bundled，自动 shadow；**B** 内置名称永久保留，自定义只能用新名称；**C** 默认保留内置，但 trusted project/user 可按具体名称显式 opt-in shadow，并记录 provenance；**D** 自定义。 | design、profile discovery spec、trust/collision tests | **C** |
| Q-006 | `general` 自己使用什么 prompt？ | **A** | **A** AILI-owned OMP-inspired full worker prompt：聚焦任务、按需使用工具、受 policy 控制地派生专用角色、简洁返回；**B** 不设 role prompt，只用共享 runtime envelope；**C** 复制父 Agent 完整 system prompt；**D** 自定义。A 不复制 OMP 源文。 | general profile、prompt provenance、tests | **A** |
| Q-007 | “永久 Agent 模型覆盖”按什么粒度保存？ | **C** | **A** 仅按 role type（OMP 做法，如所有 `implementer`）；**B** 仅按 stable instance `name`；**C** 两者都支持，优先级 `单次 model > instance override > role override > frontmatter > parent`；**D** 自定义。 | `subagent-model-selection` spec、registry/config schema | **C** |
| Q-008 | role-level 永久模型配置的作用域是什么？ | **C** | **A** 仅 user-global；**B** 仅 project-local；**C** 两者都支持，trusted project > user-global；instance override 仍随 child registry/session 保存；**D** 自定义。Official Pi SettingsManager 已有 global+project merge。 | config owner、precedence tests、docs | **C** |
| Q-009 | 谁可以写入永久模型配置？ | **A** | **A** 只有用户显式 command/TUI/manual config；model-facing `task`/`hub` 不能写永久配置；**B** `hub` 可请求写入，但每次必须交互确认；**C** Agent 可直接持久化；**D** 自定义。单次 `task.model` 在所有选项下都不落盘。 | permission contract、negative tests | **Custom：用户可直接改；Agent 发起须逐次经用户同意** |
| Q-010 | 哪些角色可继续派生 child Agent？ | **C** | **A** 全部禁止嵌套；**B** 只有 `general` 可派生；**C** 每个角色显式 `spawns` allowlist，`general` 可选择任意非自身角色，未声明者禁止；**D** 自定义。 | role manifest、prompt adapter、spawn-policy tests | **C（OMP-style）** |
| Q-011 | 默认最大递归深度是多少？ | **B** | **A** 1：只有 parent→child；**B** OMP-style 2：child 可派生最后一层 grandchild，默认 2、可配置、硬上限 4；**C** 0：完全禁用；**D** 指定其他默认/硬上限。所有选项都禁止无限递归和 self-recursion。 | settings、depth enforcement tests | **B（OMP default；AILI 禁止 unlimited）** |
| Q-012 | Agent 正在运行时收到 `hub send` 怎么办？ | **A** | **A** 消息 FIFO 入 mailbox，当前 turn 完成后串行处理；同 ID 新 `task` turn 仍拒绝，绝不并发写 JSONL；**B** running 状态一律拒绝消息；**C** 新消息中断当前 turn 并优先执行；**D** 自定义。 | mailbox/concurrency spec、race tests | **D：OMP non-interrupting aside / wake / revive semantics** |
| Q-013 | idle Agent 默认多久自动 park？ | **A** | **A** OMP 默认 7 分钟（420000ms），可配置，`<=0` 禁用 timer；**B** 默认 30 分钟；**C** 不设 timer，只在 process teardown 时 park；**D** 自定义。park 只释放 live session，保留持久 transcript/registry。 | lifecycle settings、timer/rehydration tests | **A（OMP）** |
| Q-014 | full output 与 transcript 的模型可读入口用什么形式？ | **C** | **A** 只返回 OMP-style `agent://<id>` / `history://<id>` 字符串；**B** 只提供 `hub output/history` ops；**C** 两者同时：结果显示稳定 URI-like ref，`hub` ops 负责解析读取。Official Pi Extension 没有已文档化的 custom URI protocol 注册 API，因此不宣称 OS/native protocol；**D** 自定义。 | task/hub schema、address resolver tests | **C（OMP UX，Pi-compatible resolver）** |
| Q-015 | parent session 被归档或显式删除时，child 数据怎么办？ | **A** | **A** archive 保留全部；显式 delete 经确认后 cascade 删除其 registry/transcript/artifacts，不留静默 orphan；**B** parent 删除后 child 作为只读 orphan 永久保留；**C** 有 child 时禁止删除 parent，必须逐个处理；**D** 自定义。 | ownership/retention spec、deletion tests | **A（OMP）** |
| Q-016 | parent session 被 fork 时，原 child Agents 怎么处理？ | **A** | **A** fork 获得空 live registry，但可只读访问 fork 点以前的 child transcript refs；不能控制原 parent 的 live Agents；**B** fork 与原 parent 共享同一批 live Agents；**C** fork 时克隆全部 child sessions/registry；**D** 自定义。A 避免跨 parent 双写。 | parent-scope/fork spec、single-writer tests | **D：OMP exact，不复制/共享 child artifacts 或 registry** |

### Evidence behind defaults

- OMP pinned source uses project > user > bundled profile discovery, generic `task` without tool allowlist, role-name model overrides, explicit `spawns`, recursion default 2, idle TTL 420000ms, mailbox/registry lifecycle, and `agent://`/`history://` refs.
- Local `manifests/roles.json` and `src/runtime/roles.ts` require exact role hashes/provenance and current role ceilings, so silent same-name shadowing would weaken an accepted contract.
- Official Pi docs expose custom tools, `getActiveTools()`, persistent `SessionManager`, global+project `SettingsManager`, and extension entries; no custom URI protocol registration API was found in the applicable extension surface.
- Proposal already requires parent-scoped sessions, no concurrent same-ID writers, no config pollution from one-shot model overrides, hard credential guards, and no unlimited/self recursion.

### Answer absorption

- Q-005=C, Q-006=A, Q-007=C, Q-008=C.
- Q-009=Custom：用户显式操作可直接改；Agent/model 发起的永久配置变更逐次要求用户同意。
- Q-010–Q-016：用户要求直接参考 pinned OMP；已按 D-008/D-009 吸收，并对 official Pi URI 限制、no-unlimited 约束和 fork 实际行为做了显式适配记录。

## Resolved Frontier Batch — Q-017–Q-022

| ID | 决策 | 推荐默认 | 选项与后果 | 写回目标 | 你的答案 |
|---|---|---|---|---|---|
| Q-017 | 新 child 初次创建时继承多少 parent conversation？ | **A** | **A** OMP exact：不继承 parent 对话，只接收显式 task/context、workspace tree、rules/skills/context files 和 approved-plan ref；**B** 复制完整 parent branch；**C** 自动生成 parent summary 后注入；**D** 自定义。 | prompt assembly、privacy/token tests | **A** |
| Q-018 | 重复使用同一个 `task.name` 是新建还是恢复？ | **A** | **A** OMP exact：每次 `task` 都新建，重复名称自动变成 `name-2`/`name-3`；后续沟通只能 `hub send` 原 Agent ID；**B** 同名自动恢复原 Agent；**C** 增加显式 `resume` 参数；**D** 自定义。 | task schema、identity/collision tests | **A** |
| Q-019 | `task` 默认同步还是后台？ | **A** | **A** OMP-style：async 默认开启，role `blocking` 或显式调用选项可强制同步；**B** 默认同步，显式 async 才后台；**C** 全部后台且角色不能覆盖；**D** 自定义。 | async/job contract、delivery tests | **A；model-facing caller 可选择后台/同步并与 child 并行** |
| Q-020 | `hub cancel` 对 Agent 的含义是什么？ | **A** | **A** OMP exact：running job 被 abort 后 Agent 进入 terminal `aborted`、不可 revive、transcript 仍可读；对已 idle/parked 且无 job 的注册执行 cancel 则 release/unregister；**B** 只取消当前 turn，Agent 回到 idle 可继续；**C** 先 soft-cancel，超时后 hard-abort；**D** 自定义。 | cancellation/lifecycle tests | **A** |
| Q-021 | mailbox 达到上限时如何处理？ | **B** | **A** OMP exact：每 Agent 100 条，超限丢最旧一条，只写 debug log；**B** 100 条，拒绝最新消息并向 sender 返回显式 failed/overflow receipt，不静默丢失；**C** 丢最旧但向双方写 durable overflow event；**D** 自定义。proposal 已禁止静默 evidence loss。 | mailbox cap、overflow negative tests | **B** |
| Q-022 | 单个 Agent turn 的默认运行上限是什么？ | **B** | **A** OMP exact：`maxRuntimeMs=0` 无 hard wall-clock，soft request budget 200；**B** hard 30 分钟 + soft request budget 200，均可配置；**C** hard 15 分钟 + budget 100；**D** 自定义。此前旧 runtime 已出现真实超时/hang，因此推荐 B。 | settings、timeout/budget tests | **D：wall-clock 与 soft request budget 都不限制（均为 0）** |

### Answer absorption

- Q-017=A、Q-018=A、Q-019=A、Q-020=A、Q-021=B。
- Q-022=Custom unlimited：Agent turn 不设 wall-clock 或 assistant-request 上限；其他 runtime/tool/provider guards 保留。

## Resolved Frontier Batch — Q-023–Q-026

| ID | 决策 | 推荐默认 | 选项与后果 | 写回目标 | 你的答案 |
|---|---|---|---|---|---|
| Q-023 | 最多同时运行多少个 Agent turn？ | **B** | **A** OMP 默认 32；**B** 默认 8，超出的任务进入 FIFO queue；**C** 沿用旧 runtime 默认 4；**D** 自定义。该上限独立于 Q-022：长任务可以不限时，但 active concurrency 仍需有界，避免模型费用、provider rate limit 和本机资源失控。 | semaphore/settings、queue/fairness tests | **A** |
| Q-024 | 进程崩溃/被杀时处于 `running` 的 Agent，重启后怎么办？ | **B** | **A** 标记 terminal `aborted`，只能查看 transcript，必须新建 Agent；**B** 将未完成 turn 记录为 `interrupted`，Agent 以 parked 状态可 revive，但绝不自动重放；下一次 `hub send` 在同一 transcript 上开新 turn并显式告知中断；**C** 自动重放原 task；**D** 自定义。 | crash recovery、duplicate-side-effect tests | **B** |
| Q-025 | async job 完成时 parent session 暂时关闭或重启，结果怎么办？ | **A** | **A** 写入 parent-scoped durable pending-delivery queue，parent 恢复后 exactly-once 注入，并始终可由 `hub jobs/output` 查询；**B** 不自动补送，只保留 child transcript；**C** pending result 保存固定 TTL 后删除；**D** 自定义。 | async delivery ledger、rehydration tests | **A** |
| Q-026 | failed live hand-off 进入的 mailbox 是否跨进程持久化？ | **A** | **A** parent-scoped durable mailbox，重启后仍可投递，继续使用 Q-021 的 cap 100/显式 overflow；**B** OMP exact：仅进程内存，重启时丢失；**C** 不设 mailbox，delivery 失败即永久失败；**D** 自定义。 | message storage、restart/overflow tests | **A** |

### Answer absorption

- Q-023=A、Q-024=B、Q-025=A、Q-026=A。

## Resolved Frontier Batch — Q-027–Q-030

| ID | 决策 | 推荐默认 | 选项与后果 | 写回目标 | 你的答案 |
|---|---|---|---|---|---|
| Q-027 | 用户退出 parent Pi 进程后，仍在 running/queued 的后台 Agent 是否继续运行？ | **A** | **A** OMP/process-bound：不引入 daemon；graceful exit 将 running turn 记录为 interrupted、queued job 记录为未执行，重启后均不自动重放，可按原 Agent transcript 继续；**B** 引入 detached supervisor，退出 CLI 后继续；**C** 每次 task 可显式选择 detached；**D** 自定义。B/C 会扩大本 change 到 daemon、凭据与跨进程进程管理。 | shutdown protocol、restart/non-replay tests | **A** |
| Q-028 | async Agent 遇到需要用户批准的工具调用时怎么办？ | **A** | **A** 暂停该 job并把 approval request 路由到 parent UI；用户批准后恢复，拒绝则工具失败；headless/无 UI fail closed；**B** async 下遇到 approval 立即失败，要求改成 sync 重跑；**C** background Agent 禁止所有可能触发 approval 的工具；**D** 自定义。任何选项都不采用 OMP unattended-yolo。 | permission bridge、approval/restart tests | **A** |
| Q-029 | parent 与多个 write-capable Agents 并行操作同一 workspace 时，默认如何避免写冲突？ | **B** | **A** OMP shared-cwd 默认：允许并行直接写，冲突由模型自行处理；**B** auto-isolate：检测到并行 write-capable turn 时默认使用隔离 workspace，结果以 patch/branch 返回，合并仍需现有确认；单个明确共享任务可显式 opt out；**C** 所有 async task 强制隔离；**D** 自定义。 | workspace/isolation policy、conflict tests | **Custom B：不同且互不影响的文件共享；仅冲突/相互影响时隔离** |
| Q-030 | child Agent 派生 grandchild 时是否也能后台 fan-out？ | **A** | **A** OMP exact：top-level 可 async；child 内部强制 sync，其 grandchild 必须完成后 child 才继续，避免递归 background explosion；**B** 每一层均可 async，但共同受 depth 与全局 32 concurrency 限制；**C** 仅 `general` child 可 nested async；**D** 自定义。 | nested execution、depth/concurrency tests | **A** |

### Answer absorption

- Q-027=A、Q-028=A、Q-030=A。
- Q-029=Custom conflict-aware B：不同且互不影响的文件默认共享 workspace；只有 write/resource conflict 时隔离。

## Final Frontier Batch — Q-031–Q-033

| ID | 决策 | 推荐默认 | 选项与后果 | 写回目标 | 你的答案 |
|---|---|---|---|---|---|
| Q-031 | runtime 如何知道两个并行任务会写冲突？ | **A** | **A** `task` 支持可选 `writeScope`（paths + shared resources）和 `workspace: auto|shared|isolated`；`auto` 在已声明/可确定 scope 重叠时隔离，未声明时按用户要求默认 shared；若运行中检测到第二个冲突写，阻止该次写并返回“以 isolated 重试”，不把已执行一半的 Agent 偷迁移；**B** 只靠模型阅读 task 文本推断；**C** 不自动检测，完全由调用者手动选择 isolated；**D** 自定义。bash/外部进程的任意副作用无法被完整静态识别，因此 A 是显式、可测试而非虚假保证。 | task schema、resource lease/conflict tests | **A** |
| Q-032 | 单个持久 Agent 的 transcript/artifacts 何时删除？ | **A** | **A** 默认随 parent 保留且不设 TTL；用户可通过显式、需确认的 delete 操作删除一个 Agent及其 descendants，Agent/model 发起时也必须逐次获批；**B** 只能删除整个 parent，不能单独删 Agent；**C** idle 后按 TTL 自动删；**D** 自定义。 | retention/delete contract、cascade tests | **B** |
| Q-033 | 长任务产生很大的 output/history 时如何兼顾完整性与 context？ | **A** | **A** durable transcript/raw output 不自动截断；tool result 只返回有界 preview，`hub output/history` 支持分页/范围读取；磁盘回收依赖 Q-032 显式删除；**B** 超过固定磁盘上限后截断最旧内容；**C** 只保留摘要，不保留完整 raw history；**D** 自定义。 | output storage、pagination/large-history tests | **D：参考 pinned OMP 的 raw artifact + capped result/preview + concise history 分层** |

### Answer absorption

- Q-031=A、Q-032=B。
- Q-033=OMP reference：按 D-014 的 raw artifact、capped returned result/preview 与 concise transcript 分层吸收。

## Readiness

- Requirements-grilling state: `COMPLETE`
- Blocking reason: none at requirements frontier；OpenSpec proposal/design/specs/tasks 已完成并通过 strict validation。
- Open material questions: 0
- BUILD readiness: final `test-plan.md` accepted and repository-local BUILD authorized on 2026-07-25；host seam failures remain DEFINE-return gates, and dependency/lockfile、OMP code-copy、live/global/external/cross-repo/Git/release operations retain separate exact approval.
