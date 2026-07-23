# Closeout Report Protocol

Use this protocol for the repository-local Markdown document required by SHIP. Write the report body in Chinese unless the active contract explicitly requests another language.

Default locations:

- OpenSpec-backed change: `openspec/changes/<change-id>/ship-closeout.md`
- Non-OpenSpec change: ask for a repository-local path before the final verdict if no approved path exists

# SHIP Closeout Report

## 1. 元信息

- Trace ID:
- Outcome: pass | blocked | needs-review
- Mode / backend:
- Closeout document path:
- Completed scope:
- Changed files:
- BUILD gate status:
- Branch/worktree hygiene status:
- Approval/archive status:

## 2. 变更摘要

- 本次提案/变更实际完成了什么：
- 明确未覆盖或未纳入范围的内容：
- 与原始 proposal / spec / task 的偏差：

## 3. 已实现行为

- 新增、修改或移除的用户可见行为：
- 内部工作流、配置、权限、数据或接口行为变化：
- 回滚或恢复方式（如适用）：

## 4. 对既有功能的影响

- 可能受影响的既有功能：
- 已确认不受影响的功能及证据：
- 影响范围证据锚点：

## 5. 风险评估

### 5.1 回归风险

- 风险：
- 证据 / 缓解：

### 5.2 兼容性风险

- 风险：
- 证据 / 缓解：

### 5.3 安全 / 权限风险

- 风险：
- 证据 / 缓解：

### 5.4 工作流 / 数据丢失 / 运维风险

- 风险：
- 证据 / 缓解：

## 6. Release-blocker audit

- Target / scope:
- Fresh evidence:
- Compact evidence packs:
- Blocking findings:
- Important findings:
- Accepted-risk findings:
- Out-of-scope findings:
- `Unverified` items:

## 7. 分支 / 工作区清理门

- Branch/status inspected:
- Dirty path classification（task-scoped / unrelated-pre-existing / generated-ignored / scratch / unknown）:
- Safe task-owned scratch removed:
- Cleanup proposed / approval required:

## 8. 验证证据

- Verification run:
- Evidence anchors:
- Raw evidence access / rerun commands（prefer rerun commands; redact/exclude secrets and do not create raw artifacts without explicit approval）:
- 未运行的检查及原因：
- 证据新鲜度说明：

## 9. 剩余风险与未验证项

- Remaining risks:
- `Unverified` items:
- 需要人工确认的问题：

## 10. 建议与下一步

- Recommendation: archive | needs repair | needs more verification | accepted risk
- Follow-up package:
- Memory writeback receipt:
- Next steps:
