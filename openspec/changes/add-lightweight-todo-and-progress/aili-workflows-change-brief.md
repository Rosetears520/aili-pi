# 上游修改说明：共享轻量 TODO 与 Progress

## 1. 给接手 Agent 的任务

请在 **aili-workflows / rose-aili 的共享源**中落实下述行为：`todo.md` 管当前行动，`progress.txt` 管有价值的进展历史。普通多步骤任务和正式任务都必须维护，不做 Pi 专属，不依赖 OpenSpec。

用户最新方向明确撤回了中途的“Pi 专属”想法；本次文件仅交付上游改动说明。它不是上游写权限、最终测试计划接受、BUILD、提交或发布授权。接手后先读取目标仓库规则、当前源和本说明；依据用户在新会话的确切请求核对实施与操作权限，不把本文件当批准凭据。

本说明在 aili-pi 内落盘，**不是 aili-workflows 本地路径的声明**。上游本地 checkout 位置尚未确认。请在用户选择的真实上游仓库启动，不在 aili-pi 的 skills 快照里修复共享行为。

## 2. 已确定的目标行为

### todo.md：当前工作视图

- 多个需要跟踪的行动、委托、依赖、阻塞或跨轮次工作，以及用户显式要求时，由主模型创建并维护。
- 任务和获准目录确定后，在实质执行前列出可观察的行动；简单问答、无后续的单步任务无需强制建档，用户显式要求除外。
- 原位更新待办、当前、阻塞、完成、取消；不逐轮追加重复清单。
- 行动标题说明可交付结果，不用“看看/修改/测试”这种没有对象的空泛条目。仅在标题不足以判断完成时补一句完成条件。
- 一般突出一个当前主行动；独立并行工作如实显示多个。不要为了看起来串行而隐藏并行。
- 开始、完成、阻塞、范围变化及暂停/收尾前更新。失败或未经检查的 Worker 返回不算完成。
- 阻塞注明原因与下一决策；取消注明原因；未完项保留，不无声删除、不假勾、不为结束一轮而取消真实剩余工作。

### progress.txt：简短有用的历史

- 与 TODO 同样按上述条件创建，由主模型维护。
- 有实质进展、重要取舍、验证结果、阻塞变化或有用的暂停上下文时，简短追加。
- 记录结果、必要原因、证据引用和未验证限制；可以引用 TODO 的行动编号。
- 不记录每次工具调用、不复制完整 TODO/tasks、不保存原始日志或对话转录，不强制时间戳/事件词/字段格式。
- 普通无变化读取不写日志。没有新信息时，暂停前检查清单即可，不机械追加“继续中”。
- 恢复先读所选任务的 TODO，再按需读近期或引用的 Progress；旧证据不能自动变新，历史授权不能续期。不要求全量重读历史。
- 旧 progress 自由文本继续有效；不自动压缩、删除或重写历史，不引入行数/token 阈值和归档机制。

### 两份文件的边界

- `tasks.md` 或其他已接受计划负责范围；TODO 只引用其任务编号并展开当前行动，不镜像完整任务树和状态。
- 没有 tasks.md/OpenSpec 时同样能工作；存在某个 change 目录并不代表用户选择了它。
- 目录优先级：明确用户目标 → 项目既有任务约定 → 无约定时建议仓库内 `tasks/<task-slug>/`。项目规则需要放置批准时服从其规则。两个文件同根，续接复用；不同任务不相互覆盖。
- 禁止写入或工具不可写时，用对话内 TODO 并明确未持久化，不换目录绕过、不假称已保存。普通只读请求不因记录规则获得写权限。
- 主模型单写；Worker 只返回证据，不编辑主任务 TODO/Progress。Journal 继续拥有 Agent/job/turn/settlement 状态，不复制进 Markdown。
- **必须维护是模型纪律，不是文件/格式门禁。** 不新增 parser/schema、派发钩子或重试回路；文件内容不是验收、权限、完成或发布证明。

