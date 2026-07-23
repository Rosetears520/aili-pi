# Test Document Template

Use this compact template from `test-document-generator`. Keep the core sections needed by the current acceptance decision and add a conditional section only when it has real rows. Do not emit empty unit/integration/E2E/security/performance matrices, execution ledgers, or defect tables merely because the template names them.

```markdown
# 测试文档：<feature/change-name>

## 0. 文档元信息
- 来源：
- 生成时间：
- 适用版本 / 分支：
- 状态：draft / reviewed / accepted

## 1. 被测对象、目标与边界
- 被测对象：
- 要支持的完成 / 接受 claim：
- In scope：
- Explicitly not run / out of scope：
- 适用假设：

## 2. 需求 / 决策 / 风险追踪
| 需求 / 决策 / 风险 | 来源 | 任务 / Package | 文件 / Artifact | 验证命令 / 检查 | 证据 | 覆盖状态 |
|---|---|---|---|---|---|---|

## 3. 选定验证
| 条件 / Claim | 命令或直接检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|

## 4. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|

## 5. Final acceptance gate
- [ ] 用户明确接受最终测试计划（仅正式 lifecycle 需要）

<!-- 仅在存在真实内容时追加：
## 条件性场景 / 边界 / 权限用例
## 环境与数据
## 手工验收
## 执行记录
## 缺陷与一次修复/复测
## 变更记录
-->
```
