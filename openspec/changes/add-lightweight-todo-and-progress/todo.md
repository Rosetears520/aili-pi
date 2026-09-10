# TODO：轻量 TODO 与 progress 改进提案

本清单记录当前 Pi 消费 0.4.13 的行动；范围与验证以 test-plan.md 第6节为准，不复制完整实施任务。

## 已完成
- [x] P3 核对规划产物一致性；本 change 的 OpenSpec 严格校验通过，无问题
- [x] P1 编写方案与行为规格 → proposal.md、design.md、specs/lightweight-task-continuity/spec.md
- [x] P2 编写实施任务及聚焦测试计划 → tasks.md、test-plan.md；测试尚未执行

- [x] P4 用户接受 Pi 最终验证计划并授权当前 main 实施及任务隔离提交/push
- [x] C1 核验发布源：Git tag/HEAD 与 npm gitHead 一致，tarball SHA-512 匹配 registry

- [x] C2 同步并适配 0.4.13 固定资源、加载约束、doctor 和运行时提示
- [x] C3 暂存候选9文件85项测试及类型检查通过，生成链验证通过 → pi-0.4.13-verification.md

## 当前
- [ ] C4 检查任务隔离暂存差异，只提交和推送本次改动

## 验证限制
- 真实模型 B01–B11 与重启后的会话加载未验证；40项Skill兼容性等待新revision证据，不属于本次已验证声明。