## 3. 应改哪些上游位置

以下为本地 pinned 证据及共享投影标注指向的候选 canonical 位置，不保证等同于上游当前 HEAD。接手 Agent 必须先定位当前负责源，优先修改现有 owner，避免重复新建规则。

| 位置（相对 aili-workflows 根） | 需要修改的内容 |
|---|---|
| `core/governance/operating-discipline.md` | 核对是否拥有全局多步骤 progress 规则；在其负责位置增加 TODO 的条件强制、两文件分工、关键时点和只读例外，让普通非正式任务也能看到规则。 |
| `core/governance/decision-core.md` | 核对续接/所有权相关规则；仅当实际拥有旧 Board 表述或与新规则冲突时修改，不借机重写审批或调度政策。 |
| `.agents/skills/aili-delivery-flow/references/formal-task-board.md` | 当前最直接的续接 owner。更新为轻量 TODO/Progress 指南，加入示例、触发、恢复、单写者和 legacy 处理；现有引用文件名可以保留，文档标题可改，不要求连带重命名文件。 |
| `.agents/skills/aili-delivery-flow/SKILL.md` | 对齐普通/正式工作共享义务和引用，去掉“新 TODO 可有可无”的含义；保留无 Markdown 门禁。 |
| 同目录 `references/lifecycle.md` | 对齐开始、暂停、恢复、收尾的维护时机；不把工作记录变成第五个流程、验收门或 BUILD 授权。 |
| 同目录 `references/backend-routing.md` | 去掉新 TODO 的 OpenSpec 绑定；明确路径由当前任务拥有者决定，两文件均不进入 OpenSpec 原生验证。 |
| 同目录 `references/artifact-contracts.md` | 明确 tasks/TODO/progress/Journal 分工，避免“所有文件都是完整任务台账”。 |
| 同目录 `references/build-execution-loop.md` | 在实际行动状态变化时维护 TODO，Progress 只追加有用结果；不要每次工具调用写入。 |
| 同目录 `references/implementation-packages.md` | 对齐主模型单写、Worker 返回证据和不镜像 runtime 状态的边界。 |
| 同目录 `references/direct-vs-delegated-work.md` | 仅检查既有 Board 引用是否仍准确，保留派发/waiver 的当前规则，不把 TODO 接管包协议。 |
| `manifests/runtime-projections.json`、`adapters/pi/adapter.json` 及其他实际投影输入/生成器 | 检查共享规则能否进入受支持的实际加载面，使用项目既有生成流程。不写 Pi 专属 TODO 规则；仅在现有投影确需对齐时改输入。 |
| 现有文档与聚焦回归 owner | 更新旧可选 Board 用法及测试预期；保留历史文档，不全仓机械替换名称。 |

不要仅修改某个不常加载的 Skill reference：普通多步骤任务也需要简短、始终可见的共享触发规则；细节和示例仍放在单一参考文档，避免多份长模板。

## 4. 明确不要恢复或引入的东西

- 不恢复旧 `aili-task-board/v1` 协议、状态迁移解析、包字段套餐或 Markdown 验证。
- 不新增 TodoWrite/Task 工具、数据库、MCP、调度器、hash 或自动循环。
- 不更改 sub/hub 参数、Worker 职责、审批/权限边界、OpenSpec 原生 schema。
- 不自动重命名/删除任何已有 formal-task-board.md。新任务写 todo.md；旧任务恢复时根据当前证据取少量相关行动，原 Board 保留为历史。
- 不在 aili-pi 直接编辑 `skills/**`、全局 AGENTS.md 或生成投影冒充上游修复。
- 不自动安装、发布、提交、推送、更新消费者依赖/锁文件；这些需各自精确授权。

## 5. 推荐例子（不是格式协议）

`todo.md`：

