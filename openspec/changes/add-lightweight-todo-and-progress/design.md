## Context

动机见 proposal.md。当前证据：

- `skills/aili-delivery-flow/references/formal-task-board.md` 将 Board 定义为可选笔记；progress 要求自由文本且禁止格式门禁。
- `docs/persistent-agents.md:22-28` 对外声明同一分工。
- `docs/aili-workflows-progress-validation-handoff.md` 记录旧强制 Board 协议的退场和 canonical 上游归属。
- `AGENTS.md` 明确共享治理/skills 归 aili-workflows，当前仓库不允许手改生成快照。

本方案改变的是模型工作纪律，而非创建工具调度协议。上游当前源码及实际安装版本未在本次核验；实施前必须在获得确切目标权限后定位 canonical 源，不能把本地快照等同于上游当前事实。

## Goals / Non-Goals

**Goals:** 一个轻量当前清单、一份简短进展历史；普通任务和正式任务都可用；能够跨轮次恢复；明确失败、阻塞与取消。

**Non-Goals:** 新 TODO 工具、JSON 数据库、事件溯源、Markdown parser、自动调度、OpenSpec 绑定、旧文件批量迁移、自动提交、通过清空列表制造完成。

## Decisions

### D1. 使用 todo.md，而非 formal-task-board.md 或 JSON

名称直接表达用途，Markdown 可用现有读写工具局部更新且方便用户检查。没有程序消费者，因此 JSON 的严格结构不带来对应收益。不新增语法校验；标题和状态文案是推荐样式，非协议。旧名称仅为历史兼容说明，不创建新旧双写。

### D2. 强制的是条件触发后的维护行为，不是文件门禁

规格定义触发条件。正常多步骤工作中必须创建并维护；禁止写入时只在对话中给 TODO 并明确未持久化。权限、目标未解时先解决该问题，不为满足文件规则越权。工具运行时不读取 Board 来决定能否派发，也不新增完成钩子或重试回路。

### D3. TODO 是当前视图；Progress 是精简历史

TODO 原位修改状态，默认只展开当前有用的行动；未来阶段保留高层未完项，勿无限细分工具调用。完成依据不足时补充一句完成条件，简单行动无需字段套餐。已完成行动保持简短，任务结束后留在原处；本方案不授权自动归档或删除。

Progress 只追加有意义的结果、取舍原因、阻塞变化和证据位置。禁止逐工具记账、粘贴原始输出或重复整份清单。不引入行数/token 阈值、自动压缩或删历史机制；恢复时定向读取即可。旧 progress 自由文本继续有效，不要求格式修复。

推荐样式（可自由调整，不是 schema）：

```markdown
# TODO：取消状态修复

## 当前
- [ ] T2 修正取消后的状态显示（关联 tasks.md §2.1）
  完成条件：取消后不再显示 running

## 待办
- [ ] T3 为取消路径补回归测试并运行聚焦检查

## 阻塞
- [ ] T4 真实 CLI 验证：等待明确测试会话权限

## 已完成
- [x] T1 定位状态更新入口 → src/.../runtime.ts
```

对应 progress 示例：

```text
T1：定位到取消结果未进入显示状态更新路径，证据见 src/.../runtime.ts。
T2：已调整该路径。T3 聚焦测试尚未运行，因此不宣称修复已验证。
T4：真实 CLI 验证等待许可；当前仅推进本地已授权的 T3。
```

### D4. 框架中立的路径和任务身份

先用用户指定目录，再用项目已有任务目录约定；已选 OpenSpec change 只是其中一种任务目录。没有约定时推荐 `tasks/<task-slug>/`，仍服从项目 placement 和写权限要求；路径冲突先识别是否同一任务，不能覆盖另一个任务。续接复用路径；没有 OpenSpec 的项目不调用 OpenSpec。本次提案文件仍只在已获准的 change 目录。

### D5. 与范围任务、运行时状态分离

有 tasks.md 时只引用稳定任务编号，展开当前执行细节；不镜像全部任务及其状态。范围任务只有在整体满足时才在原计划勾选。Agent/job/turn 细节留在 Journal；TODO 可以写人读责任说明或证据引用，不复制运行时字段。主模型单写，Worker 不改主模型续接文件。

### D6. 在关键时点工作，而非每轮无条件读写

初始列出；开始/完成/阻塞/范围变化时更新；暂停或最终回复前交代所有未决承诺。一般回合暂停允许 pending，不要求为结束一轮而取消真实剩余任务。恢复先读当前 TODO，按需读 progress，再核验受影响的当前证据；不自动全量重检、不刷新旧授权。

### D7. 参考案例只取有证据支持的模式

- Claude Agent SDK Todo tracking：https://code.claude.com/docs/en/agent-sdk/todo-tracking —— 创建、开始、完成时更新任务状态。
- OpenAI Codex Prompting Guide：https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide —— 收尾对既有承诺交代完成、阻塞或取消；本方案区分任务最终收尾与普通回合暂停。
- Anthropic long-running harness：https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents —— 功能/任务清单与 progress 历史分别持久化。

这些是官方公开项目资料，不代表本方案经过实际模型验证。来源依据本次搜索索引摘要，全文抓取被网络地址策略阻止；不声称核验最新版本全部细节。未复制上游模板/代码，未引入其自动提交、数据库、完整 Task 工具或测试调度策略。采用自有简短文字，不引入第三方代码许可负担；后续若复制源码需另核许可。

## Risks / Trade-offs

- 提示规则不能保证每次模型都遵守 → 使用行为样例验证实际文件变化；不以关键词匹配冒充有效性。
- 强制双文件可能增加写入 → 限定多步骤触发，更新只发生于有意义状态变化。
- 多份状态漂移 → 仅展开当前行动、引用任务编号、禁止镜像任务树。
- “无门禁”被误读为可省略 → 同时写明维护义务与运行时不得校验，两者分层。
- 安装内容与仓库快照不同 → 上游和实际 Pi 加载面分别核对后再声称生效。
- 新通用路径是本提案的可审阅默认，不是本仓库新增目录权限 → 此次不创建 change 之外的 tasks 目录。

## Migration Plan

1. 接受本次最终测试计划并单独授权 BUILD 后，定位并获准操作上游 canonical 仓库；先修改共享治理与续接参考及行为样例。
2. 上游消除“新 Board 可选笔记”与“TODO 必须维护”的冲突，但保留旧文件历史有效、无格式门禁、单写者边界。
3. 获得相应同步/锁文件操作许可后，aili-pi 通过原有生成器消费上游，更新本地提示与文档，不手改生成输出。
4. 两侧各提供识别同一行为契约的证据；仅完成其中一侧不得声称全局生效。
5. 如行为验证失败，停止推广并报告具体失败；回退需恢复 canonical 规则并重新生成，保留用户 TODO/progress，任何写入/版本操作仍需适用批准。不自动回滚或发布。

## Implementation ownership

- ROSE：决策、跨仓库授权核对、结果集成、最终验证与接受请求。
- 上游实现包：`aili.implementer`，仅在上游位置和写权限明确后具备执行条件。
- Pi 消费与提示包：`aili.implementer`，依赖上游已确认产物及精确同步权限。
- 聚焦行为验证包：`aili.test-engineer`，在 test-plan 接受后覆盖声明的场景。

本次不分配上述 BUILD 包、不写上游、不变更依赖/锁文件、不发布。
