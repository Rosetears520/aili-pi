## Why

AILI 已经具备可审计的 persistent `task`/`hub` Agent runtime、20 个 canonical selectors 和正式 OpenSpec lifecycle，但当前上层合同仍把委派描述为 benefit-based 可选优化。即使正式 BUILD 已有 package queue，主 Agent 仍可选择直接完成侦察、实现和测试，而不产生 Agent Owner、dispatch、join、结果证据或 disposition。结果是 Runtime 已经支持多 Agent，工作流却保留了一条更便宜但不透明的“主 Agent 全部自己做”路径。

需要把正式 AILI lifecycle 改成一张可见的 Agent Evidence Graph：ROSE 负责策划、决策、整合和最终验证；有边界的材料执行包默认交给匹配的 Specialized Agent；任务板记录 Owner、依赖、派发、join、实际证据和 ROSE disposition。普通 Pi 工作仍保持直接、轻量和 benefit-based，不因安装 AILI 而被强制多 Agent 化。

## What Changes

- 第一阶段只支持正式 OpenSpec：唯一任务板位于 `openspec/changes/<change-id>/tasks.md`，同 root 的 `progress.txt` 保存追加式执行证据；不创建 `task/<task-id>`、`.aili/tasks/<task-id>`、根目录 `TODO.md` 或隐藏 Todo 数据库。
- 明确区分两条路由：普通 Pi 请求继续使用 benefit-based delegation；进入 IDEATE、DEFINE、BUILD 或 SHIP 后，ROSE 进入 Orchestrator 角色，正式工作按 OpenSpec work packages执行。
- 每个材料工作包必须由 `ROSE` 或 `agent:<canonical-selector>` 拥有。ROSE 独占 lifecycle/change identity、任务分解、依赖、Owner 选择、材料决策、waiver、join、结果检查/disposition、整合、任务板/progress 写入、最终 diff 检查、新鲜验证和阶段 verdict。
- 与 Specialized Agent 职责匹配的有边界材料执行包默认 Agent-owned。`ready` 的 Agent-owned package 必须先派发 exact selector，主 Agent 不得先重复相同 scope；直接执行必须在执行前记录合同允许的具体 waiver 和证据。
- 普通 Pi 继续允许省略 `agent` 后使用 `general`，并保留现有顶层 default-async Runtime 合同；正式 AILI work package 必须显式选择 Specialized selector 和 sync/async 模式，`general` 不作为正式 package 的正常 Owner。
- 依赖当前结果的包显式使用同步派发；只有真正独立、无 scope overlap 且有命名 join point 的包才可异步。所有 join 结果必须被 ROSE 检查和 disposition，之后 dependent package 或 phase gate 才能前进。
- 定义 Markdown task-board v1：稳定 ID、依赖、`Owner`、`Dispatch`、执行模式、join、scope/forbidden scope、验收、期望证据、实际 Evidence、runtime refs、ROSE disposition、blocker/next action，以及 `pending | ready | running | returned | done | blocked | cancelled` 七状态。
- 保持 persistent Runtime 的完整 Agent/job/turn/output/history refs 为默认且唯一正常路径；仅对一个由用户明确接受、exact change-bound 的 bootstrap 迁移，允许诚实记录外部 runner 已暴露的 `agent://` session ref、明确列出 unavailable job/turn/history，并以 append-only `RECONCILED` 记录历史/dispatch-timing限制。该桥接不伪造 refs、不重写历史、不扩展到普通或未来 persistent boards。
- `returned` 只表示 completed/partial 的结构化结果已返回并可检查；worker-blocked、failed、interrupted、unexecuted 或缺少必需 output 的结果进入 `blocked`。只有 ROSE 检查、采纳/整合并取得支持验收的证据后才能置为 `done`；checkbox `[x]` 只与 `done` 同步。
- 从现有 validated RoleProfiles 派生 Agent Catalog 和职责摘要。生命周期 guidance 优先展示当前 phase 推荐角色及 active board 中非终态 Agent Owners；phase routing 不复制 selector description，也不新增角色、工具或权限。
- `task` 的 model-facing metadata 增加编排规则：主 Agent保留决策/整合/最终验证，正式 Agent-owned package先派发，前置结果显式同步，异步必须 join，结果必须检查，跳过必须有 waiver。
- 正式 task item 增加唯一 bounded schema exception：可选 `formalContext: { changeId }`。Runtime只用它精确验证同仓 v1 root并派生owning `tasks.md`/`progress.txt` deny paths；不接受caller paths、不模糊扫描、不注入board正文、不创建phase state。
- 只有 ROSE 可修改当前 `tasks.md`/`progress.txt`。Formal child 的`write`/`edit`在变更前被exact deny；`bash`只有在现有audited permission sandbox可附加exact `denyWrite`时保留，否则对该formal child fail closed不可用。Subagent 只返回canonical structured result和bounded evidence，不得修改lifecycle phase、用户接受状态、ROSE disposition或最终完成状态。
- 阶段完成依赖 evidence graph，而不是 Agent 调用次数：所有 accepted packages 完成，Agent-owned packages 有 refs 或有效 waiver，所有 returned 结果有 disposition，required joins 已关闭，最终 scope 已检查，声明有新鲜验证，材料 delta 与残余 `Unverified` 已处理。
- 保留 legacy OpenSpec checklist：无 v1 marker 的 `tasks.md` 继续由 OpenSpec 处理且不批量重写；显式升级只作用于指定 change。
- `Default | Plan | Build | YOLO`、`/perm`、`Alt+M`、credential denial和普通task权限交集不变；formalContext只增加更严格的owning-board deny，并在无法证明bash exact deny时移除该formal child的bash。