```markdown
# TODO：修复取消后的状态显示

## 当前
- [ ] T2 修正取消后的显示结果（关联 tasks.md §2.1，如果存在）
  完成条件：取消后不再显示 running

## 待办
- [ ] T3 补充并运行取消路径回归测试

## 阻塞
- [ ] T4 真实 CLI 验证：等待用户确认测试会话许可

## 已完成
- [x] T1 定位状态更新入口 → src/.../runtime.ts
```

`progress.txt`：

```text
T1：定位到取消结果未进入显示状态更新路径，证据见 src/.../runtime.ts。
T2：已调整显示路径；回归尚未运行，不宣称修复已验证。
T4：真实 CLI 验证等待许可；当前继续已授权的 T3。
```

## 6. 最小验证与交付要求

先按实际修改 owner 选择窄检查，不自动全套测试或审查 swarm。

1. **规则一致性**：全局短规则、参考指南、实际生成/加载内容一致；不能一处要求写 TODO、另一处仍允许省略新任务 TODO。
2. **普通任务真实行为**：无 OpenSpec 情境，模型在执行前建立两文件，关键行动后更新；简单问答不强迫创建。
3. **生命周期状态**：成功、失败、阻塞、取消和暂停均诚实记录；未经检查的 Worker 返回不勾为完成。
4. **记录成本**：无变化工具读不追加 progress；不复制全部 tasks；长历史恢复能定向读取。
5. **边界**：只读情境不落盘；旧 Board 不变；Worker 不写共享文件；缺失/非典型自由文本不会被 runtime 格式门禁拒绝。
6. **加载证据**：说明核验了哪些受支持加载面、来源是什么；未验证的消费者明确列出，不把生成成功说成所有安装已生效。

提示文本命中或静态快照通过只能证明规则存在，不能证明模型行为。使用上游既有可用执行入口观察真实行为；若无入口或无权限，明确行为效果未验证，不为此新建框架或虚构通过率。详细候选场景见同目录 test-plan.md 的 B01–B11，可按上游现有执行方式落地，但不得悄悄削弱覆盖声明。

接手结果请给：实际修改路径、行为摘要、运行的具体检查及结果、未验证面、生成输出来源、后续 aili-pi 需要消费什么。不要自行发布。

## 7. 证据与相关文件

本地提案根（绝对路径）：
`/home/rosetears/code/aili-pi/openspec/changes/add-lightweight-todo-and-progress/`

- `proposal.md`：目标范围。
- `design.md`：设计决策、示例、参考模式与风险。
- `specs/lightweight-task-continuity/spec.md`：行为契约。
- `test-plan.md`：候选行为验证与限制；尚待用户接受，未实际执行。
- `tasks.md`：上游与 Pi 消费的后续依赖任务，不是本说明赋予的执行许可。

本地来源锚点：
- `aili-pi/upstream/aili-workflows.lock.json` 固定 `rose-aili@0.4.8`、commit `a5284ee105a084392a944aee04313dcf7c294a64`，列明 canonical formal-task-board reference。
- `aili-pi/docs/aili-workflows-progress-validation-handoff.md` 记录旧 Board 验证退场与上游负责位置。
- `aili-pi/skills/aili-delivery-flow/references/` 当前快照中的续接表述支持上面的候选修改范围；它不是可直接修复的 owner。
- 共享治理投影标注了 `core/governance/operating-discipline.md`、`core/governance/decision-core.md`、`manifests/runtime-projections.json` 等输入；实际源需在上游确认。

参考模式（只取模式，不复制外部模板/代码）：
- Claude Agent SDK：https://code.claude.com/docs/en/agent-sdk/todo-tracking
- Codex prompting：https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide
- Anthropic long-running harness：https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

公共来源此前仅取得搜索索引摘要，全文抓取被网络策略拦截；本次未进一步联网核验。上游当前 HEAD、本地路径及实际安装加载状态尚未核验。以上限制不能由这份交接文件消除。
