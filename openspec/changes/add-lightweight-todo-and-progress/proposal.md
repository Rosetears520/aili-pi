## Why

现行规则将 formal-task-board.md 降为可选笔记，缺少 TODO 创建、更新和续接要求；progress.txt 虽要求创建，但缺少与当前行动清单的清晰分工。需要恢复可靠、轻量的工作记忆，而不恢复旧 Board 的协议字段、重复台账和校验门禁。

## What Changes

- 为普通多步骤和正式工作引入必须维护的 `todo.md`：当前行动、剩余工作、阻塞及简短完成依据；简单问答和单步任务不强制创建。
- 将 `progress.txt` 定位为简短历史记录，按有意义的进展追加，不复制 TODO、不保存工具流水账。
- 两者属于工作续接机制，不依赖 OpenSpec 命令、目录、任务 schema 或生命周期状态；已有任务目录优先，没有约定时使用仓库内 `tasks/<task-slug>/`。
- 有 `tasks.md` 时，TODO 只引用范围任务并展开当前行动，不复制整棵任务树；没有它时同样独立工作。
- 明确创建、开始、完成、阻塞、范围变化、暂停和恢复时的模型行为；由主模型统一维护，子 Agent 返回证据。
- 对新任务采用 `todo.md`；旧 formal-task-board.md 保持历史笔记，不自动重命名、删除或批量迁移。
- 保留自由文本与原有权限边界：必须维护是模型工作纪律，不是 Markdown schema、工具派发条件、完成证明或新授权来源。

## Capabilities

### New Capabilities

- `lightweight-task-continuity`: 与规划框架无关的轻量 TODO 和 progress 行为、路径选择、生命周期更新、权限例外及单一所有权。

### Modified Capabilities

无；当前 openspec/specs 定向检索未发现 formal-task-board.md 或 progress.txt 对应既有需求。本能力增量定义续接行为，不修改 OpenSpec 原生任务契约。

## Impact

- 主修改归属共享上游 `aili-workflows` / `rose-aili` 的治理源、delivery-flow 及相关续接引用；本仓库仅规划这一跨仓库方向，未获得上游写入或发布权限。
- `aili-pi` 后续消费上游生成物并对齐运行时提示、文档及聚焦回归；禁止手改 skills 快照或生成投影。
- 无新工具、数据库、依赖、调度器或运行时 Journal 替代物；不改变 sub/hub 公共参数。
- 本次只有规划授权；最终测试计划尚待接受，实施、上游操作、依赖/锁文件更新和发布均未授权。
