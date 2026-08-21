# Test Plan: separate-formal-task-adapter-from-persistent-task

## 已实施接口

| 层级 | 接口 | 位置 |
|---|---|---|
| 单元 | 公开 schema 拒绝 formal 字段；内部 schema 校验保留 | tests/unit/persistent-agent-task.test.ts |
| 集成 | buildFormalTaskDispatch 构造与 fail-closed | tests/integration/formal-orchestration-runtime.test.ts |
| 集成 | 工具注册面 task/formal_task/hub 与文案 | tests/integration/persistent-agent-runtime.test.ts |
| 集成 | formal 分配/保护/hub 延续（可信通道回归） | tests/integration/formal-orchestration-runtime.test.ts |

## 关键用例

1. 公开 `coordinator.submit` 携带 formalContext/continuationAudit → `unknown fields` 拒绝，零分配。
2. `submitTrusted` 走原 formal 校验矩阵（Specialized/async/audit/canonicalRole/writeScope）。
3. `buildFormalTaskDispatch`：有效 ready pair → 请求含 board 生成的 audit（与 continuationAudit() 逐字段相等）、task 文本含 identity/边界行；未知包 / 非 ready / 缺 pair → 明确错误。
4. 注册面：`["task", "formal_task", "hub"]`；task 描述指向 formal_task；formal_task 描述含校验/不回落/ROSE 语义。
5. 既有 formal 分配、保护路径、重启调和、嵌套 formal 重复规则全部经可信通道回归通过。

## 回归命令

```bash
npx vitest run tests/unit/persistent-agent-task.test.ts tests/integration/formal-orchestration-runtime.test.ts tests/integration/persistent-agent-runtime.test.ts tests/unit/formal-orchestration.test.ts tests/unit/formal-task-board-root.test.ts
npm run typecheck
openspec validate separate-formal-task-adapter-from-persistent-task --strict
npm test
```