## Capabilities

### New Capabilities

- `file-task-board`: 定义正式 OpenSpec 任务板、Markdown 工作包、七状态、证据/disposition、append-only progress、恢复协调、legacy opt-in 和 validator。
- `agent-dispatch-catalog`: 定义从 canonical RoleProfiles 派生的 Agent Catalog、phase-relevant view、Specialized selector 选择和 task model-facing routing guidance。
- `lifecycle-agent-orchestration`: 定义普通 Pi 与 active AILI lifecycle 的委派优先级、ROSE/Agent 职责、Owner hard dispatch、waiver、sync/async join、结果回收和 evidence-based phase gates。

### Modified Capabilities

<!-- `openspec/specs/` 当前为空；本 change 不声明已发布 capability delta。它消费已完成 change `replace-subagent-runtime-with-persistent-agent-framework` 的 task/hub 与 20-selector Runtime，并仅增加optional formalContext identity/protection input；不改变Agent/job/turn identity、ordinary defaults、permission modes或provider lifecycle。 -->

## Impact

预计影响 canonical `aili-workflows` 的 lifecycle、direct-vs-delegated、implementation-package、task-packet/result 和 task-board references；`aili-pi` 的 pinned workflow snapshot、task model-facing metadata、RoleProfile catalog projection、formal board parser/validator、exact opt-in bootstrap reconciliation、board artifact protection、Agent Journal reconciliation、docs 和 focused tests。

第一阶段明确不包含 informal task root、promotion/supersession、自动 child-context assembly、hidden/fuzzy board lookup、phase UI、`/aili-work` 命令、后台 scheduler、dispatch telemetry 产品面、固定 Agent 调用配额或自动 review swarm。唯一public task schema增量是explicit `formalContext: { changeId }` identity marker。Phase recommendation 是 routing guidance；full selector/description authority仍属于 RoleProfiles。普通 Pi 的 omitted-agent→`general` 与 Runtime default-async 行为不变，AILI lifecycle 通过显式 package contract覆盖默认路径。

共享 workflow 正文仍由 `aili-workflows` 独占；任何跨仓 attachment/write、snapshot/lock 更新、依赖/lockfile、Git、publish 或 release 保留独立精确审批门禁。本 proposal 只授权当前 OpenSpec DEFINE artifacts 的仓库内写入，不授权生产实现或上述操作。
