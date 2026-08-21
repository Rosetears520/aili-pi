# Test Plan: unify-context-pressure-timing

## 范围

单元/集成层验证 WHEN 复用、HOW 路由、threshold 拦截与 epoch 重置；真实浏览器/长会话验收不在本变更范围（无 UI 面）。

## 已实施接口

| 层级 | 接口 | 位置 |
|---|---|---|
| 单元 | `wireContextPressure` 行为矩阵（stub evaluator） | `tests/unit/context-pressure.test.ts` |
| 单元 | `createAcpPressureEvaluator` 真实 kernel 决策 | `tests/unit/context-pressure.test.ts` |
| 集成 | `createProviderRoutedContextExtension` 三 handler 与 gate 顺序 | `tests/integration/codex-remote-compaction-compat.test.ts` |
| 库存 | vendored 符号/决策专用标记锚点 | `tests/unit/context-upstream-inventory.test.ts` |

## 关键用例

1. Codex + `shouldInject=false` → `ctx.compact` 零调用（用例 1）。
2. Codex + 普通 pressure → `ctx.compact` 恰好一次；同 epoch 重复 `turn_end` 被 in-flight 挡住；`onComplete` 后下一 epoch 重新观察（用例 2）。
3. 80% emergency → 同路径压缩（用例 3）。
4. evaluator 抛错 → 只记诊断不压缩（用例 4）。
5. `session_compact` → reset 调用 + in-flight 清除（用例 5）。
6. gate 矩阵：threshold+Codex 取消；manual/overflow 放行；非 Codex 与无 model 放行（由 ACP 自身取消逻辑接管）（用例 6 + 集成用例 2）。
7. 非 Codex / 无 model 的 `turn_end` 不观察（用例 7）；switch/shutdown reset（用例 8）。
8. 真实 evaluator：首次观察建基线不触发；增长 30K + 可压缩 ~51K（>50K floor，<80%）触发；reset 后回到基线（用例 9）。
9. 集成：`session_before_compact` 共 3 个 handler 且顺序为 ACP → gate → codex-compact；retry 强制 0 不回归。

## 回归命令

```bash
npx vitest run tests/unit/context-pressure.test.ts tests/integration/codex-remote-compaction-compat.test.ts tests/unit/context-upstream-inventory.test.ts tests/unit/context-provider-router.test.ts tests/integration/context-runtime-load.test.ts
npm run typecheck
npm run validate:capabilities
openspec validate unify-context-pressure-timing --strict
npm test
```

## 不验证 / 后续

- 不在 CI 内驱动真实 Pi 会话做端到端压缩（需要真实 provider 凭据）；首次真实 Codex 长会话观察作为发布后人工验收。
- T2/T3 在 Codex 路由上的行为不测试（无 ACP block，构造不出）。
