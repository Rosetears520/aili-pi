# 需求访谈

## 第 1 轮：Active BUILD 所有权

- 日期：2026-08-01
- 模式：Interactive
- 状态：已确认

### 证据与冲突

新 umbrella 的 `tasks.md` 包含 routing、formal-board 和 distribution 实现包。现有 `add-file-task-board` 与 `separate-shared-and-pi-skill-distribution` change 也保留了重叠工作的可执行任务和状态声明。若三者同时 active，会形成重复执行路径以及互相竞争的完成、阻塞和 release 状态。

### 决策问题

哪个 OpenSpec change 负责重叠范围后续的 BUILD 与 release 执行？

候选方案：

1. umbrella 是唯一 BUILD/release owner；两个旧 change 仅保留历史和 capability-source 参考。
2. 两个旧 change 分别执行自己的 packages；umbrella 只协调 upstream prerequisite 与 release gate。
3. 三者都保持 active，并新增去重和状态仲裁合同。

### 已确认答案

用户选择方案 1：`integrate-upstream-formal-agent-protocols` 是重叠范围后续唯一的 BUILD/release owner。`add-file-task-board` 与 `separate-shared-and-pi-skill-distribution` 保留为历史/capability-source 参考，不得独立 dispatch、advance 或 close 重叠 packages。

### 分类与写回

- 分类：material delta
- 原因：该答案改变 task ownership、重复工作防护、状态权威与 release-gate 评估。
- 写回目标：`proposal.md`、`design.md`、`context.md`、`tasks.md`、`specs/upstream-formal-agent-protocol-integration/spec.md`、`test-plan.md`。
- 未授予的权限：该决定不接受 final test plan、不启动 BUILD，也不授权 lockfile、删除、external、Git、publish、release 或真实安装操作。

## Requirements-Grilling 就绪状态

`READY`——当前没有其他 dependency-ready 的材料用户决策。Exact upstream release identity 是证据依赖而不是用户偏好；final test-plan acceptance 与风险操作仍是独立门禁。
