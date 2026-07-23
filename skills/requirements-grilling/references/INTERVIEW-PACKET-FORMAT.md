# INTERVIEW-PACKET-FORMAT.md

Use this compact reference only when several known independent material blockers make one bounded `interview.md` packet cheaper than separate questions. Include one row per selected blocker and omit empty optional fields; never expand it into a generic coverage form.

```markdown
# 需求拷问包：<change-name>

## 1. 资料来源与证据

| 来源 | 已检查内容 | 观察到的事实 | 置信度 | 备注 |
|---|---|---|---|---|
| `<path>` | 现有实现 / 文档 / 测试 | ... | high / medium / low | ... |

## 2. 当前决策上下文

- 本轮需要解决的材料性决策：
- 为什么这些决策现在阻塞：
- 已确认且直接相关的约束：

## 3. 材料性决策与状态

状态只能使用：`Confirmed by evidence`、`Not applicable`、`Needs question`、`Open Question`、`Unverified`。

`Confirmed by evidence` 只能用于证据已经给出当前决策需要的具体行为、边界、source-of-truth 或明确 owner，以及适用的可测试验收信号。只出现“安全策略 / 幂等 / 回滚 / quota / audit / 清理策略”等词，不算 confirmed。

| 决策 | 为什么会改变 scope / design / tasks / acceptance / verification / risk / terminology / safety | 状态 | 精确证据 / 原因 | 关联问题 | 写回目标 |
|---|---|---|---|---|---|
| <具体决策> | ... | ... | `<path>:<line>` / 用户决定 | Q1 / N/A | `proposal.md` / `design.md` / specs / `tasks.md` / `test-plan.md` |

## 4. 需要你填写的问题

| ID | 问题 | 为什么要问 | 影响的 artifact / decision | 有证据支撑的推荐默认答案 | 后果 / 取舍 | 你的填写 | 写回位置 |
|---|---|---|---|---|---|---|---|
| Q1 | ... | ... | scope / design / tasks / acceptance / tests / risk / implementation safety | ...（证据：`<path>`） | 选 A 会...；选 B 会... |  | `proposal.md` |

只包含已知材料性 blocker。若某个 blocker 是设计漏洞、证据缺口、反例、术语或领域边界问题，把它直接写入对应决策行和问题行，不另建全量检查章节。

## 5. 填写说明

- 可以直接在“你的填写”列里写答案。
- 如果在聊天里回答，模型也必须把问题、答案、分类和写回位置同步写回本文件或约定目标；聊天记录本身不是最终 source of truth。
- 不确定的地方写“不确定”即可。
- 接受推荐默认答案时，写“同意默认”。
- 不进入本次 scope 的内容，写“本次不做”。
- 未填写内容不会被写成事实，只会保留为 `Open Question`。
- 无证据支撑但暂时保留的内容会标为 `Unverified`。
- 只写“按安全策略”“按幂等”“走 quota”“正常回滚”“写 audit”这类泛化答案，不会被当成已确认；需要补充当前决策所需的具体行为、边界、source-of-truth 和可测试验收标准，或在答案吸收记录 / readiness report 里明确标为 waived / accepted `UNVERIFIED`。注意：`WAIVED` 是 readiness/answer disposition，不是决策状态。
- 如果填写内容仍有材料性歧义、互相矛盾、不可测试、与证据冲突、术语冲突或超出 scope，只追问受影响的下一项决策，不启动通用新一轮。

## 6. 后续写回映射

| 用户答案 | 将写回到 | 写回方式 | 写回前门禁 |
|---|---|---|---|
| Q1 | `proposal.md` | scope / non-goal | confirmed / waived / accepted `UNVERIFIED` |

## 7. 答案吸收记录

_用户填写后由模型补充。_

| 问题 | 用户答案 | 分类 | 形成的决策 | 已写回位置 | 剩余不确定 / 追问 |
|---|---|---|---|---|---|
```
